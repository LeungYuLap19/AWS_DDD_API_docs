"""Fill response fields whose runtime shape is lost by TypeScript's unknown values."""

from pathlib import Path
import copy
import json
import os
import yaml

here = Path(__file__).resolve().parent
file = here / os.environ.get('OPENAPI_FILE', 'openapi.yaml')
spec = yaml.safe_load(file.read_text(encoding='utf-8'))
cache = json.loads((here / '_schemas.json').read_text(encoding='utf-8'))
operations = {op['operationId']: op for methods in spec['paths'].values() for op in methods.values()}


def resolved(value):
    while '$ref' in value:
        value = spec['components']['schemas'][value['$ref'].split('/')[-1]]
    return value


def slot(route, status, *parts):
    response = operations[route]['responses'][status]
    current = resolved(response['content']['application/json']['schema'])['properties']['data']
    for part in parts:
        current = resolved(current)
        current = current['items'] if part == '[]' else current['properties'][part]
    return current


def put(route, status, parts, value):
    target = slot(route, status, *parts)
    target.clear()
    target.update(copy.deepcopy(value))


string = {'type': 'string'}
boolean = {'type': 'boolean'}
integer = {'type': 'integer'}
datetime = {'type': 'string', 'format': 'date-time'}

for route in ('R005', 'R006', 'R007'):
    put(route, '200', ('expiresAt',), datetime)
put('R059', '200', ('audits', '[]', '_id'), {'type': 'string', 'description': 'MongoDB audit ID.'})
for route in ('R030', 'R031'):
    put(route, '200', ('profile', 'typeProfile', 'ngo', 'placementOptions', '[]', 'positions'),
        {'type': 'array', 'items': string})
for route, status, parts in [
    ('R055', '200', ('organizationDefaults', '[]', 'revision')),
    ('R056', '201', ('organizationDefault', 'revision')),
    ('R057', '200', ('organizationDefault', 'revision')),
    ('R058', '200', ('organizationDefault', 'revision')),
    ('R051', '200', ('roleDefaults', '[]', 'revision')),
    ('R052', '201', ('roleDefault', 'revision')),
    ('R053', '200', ('roleDefault', 'revision')),
    ('R054', '200', ('roleDefault', 'revision')),
    ('R066', '200', ('revision',)),
]:
    put(route, status, parts, {'type': 'string', 'description': 'Decimal revision value.'})
put('R066', '200', ('petId',), string)
put('R133', '200', ('unlinked',), boolean)
put('R163', '200', ('subscriptionId',), string)
put('R135', '200', (), {'type': 'object', 'required': ['did', 'detached', 'cameraDeleted',
    'selectionChanged', 'selectedCameraIds', 'petLinksCleared'], 'properties': {
    'did': string, 'detached': boolean, 'cameraDeleted': boolean,
    'selectionChanged': boolean, 'selectedCameraIds': {'type': 'array', 'items': string},
    'petLinksCleared': integer}})
put('R145', '200', ('enabled',), {'const': True, 'type': 'boolean'})
put('R145', '200', ('max_uploads_per_run',), integer)
put('R146', '200', ('enabled',), {'const': True, 'type': 'boolean'})
put('R150', '200', ('status',), {'const': 'uploaded', 'type': 'string'})
for part in ('from', 'to'):
    put('R138', '200', (part,), datetime)
put('R138', '200', ('stats',), {'type': 'object',
    'required': ['eating', 'drinking', 'moving', 'resting'],
    'properties': {name: integer for name in ('eating', 'drinking', 'moving', 'resting')}})

features = {'type': 'object', 'required': ['dailyBehaviorReminders', 'behaviorTrendRecords',
    'userPrivacyProtection', 'dailyHighlight', 'healthAlerts', 'additionalAiModelAvailable'],
    'properties': {name: boolean for name in ('dailyBehaviorReminders', 'behaviorTrendRecords',
    'userPrivacyProtection', 'dailyHighlight', 'healthAlerts', 'additionalAiModelAvailable')}}
