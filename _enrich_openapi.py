from pathlib import Path
import json
import os
import re
import yaml

here = Path(__file__).resolve().parent
file = here / os.environ.get('OPENAPI_FILE', 'openapi.yaml')
spec = yaml.safe_load(file.read_text(encoding='utf-8'))
cache = json.loads((here / '_schemas.json').read_text(encoding='utf-8'))
operations = {operation['operationId']: operation for methods in spec['paths'].values() for operation in methods.values()}
components = spec['components']['schemas']


def schema_ref(owner, name):
    matches = [key for key in cache if key.startswith(f'functions/{owner}/') and key.endswith('#' + name)]
    if len(matches) != 1:
        raise ValueError(f'Expected one schema for {owner} {name}, found {matches}')
    key = matches[0]
    component = re.sub(r'[^A-Za-z0-9_]', '_', key.replace('functions/', ''))
    components[component] = cache[key]
    return {'$ref': '#/components/schemas/' + component}


def body(ids, owner, name, required=True):
    ref = schema_ref(owner, name)
    for route_id in ids.split():
        operation = operations[route_id]
        if 'requestBody' in operation:
            raise ValueError(f'{route_id} already has a body')
        operation['requestBody'] = {'required': required, 'content': {'application/json': {'schema': ref}}}


def query(ids, owner, name):
    ref = schema_ref(owner, name)
    schema = components[ref['$ref'].split('/')[-1]]
    if schema.get('type') != 'object':
        raise ValueError(f'Query schema is not an object: {owner} {name}')
    for route_id in ids.split():
        operation = operations[route_id]
        for field, field_schema in schema.get('properties', {}).items():
            operation.setdefault('parameters', []).append({
                'name': field, 'in': 'query', 'required': field in schema.get('required', []),
                'schema': field_schema,
            })


body('R134', 'camera', 'cameraPatchSchema')
body('R129 R130', 'camera', 'cameraRegisterRequestSchema')
body('R178', 'commerce-catalog', 'createProductBodySchema')
body('R180', 'commerce-catalog', 'updateProductBodySchema')
body('R148', 'device', 'behaviorBatchSchema')
operations['R148']['requestBody']['content']['application/json']['schema'] = {
    'oneOf': [schema_ref('device', 'behaviorBatchSchema'), schema_ref('device', 'behaviorSummaryBatchSchema')]
}
body('R149', 'device', 'clipPresignSchema')
body('R150', 'device', 'clipCompleteSchema')
body('R068', 'pet-profile', 'createIdentifierBodySchema')
body('R069', 'pet-profile', 'updateIdentifierBodySchema')
body('R195', 'logistics', 'getTokenSchema', required=False)
body('R196', 'logistics', 'getAreaSchema')
body('R197', 'logistics', 'getNetCodeSchema')
body('R198', 'logistics', 'getPickupLocationsSchema')
body('R207', 'notifications', 'userContactPutSchema')
body('R208', 'notifications', 'organizationContactPutSchema')
body('R209', 'notifications', 'userContactPatchSchema')
body('R210', 'notifications', 'organizationContactPatchSchema')
body('R211 R213', 'notifications', 'createContactChallengeBodySchema')
body('R212 R214', 'notifications', 'verifyContactChallengeBodySchema')
body('R066', 'pet-profile', 'deletePetBodySchema')
body('R065', 'pet-profile', 'updatePetBodySchema')
components['PetUpdateMultipart'] = {
    'type': 'object', 'required': ['payload', 'photos'],
    'properties': {
        'payload': {'type': 'string', 'description': 'JSON encoded updatePetMultipartBodySchema payload.'},
        'photos': {'type': 'array', 'minItems': 1, 'maxItems': 3, 'items': {'type': 'string', 'format': 'binary'}},
    },
}
operations['R065']['requestBody']['content']['multipart/form-data'] = {
    'schema': {'$ref': '#/components/schemas/PetUpdateMultipart'}
}
body('R071', 'pet-profile', 'putPedigreeBodySchema')
body('R072', 'pet-profile', 'patchPedigreeBodySchema')
body('R121', 'pet-access', 'createServiceRecordSchema')
body('R122', 'pet-access', 'patchServiceRecordSchema')
body('R160', 'commerce-subscriptions', 'createPlanBodySchema')
body('R161', 'commerce-subscriptions', 'updatePlanBodySchema')
body('R164', 'commerce-subscriptions', 'purchaseSubscriptionRequestSchema')
body('R165 R166', 'commerce-subscriptions', 'cancelSubscriptionRequestSchema')
for family, create_id, patch_id in [
    ('vaccines', 'R082', 'R087'), ('deworms', 'R083', 'R088'),
    ('medicals', 'R084', 'R089'), ('medications', 'R085', 'R090'),
    ('blood-tests', 'R086', 'R091'),
]:
    for action, route_id in [('create', create_id), ('patch', patch_id)]:
        key = 'functions/pet-medical/src/zodSchema/recordSchemas.ts#' + action + '-' + family
        name = 'PetMedical_' + action + '_' + family.replace('-', '_')
        components[name] = cache[key]
        operations[route_id]['requestBody'] = {
            'required': True,
            'content': {'application/json': {'schema': {'$ref': '#/components/schemas/' + name}}},
        }

