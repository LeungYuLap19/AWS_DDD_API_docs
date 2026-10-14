"""Build the tested-route OpenAPI index from the migration gateway and verdicts."""

from collections import OrderedDict
from datetime import date
from pathlib import Path
import argparse
import json
import re

import yaml


ROOT = Path(__file__).resolve().parent.parent / 'AWS_DDD_API'
WORKSPACE = ROOT.parent
LEDGER = WORKSPACE / ".dev_docs/todo-docs/db-migration/live-tests/00_FULL_API_ENDPOINT_LEDGER.md"
RESULTS = WORKSPACE / ".dev_docs/todo-docs/db-migration/live-tests/01_DETAILED_RESULTS.md"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, default=Path(__file__).with_name("_base_openapi.yaml"))
args = parser.parse_args()
OUTPUT = args.output.resolve()
METHODS = {"get", "post", "put", "patch", "delete"}


def route_rows(text):
    return {
        f"{method} {path}": route_id
        for route_id, method, path in re.findall(
            r"^\| (R\d+) \| `(GET|POST|PUT|PATCH|DELETE) (/[^`]+)` \|",
            text,
            re.MULTILINE,
        )
    }


def router_details():
    details = {}
    for router in (ROOT / "functions").glob("*/src/router.ts"):
        source = router.read_text(encoding="utf-8")
        matches = list(re.finditer(r"'(GET|POST|PUT|PATCH|DELETE) (/[^']+)':", source))
        for index, match in enumerate(matches):
            block = source[match.end() : matches[index + 1].start() if index + 1 < len(matches) else len(source)]
            owner = router.parents[1].name
            target = re.search(r"import\('\./operations/([^']+)'\)\.then\(\(m\) => m\.([\w]+)", block)
            before_target = block[: target.start()] if target else block
            permissions = re.findall(r"'([a-z][a-z0-9_.]+)'", before_target)
            details[f"{match[1]} {match[2]}"] = {
                "owner": owner,
                "handler": target[2] if target else None,
                "module": target[1] if target else None,
                "permissions": permissions,
                "router": router.relative_to(ROOT).as_posix(),
            }
    return details


def summary(method, path, handler):
    if handler:
        words = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", re.sub(r"Operation$", "", handler))
        return words[0].upper() + words[1:]
    segments = [segment for segment in path.split("/") if segment and not segment.startswith("{")]
    action = {"get": "Get", "post": "Create", "put": "Set", "patch": "Update", "delete": "Delete"}[method]
    return f"{action} {' '.join(segments[-2:]).replace('-', ' ')}"


def request_schema(detail, available):
    if not detail["module"]:
        return None
    operation = ROOT / "functions" / detail["owner"] / "src/operations" / (detail["module"] + ".ts")
    if not operation.exists():
        return None
    source = operation.read_text(encoding="utf-8")
    body_schemas = set(re.findall(r"parseBody\(\s*ctx\.body(?:\s*\?\?\s*\{\})?\s*,\s*(\w+)", source))
    if len(body_schemas) != 1:
        return None
    schema_name = body_schemas.pop()
    imports = re.findall(r"import\s*\{([^}]+)\}\s*from\s*'([^']+)'", source, re.DOTALL)
    for imported, module in imports:
        if schema_name not in re.findall(r"\b\w+\b", imported):
            continue
        source_path = (operation.parent / (module + ".ts")).resolve()
        if source_path.is_relative_to(ROOT):
            key = source_path.relative_to(ROOT).as_posix() + "#" + schema_name
            if key in available:
                return key
    return None


