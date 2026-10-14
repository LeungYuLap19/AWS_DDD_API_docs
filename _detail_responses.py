"""Enrich generated success bodies with the checked TypeScript return types."""

from pathlib import Path
import copy
import json
import os
import re
import yaml

here = Path(__file__).resolve().parent
root = here.parent / 'AWS_DDD_API'
file = here / os.environ.get('OPENAPI_FILE', 'openapi.yaml')
spec = yaml.safe_load(file.read_text(encoding='utf-8'))
rows = json.loads((here / '_responses.json').read_text(encoding='utf-8'))
calls = json.loads((here / '_calls.json').read_text(encoding='utf-8'))
adjacency = {}
for call in calls:
    if call['kind'] == 'call':
        adjacency.setdefault((call['file'], call['function']), set()).add((call['targetFile'], call['target']))


def route_target(path, method, operation):
    owner = operation['x-source-router'].split('/')[1]
    router = (root / operation['x-source-router']).read_text(encoding='utf-8')
    match = re.search(r"'" + method.upper() + r" " + re.escape(path) +
                      r"':(?P<body>.*?)(?=\n\s*'(?:GET|POST|PUT|PATCH|DELETE) /|\n};)", router, re.S)
    target = re.search(r"import\('\./operations/([^']+)'\)\s*\.then\(\(m\) => (?:\(ctx\) => )?m\.([\w]+)",
                       match['body']) if match else None
    if not target:
        return owner, None, None
    source = root / 'functions' / owner / 'src/operations' / (target[1] + '.ts')
    return owner, target[2], source.relative_to(root).as_posix()


def reachable(file_name, function):
    if not file_name or not function:
        return set()
    found = set()
    pending = [(file_name, function)]
    while pending:
        key = pending.pop()
        if key in found:
            continue
        found.add(key)
        pending.extend(adjacency.get(key, ()))
    return found


def detail_count(value):
    if not isinstance(value, dict):
        return 0
    return bool(value.get('type') or value.get('enum') or value.get('const')) + sum(
        detail_count(child) for child in value.get('properties', {}).values()) + detail_count(value.get('items'))


def enrich(existing, inferred):
    if not isinstance(inferred, dict) or not inferred:
        return existing
    if not isinstance(existing, dict) or not existing:
        return copy.deepcopy(inferred)
    if '$ref' in existing:
        key = existing['$ref'].split('/')[-1]
        if key in spec['components']['schemas']:
            enrich(spec['components']['schemas'][key], inferred)
        return existing
    if 'oneOf' in existing or 'anyOf' in existing:
        return existing
    if existing.get('type') and inferred.get('type') and existing['type'] != inferred['type']:
        return existing
    for key in ('type', 'format', 'enum', 'const', 'required'):
        if key not in existing and key in inferred:
            existing[key] = copy.deepcopy(inferred[key])
    if 'properties' in inferred:
        properties = existing.setdefault('properties', {})
        for name, child in inferred['properties'].items():
            properties[name] = enrich(properties.get(name, {}), child)
    if 'items' in inferred:
        existing['items'] = enrich(existing.get('items', {}), inferred['items'])
    return existing


updated = []
unmatched = []
for path, methods in spec['paths'].items():
    for method, operation in methods.items():
        owner, target, source = route_target(path, method, operation)
        path_functions = reachable(source, target)
        candidates = [row for row in rows if row['kind'] == 'successResponse' and row['typedData']
                      and (row['file'], row['function']) in path_functions]
        for status, response in operation['responses'].items():
            if not status.isdigit() or 'content' not in response:
                continue
            data = response['content'].get('application/json', {}).get('schema', {}).get('properties', {}).get('data')
            if data is None:
                continue
            matching = [row for row in candidates if row['status'] == status]
            if not matching and len(candidates) == 1:
                matching = candidates
            if not matching:
                unmatched.append({'id': operation['operationId'], 'status': status, 'owner': owner,
                                  'target': target, 'reachable': len(path_functions),
                                  'candidate': sorted({row['function'] for row in rows
                                                       if row['file'].startswith(f'functions/{owner}/')
                                                       and row['kind'] == 'successResponse'})})
                continue
            if owner == 'pet-access' and '/access-' in path and target.startswith('list'):
                family = path.rsplit('/access-', 1)[-1]
                response_field = {'requests': 'accessRequests', 'consents': 'accessConsents',
                                  'agreements': 'accessAgreements'}.get(family)
                branch = next((row for row in matching if response_field in row['typedData'].get('properties', {})), None)
                if branch:
                    data.clear()
                    data.update(copy.deepcopy(branch['typedData']))
                    updated.append((operation['operationId'], status, branch['file'], branch['function']))
                    continue
            existing_keys = set(data.get('properties', {}))
            aligned = [row for row in matching if existing_keys <= set(row['typedData'].get('properties', {}))]
            best = max(aligned or matching, key=lambda row: detail_count(row['typedData']))
            inferred = copy.deepcopy(best['typedData'])
            if existing_keys and 'properties' in inferred:
                inferred['properties'] = {name: value for name, value in inferred['properties'].items()
                                          if name in existing_keys}
                if 'required' in inferred:
                    inferred['required'] = [name for name in inferred['required'] if name in existing_keys]
            before = detail_count(data)
            enrich(data, inferred)
            if detail_count(data) > before:
                updated.append((operation['operationId'], status, best['file'], best['function']))

file.write_text('%YAML 1.2\n---\n' + yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
print('Detailed success responses:', len(updated))
print('Unmatched success responses:', len(unmatched), unmatched[:30])
(here / '_unmatched_responses.json').write_text(json.dumps(unmatched, indent=2), encoding='utf-8')