for route in ('R124', 'R125', 'R127', 'R128', 'R143'):
    put(route, '200', ('entitlement', 'features'), features)

# The medical views return the stored details validated by the matching family schema.
families = [('vaccines', 'R077', 'R082', 'R087'),
            ('deworms', 'R078', 'R083', 'R088'),
            ('medicals', 'R079', 'R084', 'R089'),
            ('medications', 'R080', 'R085', 'R090'),
            ('blood-tests', 'R081', 'R086', 'R091')]
for family, list_id, create_id, patch_id in families:
    details = cache[f'functions/pet-medical/src/zodSchema/recordSchemas.ts#create-{family}']['properties']['details']
    put(list_id, '200', ('records', '[]', 'details'), details)
    put(create_id, '201', ('record', 'details'), details)
    put(patch_id, '200', ('record', 'details'), details)

item = cache['functions/commerce-orders/src/zodSchema/checkoutContractSchema.ts#checkoutQuoteItemSchema']
for route in ('R184', 'R187', 'R188'):
    put(route, '200', ('items', '[]'), item)
for route in ('R185', 'R186'):
    put(route, '200', ('[]', 'items', '[]'), item)

pet = {'type': 'object', 'required': ['name'], 'properties': {
    'name': string, 'contact': string}}
payment = {'type': 'object', 'required': ['merchantReference', 'status'], 'properties': {
    'merchantReference': string, 'status': string, 'requestedNetwork': string,
    'providerRequestReference': string, 'resultAt': datetime}}
shipment = {'type': 'object', 'required': ['provider', 'trackingNumber'], 'properties': {
    'provider': {'type': 'string', 'const': 'sf_express'},
    'trackingNumber': string, 'shippedAt': datetime, 'deliveredAt': datetime}}
for route in ('R184', 'R188'):
    for name, shape in [('pet', pet), ('payment', payment), ('shipment', shipment)]:
        put(route, '200', (name,), shape)
for route in ('R185', 'R186'):
    put(route, '200', ('[]', 'payment'), payment)
    put(route, '200', ('[]', 'shipment'), shipment)

camera = {'type': 'object', 'required': ['cameraId', 'did', 'name', 'sourceType',
    'sourceFingerprint', 'sourceRevision', 'deploymentIds'], 'properties': {
    'cameraId': string, 'did': string, 'name': string,
    'sourceType': {'type': 'string', 'enum': ['rtsp', 'xiaomi']},
    'sourceFingerprint': string, 'sourceRevision': integer,
    'deploymentIds': {'type': 'array', 'items': string}}}
for route in ('R129', 'R130', 'R131'):
    put(route, '200', ('cameras', '[]'), camera)
put('R134', '200', ('camera',), camera)

upload_object = {'type': 'object', 'required': ['key', 'url', 'headers',
    'content_type', 'sha256', 'size'], 'properties': {
    'key': string, 'url': {'type': 'string', 'format': 'uri'},
    'headers': {'type': 'object', 'additionalProperties': string},
    'content_type': string, 'sha256': string, 'size': integer}}
put('R149', '200', ('objects',), {'type': 'object', 'required': ['video', 'metadata'],
    'properties': {'video': upload_object, 'metadata': upload_object}})
put('R219', '200', ('uploads', '[]'), {'type': 'object', 'required':
    ['clientId', 'artifactId', 'kind', 'method', 'uploadUrl', 'expiresIn', 'headers'],
    'properties': {'clientId': string, 'artifactId': string,
    'kind': {'type': 'string', 'enum': ['diagnostic_bundle', 'screenshot']},
    'method': {'type': 'string', 'const': 'PUT'},
    'uploadUrl': {'type': 'string', 'format': 'uri'}, 'expiresIn': integer,
    'headers': {'type': 'object', 'additionalProperties': string}}})

