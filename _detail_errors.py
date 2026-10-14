"""Add route-specific HTTP error statuses and errorKey values from reachable source."""

from collections import defaultdict
from pathlib import Path
import json
import os
import re
import yaml

here = Path(__file__).resolve().parent
root = here.parent / 'AWS_DDD_API'
file = here / os.environ.get('OPENAPI_FILE', 'openapi.yaml')
spec = yaml.safe_load(file.read_text(encoding='utf-8'))
calls = json.loads((here / '_calls.json').read_text(encoding='utf-8'))
schema_keys = json.loads((here / '_schema_error_keys.json').read_text(encoding='utf-8'))
schema_components = {re.sub(r'[^A-Za-z0-9_]', '_', name.replace('functions/', '')): name
                     for name in schema_keys}
adjacency = defaultdict(set)
errors = defaultdict(list)
throws = defaultdict(list)
for call in calls:
    source = (call['file'], call['function'])
    if call['kind'] == 'call':
        adjacency[source].add((call['targetFile'], call['target']))
    elif call['kind'] == 'error':
        errors[source].append(call)
    elif call['kind'] == 'throw':
        throws[source].append(call)


def route_target(path, method, operation):
    owner = operation['x-source-router'].split('/')[1]
    router = (root / operation['x-source-router']).read_text(encoding='utf-8')
    match = re.search(r"'" + method.upper() + r" " + re.escape(path) +
                      r"':(?P<body>.*?)(?=\n\s*'(?:GET|POST|PUT|PATCH|DELETE) /|\n};)", router, re.S)
    target = re.search(r"import\('\./operations/([^']+)'\)\s*\.then\(\(m\) => (?:\(ctx\) => )?m\.([\w]+)",
                       match['body']) if match else None
    if not target:
        return None
    source = root / 'functions' / owner / 'src/operations' / (target[1] + '.ts')
    return source.relative_to(root).as_posix(), target[2]


def reachable(start, route_id):
    if not start:
        return set()
    branch = {
        'R134': {'handleDeleteCamera'}, 'R135': {'handlePatchCamera'},
        'R145': {'handleClipPresign', 'handleClipComplete'},
        'R149': {'handleUploadPolicy', 'handleClipComplete'},
        'R150': {'handleUploadPolicy', 'handleClipPresign'},
        'R143': {'handleDeviceHeartbeat'}, 'R146': {'handleGetDeviceMonitoring'},
        'R124': {'handlePatchMonitoringSettings'}, 'R127': {'handlePatchMonitoringSettings'},
        'R125': {'handleGetMonitoringSettings'}, 'R128': {'handleGetMonitoringSettings'},
        'R211': {'handleVerifyContactChallenge'}, 'R213': {'handleVerifyContactChallenge'},
        'R212': {'handleCreateContactChallenge'}, 'R214': {'handleCreateContactChallenge'},
        'R067': {'handleCreateIdentifier'}, 'R068': {'handleListIdentifiers'},
        'R065': {'handleDeletePet'}, 'R066': {'handleUpdatePet'},
        'R070': {'handleWritePedigree'},
        'R071': {'handleReadPedigree'}, 'R072': {'handleReadPedigree'},
        'R073': {'handleWriteSource'},
        'R074': {'handleReadSource'}, 'R075': {'handleReadSource'},
    }.get(route_id, set())
    seen = set()
    pending = [start]
    while pending:
        key = pending.pop()
        if key not in seen:
            seen.add(key)
            pending.extend(target for target in adjacency[key] if target[1] not in branch)
    return seen


def quoted_keys(text):
    return re.findall(r"['\"]([a-z][\w-]*(?:\.[\w-]+)+)['\"]", text or '')


