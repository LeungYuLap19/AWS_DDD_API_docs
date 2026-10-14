"""Count unresolved response shapes and generic error responses in the OpenAPI file."""

from collections import Counter
from pathlib import Path
import json
import os
import yaml

spec = yaml.safe_load(Path(__file__).with_name(os.environ.get('OPENAPI_FILE', 'openapi.yaml')).read_text(encoding='utf-8'))
operations = [(operation['operationId'], operation) for methods in spec['paths'].values()
              for operation in methods.values()]


def resolve(value):
    if not isinstance(value, dict) or '$ref' not in value:
        return value
    current = spec
    for segment in value['$ref'][2:].split('/'):
        current = current[segment]
    return current


def gaps(value, path='', seen=frozenset()):
    value = resolve(value)
    if not isinstance(value, dict):
        return []
    if id(value) in seen:
        return []
    seen = seen | {id(value)}
    if not value or value == {'type': 'object'} or value == {'type': 'array', 'items': {}}:
        return [path or '<root>']
    found = []
    for name, child in value.get('properties', {}).items():
        found += gaps(child, f'{path}.{name}' if path else name, seen)
    if value.get('type') == 'array':
        found += gaps(value.get('items', {}), f'{path}[]', seen)
    if isinstance(value.get('additionalProperties'), dict):
        found += gaps(value['additionalProperties'], f'{path}.*', seen)
    for branch in ('oneOf', 'anyOf', 'allOf'):
        for index, child in enumerate(value.get(branch, [])):
            found += gaps(child, f'{path}.{branch}[{index}]', seen)
    return found


all_gaps = Counter()
for route_id, operation in operations:
    for status, response in operation['responses'].items():
        if not status.isdigit() or not isinstance(response, dict):
            continue
        schema = resolve(response).get('content', {}).get('application/json', {}).get('schema')
        if schema:
            for gap in gaps(schema):
                all_gaps[(route_id, status, gap)] += 1

print('operations:', len(operations))
print('routes without exact 4xx statuses:', sum(not any(code.isdigit() and code.startswith('4')
                                                 for code in op['responses']) for _, op in operations))
print('unknown success leaves:', len(all_gaps))
print('routes with unknown success leaves:', len({route for route, _, _ in all_gaps}))
(Path(__file__).with_name('_unknown_responses.json')).write_text(
    json.dumps([{'id': route, 'status': status, 'path': gap} for route, status, gap in all_gaps], indent=2),
    encoding='utf-8')
for route, status, gap in list(all_gaps)[:40]:
    print(route, status, gap)
