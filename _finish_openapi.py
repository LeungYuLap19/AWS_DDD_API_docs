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
operations = {op['operationId']: (path, method, op)
              for path, methods in spec['paths'].items() for method, op in methods.items()}
schemas = spec['components']['schemas']

spec['info']['description'] = (
    f'The {len(operations)} current HTTP operations with PASS verdicts in the migration-preview live results. '
    'Paths, gateway credentials, request validation, and permission keys are checked against current source. '
    'A PASS covers the isolated live route cases; system flows have separate verdicts within their stated scopes. '
    'Deferred and excluded preview/smoke routes are omitted. '
    'Success responses document handler payload fields. Each documented HTTP error status lists the stable '
    'errorKey values emitted by the reachable handler and validation branches; error text is localized. '
    'Gateway-generated responses and upstream provider JSON may have their own contracts.'
)

# Zod coercion/defaults describe parsed values; query parameters describe the incoming URI.
for _, method, op in operations.values():
    for param in op.get('parameters', []):
        if param.get('in') != 'query':
            continue
        param['required'] = False if 'default' in param['schema'] else param['required']
        if param['name'] in ('page', 'limit') and not param['schema'].get('type'):
            param['schema'] = {'type': 'integer', 'minimum': 1}

access_key = next(k for k in json.loads((here / '_schemas.json').read_text(encoding='utf-8'))
                  if k.startswith('functions/iam-policy/') and k.endswith('#accessQuerySchema'))
access_schema = json.loads((here / '_schemas.json').read_text(encoding='utf-8'))[access_key]
for name, schema in access_schema['properties'].items():
    operations['R047'][2].setdefault('parameters', []).append(
        {'name': name, 'in': 'query', 'required': False, 'schema': schema})
for name, maximum, default in [('page', 10000, 1), ('limit', 100, 30)]:
    operations['R177'][2].setdefault('parameters', []).append({
        'name': name, 'in': 'query', 'required': False,
        'schema': {'type': 'integer', 'minimum': 1, 'maximum': maximum, 'default': default}})

operations['R179'][2]['requestBody']['content']['multipart/form-data'] = {
    'schema': {'type': 'object', 'properties': {
        'shopCode': {'type': 'string', 'description': 'Use a code or a PDF file.'},
        'file': {'type': 'string', 'format': 'binary', 'description': 'PDF, at most 5 MiB.'}},
        'anyOf': [{'required': ['shopCode']}, {'required': ['file']}]}}

manual = {
    'R001': ('202', 'channel'), 'R004': ('202', 'channel'), 'R008': ('200', 'scope'),
    'R006': ('200', 'accessToken,refreshToken,id,expiresAt'),
    'R007': ('200', 'accessToken,refreshToken,id,expiresAt'),
    'R005': ('200', 'accessToken,refreshToken,id,expiresAt'),
    'R135': ('200', 'cameraId,deleted'), 'R134': ('200', 'camera'),
    'R182': ('201', 'checkoutId,checkoutToken'), 'R181': ('201', 'checkoutId,checkoutToken'),
    'R183': ('201', 'quoteId'), 'R184': ('200', 'access'),
    'R190': ('200', 'order'), 'R189': ('201', 'payment'),
    'R192': ('200', 'refund'), 'R191': ('200', 'refund'),
    'R193': ('200', ''), 'R194': ('202', 'eventId,deliveryStatus,attempts,replayCount,nextAttemptAt'),
    'R146': ('200', 'enabled,entitlementVersion'),
    'R143': ('200', 'selectedCameraIds,removedCameraIds,unsupportedCameraIds,selectedAiModelKeys,entitlement,entitlementVersion'),
    'R150': ('200', 'status,record_uuid'), 'R149': ('200', 'record_uuid,objects'),
    'R145': ('200', 'enabled,max_uploads_per_run'),
    'R196': ('200', ''), 'R197': ('200', ''), 'R198': ('200', ''),
    'R200': ('200', ''), 'R199': ('201', ''), 'R195': ('200', ''),
    'R203': ('200', ''), 'R126': ('200', 'devices'),
    'R127': ('200', 'selectedAiModelKeys,entitlement'),
    'R128': ('200', 'selectedCameraIds,removedCameraIds,selectedAiModelKeys,entitlement'),
    'R124': ('200', 'selectedAiModelKeys,entitlement'),
    'R125': ('200', 'selectedCameraIds,removedCameraIds,selectedAiModelKeys,entitlement'),
    'R216': ('204', ''), 'R215': ('204', ''),
    'R206': ('200', 'contact'), 'R210': ('200', 'contact'), 'R208': ('200', 'contact'),
    'R205': ('200', 'contact'), 'R209': ('200', 'contact'), 'R207': ('200', 'contact'),
    'R213': ('202', 'channel'), 'R214': ('200', 'channel'),
    'R211': ('202', 'channel'), 'R212': ('200', 'channel'),
    'R202': ('200', ''), 'R201': ('200', ''),
    'R103': ('200', 'ownershipEvents,pagination'),
    'R102': ('200', 'ownershipEvents,pagination'),
    'R104': ('200', 'ownershipEvents,pagination'),
    'R062': ('200', 'pets,pagination'), 'R060': ('200', 'pets,pagination'),
    'R063': ('201', 'pet'), 'R061': ('201', 'pet'),
    'R168': ('200', 'ptags,pagination'), 'R167': ('200', 'ptags,pagination'),
    'R100': ('200', 'recoveryCase'), 'R101': ('200', 'recoveryCase'),
    'R066': ('200', 'petId,revision'), 'R065': ('200', 'pet'),
    'R138': ('200', 'petId,from,to,stats'), 'R139': ('200', 'petId,bucket,points'),
    'R067': ('200', 'identifiers'), 'R068': ('201', 'identifier'),
    'R133': ('200', 'petId,unlinked'), 'R132': ('200', 'petId,cameraId,did,revision'),
    'R070': ('200', 'pedigree,children,pagination,depth'),
    'R072': ('200', 'pedigree'), 'R071': ('201', 'pedigree'),
    'R073': ('200', 'source'), 'R075': ('200', 'source'), 'R074': ('201', 'source'),
    'R169': ('200', 'ptags,pagination'), 'R174': ('200', 'ptag'), 'R173': ('200', 'ptag'),
    'R022': ('200', 'userId,status'), 'R021': ('200', 'userId,status'),
    'R123': ('200', 'devices'), 'R164': ('201', 'subscriptionId'),
}