def classify(call, path):
    status, key, source = call.get('status') or '', call.get('errorKey') or '', call.get('sourceCall') or ''
    if status.isdigit() and call['literalKey']:
        return [(status, key)]
    if ('authorizeRequest' in source or key == 'authorization.errorKey') and key.endswith('.errorKey'):
        return [('401', 'common.unauthorized'), ('403', 'common.forbidden')]
    if 'verifyDeviceEvent' in source and key.endswith('.errorKey'):
        return [('401', value) for value in ('device.errors.missingSyncHeaders',
                'device.errors.invalidSignature', 'device.errors.timestampSkew', 'device.errors.nonceReplay')] + [
                ('403', 'device.errors.deviceDisabled')]
    if 'validateHeadObject' in source and key.endswith('.errorKey'):
        return [('409', 'device.errors.clipObjectMissing'), ('409', 'device.errors.clipObjectMismatch')]
    if 'normalizeBatchEvents' in source and key.endswith('.errorKey'):
        return [('400', 'device.errors.invalidEventTimestamp')]
    if 'readTriggerHeaders' in source and key.endswith('.errorKey'):
        return [('401', 'notifications.errors.missingTriggerHeaders')]
    if 'readRefreshTokenFromEvent' in source and key.endswith('.errorKey'):
        return [('401', 'auth.refresh.invalidRefreshTokenCookie'),
                ('401', 'auth.refresh.missingRefreshToken')]
    if key == 'failure.key' and source:
        return [(status, error) for status, error in re.findall(
            r"status:\s*([4-5]\d\d),\s*key:\s*['\"]([^'\"]+)['\"]", source)]
    if 'parseObjectIdParam' in source and key.endswith('.errorKey'):
        return [('400', quoted_keys(source)[0] if quoted_keys(source) else 'common.invalidObjectId')]
    if 'parsePathParam' in source and key.endswith('.errorKey'):
        return [('400', quoted_keys(source)[0] if quoted_keys(source) else 'common.invalidPathParam')]
    if 'parseBody' in source and key.endswith('.errorKey'):
        return [('400', value) for value in dict.fromkeys(
            ['common.invalidBodyParams', 'common.missingBodyParams', *quoted_keys(source)])]
    if 'parseMultipartBody' in source and key.endswith('.errorKey'):
        return [('400', value) for value in dict.fromkeys(['common.invalidBodyParams', *quoted_keys(source)])]
    if status.isdigit() and 'responseKey(scope,' in key:
        suffixes = quoted_keys(key)
        suffix = re.findall(r"['\"]([\w]+)['\"]", key)
        if suffix:
            scope = 'internalMembership' if path.startswith('/internal/') else 'organizationMembership'
            return [(status, f'iam.{scope}.{suffix[-1]}')]
    if status.isdigit() and quoted_keys(key):
        return [(status, value) for value in quoted_keys(key)]
    if '?' in status and '?' in key:
        statuses = re.findall(r'\b[4-5]\d\d\b', status)
        keys = quoted_keys(key)
        if len(statuses) == len(keys):
            return list(zip(statuses, keys))
    return []


def thrown_pair(call):
    cls, args = call['errorClass'], call['arguments']
    if cls == 'LinkAbort' and len(args) > 1:
        status, key = args[0].get('expression'), args[1].get('literal')
    elif cls == 'SelectionError' and args:
        status, key = '400', args[0].get('literal')
    elif len(args) > 1:
        status, key = args[1].get('expression'), args[0].get('literal')
    else:
        return None
    return (status, key) if status and status.isdigit() and key and '.' in key else None


def translations(owner):
    merged = {}
    for locale in (root / 'layers/shared-runtime/nodejs/node_modules/@aws-ddd-api/shared/locales/en.json',
                   root / 'functions' / owner / 'src/locales/en.json'):
        if locale.exists():
            def flatten(prefix, value):
                if isinstance(value, dict):
                    for name, child in value.items():
                        flatten(f'{prefix}.{name}' if prefix else name, child)
                elif isinstance(value, str):
                    merged[prefix] = value
            flatten('', json.loads(locale.read_text(encoding='utf-8')))
    return merged


def request_schema_keys(operation):
    found = set(schema_keys.get(operation.get('x-request-schema-source'), []))
    for content in operation.get('requestBody', {}).get('content', {}).values():
        def visit(node):
            if not isinstance(node, dict):
                return
            ref = node.get('$ref', '').split('/')[-1]
            if ref in schema_components:
                found.update(schema_keys.get(schema_components[ref], []))
            for child in node.get('oneOf', []) + node.get('anyOf', []):
                visit(child)
        visit(content.get('schema'))
    return found