components['ClientArtifactReference'] = {
    'type': 'object', 'required': ['s3Key'], 'additionalProperties': False,
    'properties': {'s3Key': {'type': 'string', 'minLength': 1, 'maxLength': 1024},
                   'filename': {'type': 'string', 'maxLength': 255}},
}
components['ClientOutboxRequest'] = {
    'type': 'object', 'required': ['phoneNumber', 'clientName'], 'additionalProperties': False,
    'properties': {
        'phoneNumber': {'type': 'string', 'pattern': r'^\+[1-9]\d{1,14}$'},
        'clientName': {'type': 'string', 'maxLength': 120},
        'petName': {'type': 'string', 'maxLength': 120},
        'language': {'type': 'string', 'enum': ['en', 'zh'], 'default': 'en'},
        'message': {'type': 'string', 'maxLength': 1024},
        'report': {'$ref': '#/components/schemas/ClientArtifactReference'},
        'clip': {'$ref': '#/components/schemas/ClientArtifactReference'},
    },
    'anyOf': [{'required': ['message']}, {'required': ['report']}, {'required': ['clip']}],
    'description': 'petName is required when report or clip is supplied.',
}
components['ClientArtifactPresignRequest'] = {
    'type': 'object', 'required': ['files'], 'additionalProperties': False,
    'properties': {
        'files': {'type': 'array', 'minItems': 1, 'maxItems': 2, 'items': {
            'type': 'object', 'required': ['type', 'contentType', 'fileSize'], 'additionalProperties': False,
            'properties': {
                'type': {'type': 'string', 'enum': ['document', 'video']},
                'contentType': {'type': 'string', 'minLength': 1},
                'fileSize': {'type': 'integer', 'minimum': 1},
                'filename': {'type': 'string', 'maxLength': 255},
            },
        }},
        'expiresIn': {'type': 'integer', 'minimum': 1},
    },
    'description': 'At most one file of each type; MIME type and size are checked against server policy.',
}
for route_id, component in [('R217', 'ClientOutboxRequest'), ('R218', 'ClientArtifactPresignRequest')]:
    operations[route_id]['requestBody'] = {
        'required': True,
        'content': {'application/json': {'schema': {'$ref': '#/components/schemas/' + component}}},
    }

query('R016', 'iam-user', 'listUsersQuerySchema')
query('R025', 'iam-organization', 'listOrganizationsQuerySchema')
query('R040 R034', 'iam-membership', 'listMembershipsQuerySchema')
query('R046', 'iam-policy', 'listPermissionsQuerySchema')
query('R051', 'iam-policy', 'listRoleDefaultsQuerySchema')
query('R055', 'iam-policy', 'listOrganizationDefaultsQuerySchema')
query('R059', 'iam-policy', 'listAuditsQuerySchema')
query('R060 R062', 'pet-profile', 'listPetsQuerySchema')
query('R076 R077 R078 R079 R080 R081', 'pet-medical', 'medicalListQuerySchema')
query('R096', 'pet-recovery', 'recoveryListQuerySchema')
query('R097', 'pet-recovery', 'petRecoveryListQuerySchema')
query('R102 R103 R104', 'pet-ownership', 'historyQuerySchema')
query('R107 R108 R109 R110 R111 R112 R113 R114 R115 R120', 'pet-access', 'accessListQuerySchema')
query('R138', 'pet-behavior', 'behaviorSummaryQuerySchema')
query('R139', 'pet-behavior', 'behaviorTimelineQuerySchema')
query('R070', 'pet-profile', 'readPedigreeQuerySchema')
query('R167 R168 R169', 'ptag', 'listPtagsQuerySchema')
query('R186 R185', 'commerce-orders', 'userOrderListOptionsSchema')
query('R221', 'support', 'bugReportListQuerySchema')
query('R201 R202', 'notifications', 'inboxQuerySchema')

file.write_text('%YAML 1.2\n---\n' + yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
print('request bodies', sum('requestBody' in op for op in operations.values()))
print('query operations', sum(any(p.get('in') == 'query' for p in op.get('parameters', [])) for op in operations.values()))