gateway = yaml.load((ROOT / "template.yaml").read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
gateway_paths = gateway["Resources"]["RestApi"]["Properties"]["DefinitionBody"]["paths"]
ledger = route_rows(LEDGER.read_text(encoding="utf-8"))
result_text = RESULTS.read_text(encoding="utf-8").split("| System flow |", 1)[0]
passed = route_rows("\n".join(line for line in result_text.splitlines() if "| PASS |" in line))
routers = router_details()
schema_cache = json.loads(Path(__file__).with_name("schema-cache.json").read_text(encoding="utf-8"))

gateway_routes = {f"{method.upper()} {path}" for path, operations in gateway_paths.items() for method in operations if method in METHODS}
assert gateway_routes == set(ledger), "Gateway and ledger routes differ"
assert set(passed) <= gateway_routes, "PASS route missing from gateway"
assert set(passed) <= set(routers), "PASS route missing from router"

spec = {
    "openapi": "3.1.0",
    "info": {
        "title": "AWS DDD API — tested migration routes",
        "version": date.today().isoformat(),
        "description": (
            f"The {len(passed)} current HTTP operations with PASS verdicts in the migration-preview live results. "
            "Paths, gateway credentials, and handler permission keys are taken from the current source. "
            "A PASS covers the isolated live route cases; system flows have separate verdicts "
            "within their stated scopes. Deferred and excluded preview/smoke "
            "routes are absent. Request bodies are included where an operation has one "
            "unambiguous Zod schema. Cross-field refinements, query filters, and endpoint-specific response "
            "payloads require further contract documentation from the operations and services."
        ),
    },
    "servers": [{
        "url": "https://{apiId}.execute-api.{region}.amazonaws.com/{stage}",
        "description": "Set these variables to the deployed API Gateway stage.",
        "variables": {
            "apiId": {"default": "your-api-id"},
            "region": {"default": "ap-southeast-1"},
            "stage": {"default": "your-stage"},
        },
    }],
    "tags": [],
    "paths": OrderedDict(),
    "components": {
        "securitySchemes": {
            "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
            "apiKeyAuth": {"type": "apiKey", "in": "header", "name": "x-api-key"},
            "checkoutToken": {"type": "apiKey", "in": "header", "name": "x-checkout-token"},
        },
        "parameters": {
            header: {
                "name": header,
                "in": "header",
                "required": True,
                "description": description,
                "schema": {"type": "string"},
            }
            for header, description in (
                ("x-deployment-id", "Current device deployment identity."),
                ("x-device-id", "Signed device identifier."),
                ("x-timestamp", "Signed request time; server checks the allowed clock window."),
                ("x-nonce", "Unique nonce for replay protection."),
                ("x-signature", "Hex HMAC-SHA256 signature over the canonical request."),
            )
        },
        "schemas": {
            "SuccessEnvelope": {
                "type": "object",
                "required": ["success"],
                "properties": {
                    "success": {"const": True},
                    "message": {"type": "string"},
                    "requestId": {"type": "string"},
                },
                "additionalProperties": True,
            },
            "ErrorEnvelope": {
                "type": "object",
                "required": ["success", "errorKey", "error"],
                "properties": {
                    "success": {"const": False},
                    "errorKey": {"type": "string"},
                    "error": {"type": "string"},
                    "requestId": {"type": "string"},
                    "details": {"type": "object", "additionalProperties": True},
                },
                "additionalProperties": True,
            },
        },
        "responses": {
            "Success": {
                "description": "Successful response. Some operations return an empty body.",
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/SuccessEnvelope"}}},
            },
            "ClientError": {
                "description": "Client or authorization error. API Gateway errors may use its own envelope.",
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorEnvelope"}}},
            },
            "ServerError": {"description": "Server or upstream failure."},
        },
    },
}

tags = set()
used_schemas = {}
for path, operations in gateway_paths.items():
    for method, gateway_operation in operations.items():
        route = f"{method.upper()} {path}"
        if method not in METHODS or route not in passed:
            continue
        detail = routers[route]
        tags.add(detail["owner"])
        gateway_security = {key for requirement in gateway_operation.get("security", []) for key in requirement}
        security = []
        if gateway_security:
            requirement = {}
            if "DddTokenAuthorizer" in gateway_security:
                requirement["bearerAuth"] = []
            if "api_key" in gateway_security:
                requirement["apiKeyAuth"] = []
            security.append(requirement)
        if route in {
            "POST /users/{userId}/commerce/checkouts/drafts",
            "POST /commerce/checkouts/drafts",
            "GET /commerce/checkouts/{checkoutId}",
            "POST /commerce/orders/{orderId}/payments",
            "POST /commerce/orders/{orderId}/cancel",
        }:
            if not security:
                security = [{"checkoutToken": []}]
            else:
                security[0]["checkoutToken"] = []
        operation = {
            "tags": [detail["owner"]],
            "summary": summary(method, path, detail["handler"]),
            "operationId": passed[route],
            "description": f"Migration preview route {passed[route]}; current isolated live API verdict: PASS.",
            "security": security,
            "x-source-router": detail["router"],
            "responses": {
                "2XX": {"$ref": "#/components/responses/Success"},
                "4XX": {"$ref": "#/components/responses/ClientError"},
                "5XX": {"$ref": "#/components/responses/ServerError"},
            },
        }
        if detail["permissions"]:
            operation["x-permission-keys"] = detail["permissions"]
        schema_key = None if method == 'get' or passed[route] in {'R117', 'R101', 'R133'} else request_schema(detail, schema_cache)
        if schema_key:
            component_name = re.sub(r"[^A-Za-z0-9_]", "_", schema_key.replace("functions/", ""))
            used_schemas[component_name] = schema_cache[schema_key]
            operation["requestBody"] = {
                "required": route not in {
                    "POST /auth/tokens/refresh",
                    "POST /auth/sessions/logout",
                    "POST /auth/registrations/organizations/{organizationId}/verify",
                },
                "content": {"application/json": {"schema": {"$ref": f"#/components/schemas/{component_name}"}}},
            }
            operation["x-request-schema-source"] = schema_key
        parameters = [
            {"name": name, "in": "path", "required": True, "schema": {"type": "string"}}
            for name in re.findall(r"\{([^{}]+)\}", path)
        ]
        if detail["owner"] == "device":
            operation["description"] += " Device HMAC signs method, path, query, body hash, and protocol headers."
            parameters.extend(
                {"$ref": f"#/components/parameters/{name}"}
                for name in ("x-deployment-id", "x-device-id", "x-timestamp", "x-nonce", "x-signature")
            )
        if route == "POST /notifications/system/outbox/{outboxId}/trigger":
            operation["description"] += " Trusted trigger; timestamp and signature cover the raw request body."
            parameters.extend([
                {"name": "x-phealthos-timestamp", "in": "header", "required": True, "schema": {"type": "string"}},
                {"name": "x-phealthos-signature", "in": "header", "required": True, "schema": {"type": "string"}},
                {"name": "x-phealthos-trigger-id", "in": "header", "required": False, "schema": {"type": "string"}},
            ])
        if route == "POST /commerce/payments/notify":
            operation["description"] += " PA-SYS form callback; provider signature is checked before applying a payment result."
            operation["requestBody"] = {
                "required": True,
                "content": {"application/x-www-form-urlencoded": {"schema": {
                    "$ref": "#/components/schemas/PaymentNotification"
                }}},
            }
            used_schemas["PaymentNotification"] = schema_cache[
                "functions/commerce-payments/src/zodSchema/paymentCallbackSchema.ts#paymentNotificationSchema"
            ]
            operation["responses"]["200"] = {"description": "Callback accepted; empty response body."}
        if parameters:
            operation["parameters"] = parameters
        spec["paths"].setdefault(path, OrderedDict())[method] = operation

spec["tags"] = [{"name": tag} for tag in sorted(tags)]
spec["components"]["schemas"].update(used_schemas)
yaml.SafeDumper.add_representer(OrderedDict, yaml.representer.SafeRepresenter.represent_dict)
OUTPUT.write_text("%YAML 1.2\n---\n" + yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=110), encoding="utf-8")
print(f"Wrote {len(passed)} operations across {len(spec['paths'])} paths with {len(used_schemas)} request schemas to {OUTPUT}")