def error_response(status, keys, locale):
    keys = sorted(keys)
    schema = {'type': 'object', 'required': ['success', 'errorKey', 'error'],
              'properties': {
                  'success': {'const': False},
                  'errorKey': {'type': 'string', 'enum': keys,
                               'description': 'Stable key for frontend handling; error text is localized.'},
                  'error': {'type': 'string', 'description': 'Localized human-readable message.'},
                  'requestId': {'type': 'string'},
                  'details': {'type': 'object', 'additionalProperties': True}},
              'additionalProperties': False}
    examples = {key.replace('.', '_'): {'summary': key, 'value': {
        'success': False, 'errorKey': key, 'error': locale.get(key, key)}} for key in keys}
    return {'description': f'HTTP {status}. Possible error keys: ' + ', '.join(keys) + '.',
            'content': {'application/json': {'schema': schema, 'examples': examples}}}


unresolved = []
documented = 0
for path, methods in spec['paths'].items():
    for method, operation in methods.items():
        owner = operation['x-source-router'].split('/')[1]
        by_status = defaultdict(set)
        route_id = operation['operationId']
        path_functions = reachable(route_target(path, method, operation), route_id)
        for entry in path_functions:
            for call in errors[entry]:
                if entry[1] == 'handleContact':
                    if route_id in ('R205', 'R206', 'R215', 'R216') and call['line'] >= 101:
                        continue
                    if route_id in ('R207', 'R208') and call['line'] == 105:
                        continue
                    if route_id in ('R208', 'R210') and call['line'] == 114:
                        continue
                if entry[1] == 'contactOperation' and route_id in ('R205', 'R206', 'R215', 'R216') and call['errorKey'] == 'parsed.errorKey':
                    continue
                if entry[1] == 'mutateCameraOperation' and route_id == 'R135' and call['errorKey'] == 'body.errorKey':
                    continue
                if entry[1] == 'monitoringSettingsOperation' and route_id in ('R124', 'R127') and call['errorKey'] == 'body.errorKey':
                    continue
                if entry[1] == 'petIdentifierOperation':
                    if route_id == 'R067' and call['errorKey'] == 'body.errorKey':
                        continue
                    if route_id == 'R068' and call['errorKey'] == 'common.invalidQueryParams':
                        continue
                if entry[1] == 'mutatePetOperation' and route_id == 'R066' and 34 <= call['line'] <= 48:
                    continue
                if entry[1] in ('pedigreeOperation', 'sourceOperation') and route_id in ('R070', 'R073') and call['errorKey'] == 'body.errorKey':
                    continue
                if entry[1] == 'clipOperation' and call['errorKey'] == 'body.errorKey':
                    source = call.get('sourceCall') or ''
                    if route_id == 'R145' or (route_id == 'R149' and 'clipCompleteSchema' in source) or (route_id == 'R150' and 'clipPresignSchema' in source):
                        continue
                pairs = classify(call, path)
                if not pairs and call.get('errorKey') == 'error.errorKey':
                    pairs = [pair for source in path_functions for thrown in throws[source]
                             if (pair := thrown_pair(thrown))]
                if not pairs:
                    unresolved.append({'id': operation['operationId'], **call})
                for status, key in pairs:
                    by_status[status].add(key)
            for call in throws[entry]:
                pair = thrown_pair(call)
                if pair:
                    by_status[pair[0]].add(pair[1])
        locale = translations(owner)
        if '400' in by_status:
            by_status['400'].update(key for key in request_schema_keys(operation) if key in locale)
        for status, keys in sorted(by_status.items()):
            if status in operation['responses'] and status.startswith('2'):
                continue
            operation['responses'][status] = error_response(status, keys, locale)
            documented += 1
        operation['responses'] = dict(sorted(operation['responses'].items(),
                                            key=lambda item: (0, int(item[0])) if item[0].isdigit() else (1, item[0])))

(here / '_unresolved_errors.json').write_text(json.dumps(unresolved, indent=2), encoding='utf-8')
file.write_text('%YAML 1.2\n---\n' + yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
print('Specific status responses:', documented)
print('Unresolved error call paths:', len(unresolved))
print('Routes with unresolved errors:', len({row['id'] for row in unresolved}))