service_record = {'type': 'object', 'required': ['serviceId', 'petId', 'organizationId',
    'accessAgreementId', 'service', 'occurredAt', 'completedAt', 'performedBy',
    'status', 'statusChangedAt', 'summary', 'details', 'createdAt', 'updatedAt'],
    'properties': {'serviceId': string, 'petId': string, 'organizationId': string,
    'accessAgreementId': string, 'service': string, 'occurredAt': datetime,
    'completedAt': {'type': ['string', 'null'], 'format': 'date-time'},
    'performedBy': {'type': 'object', 'required': ['userId', 'accountClass', 'organizationId'],
        'properties': {'userId': string, 'accountClass': string,
        'organizationId': {'type': ['string', 'null']}}},
    'status': {'type': 'string', 'enum': ['in_progress', 'completed', 'cancelled']},
    'statusChangedAt': datetime, 'summary': string,
    'details': {'type': ['object', 'null'], 'additionalProperties': True,
        'description': 'Validated client JSON object, at most 16 KiB and six levels deep.'},
    'createdAt': datetime, 'updatedAt': datetime}}
put('R120', '200', ('serviceRecords', '[]'), service_record)
put('R121', '201', ('serviceRecord',), service_record)
put('R122', '200', ('serviceRecord',), service_record)
families_view = {'type': 'object', 'properties': {
    family: copy.deepcopy(slot(route, '200')) for family, route in [
        ('vaccines', 'R077'), ('deworms', 'R078'), ('medicals', 'R079'),
        ('medications', 'R080'), ('blood-tests', 'R081'), ('services', 'R120')]}}
put('R076', '200', ('families',), families_view)

for route in ('R205', 'R206', 'R207', 'R208', 'R209', 'R210'):
    contact = slot(route, '200', 'contact', 'contact')
    for branch in contact['oneOf']:
        if 'membershipId' in branch.get('required', []):
            branch['properties'].pop('email', None)
            branch['properties'].pop('phone', None)
        else:
            branch['properties'].pop('membershipId', None)

for name in ('runtimeSnapshot', 'internalDiagnostics'):
    put('R222', '200', (name,), {'type': 'object', 'additionalProperties': True,
        'description': 'Open diagnostic JSON object; its keys are supplied by the client or support workflow.'})

read_pedigree = copy.deepcopy(slot('R070', '200', 'pedigree'))
read_pedigree['type'] = 'object'
for parent in ('father', 'mother'):
    read_pedigree['properties'][parent]['properties']['pedigree'] = {
        'oneOf': [{'type': 'null'}, {'$ref': '#/components/schemas/PedigreeReadNode'}]}
spec['components']['schemas']['PedigreeReadNode'] = copy.deepcopy(read_pedigree)
for route in ('R070',):
    put(route, '200', ('pedigree',), {
        'oneOf': [{'type': 'null'}, {'$ref': '#/components/schemas/PedigreeReadNode'}]})

write_pedigree = copy.deepcopy(read_pedigree)
write_pedigree['type'] = 'object'
for parent in ('father', 'mother'):
    fields = write_pedigree['properties'][parent]['properties']
    fields.pop('pet', None)
    fields.pop('pedigree', None)
    write_pedigree['properties'][parent]['required'] = [name for name in
        write_pedigree['properties'][parent].get('required', []) if name in fields]
for route, statuses in [('R071', ('200', '201')), ('R072', ('200',))]:
    for status in statuses:
        put(route, status, ('pedigree',), write_pedigree)

source_view = copy.deepcopy(slot('R074', '200', 'source'))
source_view['type'] = 'object'
put('R074', '201', ('source',), source_view)

# SF address payloads are passed through as unknown JSON by the upstream client.
for route, name in [('R195', 'bearerToken'), ('R196', 'areaList'),
                    ('R197', 'netCode'), ('R198', 'addresses')]:
    put(route, '200', (name,), {'description':
        'Provider-defined JSON value returned by SF Express; this API does not validate its fields.'})

file.write_text('%YAML 1.2\n---\n' + yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
print('Applied source-backed response field definitions')
