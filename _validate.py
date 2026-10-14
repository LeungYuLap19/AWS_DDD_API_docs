from pathlib import Path
import os
import re
import yaml

root = Path(__file__).resolve().parent.parent / 'AWS_DDD_API'
spec_file = Path(__file__).with_name(os.environ.get('OPENAPI_FILE', 'openapi.yaml'))
source = spec_file.read_text(encoding='utf-8')
spec = yaml.safe_load(source)
assert source.startswith('%YAML 1.2\n---\n')
assert spec['openapi'] == '3.1.0'
operations = [(path, method, op) for path, methods in spec['paths'].items()
              for method, op in methods.items()]
ids = [op['operationId'] for _, _, op in operations]
assert len(ids) == len(set(ids))
results = (root.parent / '.dev_docs/todo-docs/db-migration/live-tests/01_DETAILED_RESULTS.md').read_text(encoding='utf-8')
passed = {rid: route for rid, route in re.findall(r'^\| (R\d{3}) \| `([^`]+)` \| PASS \|', results, re.M)}
assert passed
assert set(ids) == set(passed), (sorted(set(ids) - set(passed)), sorted(set(passed) - set(ids)))
for path, method, op in operations:
    assert passed[op['operationId']] == f'{method.upper()} {path}'
    assert all(status in op['responses'] for status in ('4XX', '5XX'))
    assert any(status.isdigit() and status.startswith('2') for status in op['responses'])
    exact_errors = [response for status, response in op['responses'].items()
                    if status.isdigit() and status.startswith('4')]
    assert exact_errors, op['operationId']
    for response in exact_errors:
        content = response['content']['application/json']
        keys = content['schema']['properties']['errorKey']['enum']
        assert keys and all(example['value']['errorKey'] in keys
                            for example in content['examples'].values()), op['operationId']
    declared = {param['name'] for param in op.get('parameters', []) if param.get('in') == 'path'}
    assert declared == set(re.findall(r'{([^}]+)}', path)), (op['operationId'], declared)
    seen = [(param.get('in'), param.get('name')) for param in op.get('parameters', []) if 'in' in param]
    assert len(seen) == len(set(seen)), op['operationId']
    assert all(not param.get('required') for param in op.get('parameters', [])
               if param.get('in') == 'query' and param.get('name') in ('page', 'limit', 'search'))

def walk(node):
    if isinstance(node, dict):
        if '$ref' in node:
            value = node['$ref']
            assert value.startswith('#/')
            target = spec
            for token in value[2:].split('/'):
                target = target[token.replace('~1', '/').replace('~0', '~')]
        for value in node.values():
            walk(value)
    elif isinstance(node, list):
        for value in node:
            walk(value)

walk(spec)
by_id = {op['operationId']: op for _, _, op in operations}
def data(route):
    return by_id[route]['responses']['200']['content']['application/json']['schema']['properties']['data']

assert data('R017')['properties']['user']['properties']['avatarUrl']['type'] == ['string', 'null']
assert set(data('R108')['properties']) == {'accessConsents', 'pagination'}
assert set(data('R109')['properties']) == {'accessAgreements', 'pagination'}
assert set(data('R135')['properties']) == {'did', 'detached', 'cameraDeleted',
    'selectionChanged', 'selectedCameraIds', 'petLinksCleared'}
assert '400' not in by_id['R145']['responses']
assert 'camera.errors.sourceChanged' not in by_id['R135']['responses']['409']['content']['application/json']['schema']['properties']['errorKey']['enum']
assert '413' not in by_id['R066']['responses']
for route in ('R205', 'R206', 'R215', 'R216'):
    assert 'common.missingBodyParams' not in by_id[route]['responses']['400']['content']['application/json']['schema']['properties']['errorKey']['enum']
print(f'validated {len(operations)} PASS operations, {len(spec["paths"])} paths, references, parameters, and success statuses')