def target_for(path, method, op):
    owner = op['x-source-router'].split('/')[1]
    router = (root / op['x-source-router']).read_text(encoding='utf-8')
    route = re.search(r"'" + method.upper() + r" " + re.escape(path) + r"':(?P<body>.*?)(?=\n\s*'(?:GET|POST|PUT|PATCH|DELETE) /|\n};)", router, re.S)
    target = re.search(r"import\('\./operations/([^']+)'\)\s*\.then\(\(m\) => (?:\(ctx\) => )?m\.([\w]+)", route['body']) if route else None
    return owner, target[2] if target else None

unresolved = []
for route_id, (path, method, op) in operations.items():
    owner, func = target_for(path, method, op)
    selected = None
    if route_id in manual:
        status, fields = manual[route_id]
        data = {'type': 'object', 'properties': {name: {} for name in fields.split(',') if name},
                'additionalProperties': True} if fields else {}
    else:
        variants = {func, 'handle' + func.removesuffix('Operation')[0].upper() + func.removesuffix('Operation')[1:] if func else None}
        variants |= {'handle' + func[0].upper() + func[1:].removesuffix('Operation')} if func else set()
        candidates = [row for row in rows if row['file'].startswith(f'functions/{owner}/')
                      and row['function'] in variants and row['kind'] == 'successResponse']
        if not candidates:
            unresolved.append((route_id, func))
            continue
        selected = candidates[0]
        status = str(selected['status'])
        if not status.isdigit():
            status = '201' if method == 'post' else '200'
        data = copy.deepcopy(selected['data']) if selected['data'] is not None else {}
        expression = selected.get('dataExpression') or ''
        if not data and '.map(' in expression:
            data = {'type': 'array', 'items': {}}
        elif not data and expression:
            data = {'type': 'object'}
    if status == '204':
        response = {'description': 'No content.'}
    else:
        payload = {'type': 'object', 'required': ['success'], 'properties': {
            'success': {'const': True}, 'message': {'type': 'string'},
            'requestId': {'type': 'string'}, 'data': data}, 'additionalProperties': True}
        response = {'description': op['summary'] + ' succeeded.',
                    'content': {'application/json': {'schema': payload}}}
    op['responses'] = {status: response, '4XX': op['responses']['4XX'],
                       '5XX': op['responses']['5XX']}
    if selected and selected.get('dataExpression') and not data.get('properties') and data.get('type') == 'object':
        data['description'] = 'Shape returned by ' + selected['function'] + ' in ' + selected['file'] + '.'

print('Unresolved', len(unresolved), unresolved)
file.write_text('%YAML 1.2\n---\n' + yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
