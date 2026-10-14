from pathlib import Path
import json
import os
import yaml

here = Path(__file__).resolve().parent
path = here / os.environ.get('OPENAPI_FILE', 'openapi.yaml')
spec = yaml.safe_load(path.read_text(encoding='utf-8'))
cache = json.loads((here / '_schemas.json').read_text(encoding='utf-8'))
ops = {op['operationId']: op for methods in spec['paths'].values() for op in methods.values()}
schemas = spec['components']['schemas']

def set_success(route_id, status, fields=None, schema=None):
    op = ops[route_id]
    if schema:
        key = next(k for k in cache if k.endswith('#' + schema))
        component = 'Response_' + schema
        schemas[component] = cache[key]
        data = {'$ref': '#/components/schemas/' + component}
    else:
        data = {'type': 'object', 'properties': {f: {} for f in (fields or '').split(',') if f},
                'additionalProperties': True}
    success = {'description': op['summary'] + ' succeeded.',
               'content': {'application/json': {'schema': {'type': 'object',
                   'required': ['success', 'data'], 'properties': {
                       'success': {'const': True}, 'message': {'type': 'string'},
                       'requestId': {'type': 'string'}, 'data': data},
                   'additionalProperties': True}}}}
    old = op['responses']
    op['responses'] = {str(status): success, '4XX': old['4XX'], '5XX': old['5XX']}

for rid, fields in {
    'R040': 'memberships,pagination', 'R041': 'membership', 'R042': 'membership',
    'R043': 'membership', 'R044': 'membership', 'R045': 'membership',
    'R034': 'memberships,pagination', 'R035': 'membership', 'R036': 'membership',
    'R037': 'membership', 'R038': 'membership', 'R039': 'membership',
    'R028': 'organizationId,status', 'R029': 'organizationId,status',
    'R165': 'subscriptionId,status,providerStatus,accessEndsAt',
    'R166': 'subscriptionId,status,providerStatus,accessEndsAt',
    'R163': 'subscriptionId,planCode,status,justStartedTrial',
    'R190': 'orderId,status', 'R191': 'orderId,status', 'R192': 'orderId,status',
    'R195': 'bearerToken', 'R196': 'areaList', 'R197': 'netCode', 'R198': 'addresses',
    'R199': 'orderId,status,provider,trackingNumber,shippedAt,idempotent',
    'R200': 'orderId,status,provider,trackingNumber,shippedAt,deliveredAt,idempotent',
}.items():
    set_success(rid, 201 if rid == 'R199' else 200, fields)

for rid, schema in {
    'R181': 'checkoutDraftSchema', 'R182': 'checkoutDraftSchema',
    'R183': 'checkoutQuoteSchema', 'R189': 'createOrderPaymentDataSchema',
    'R190': 'orderCommandDataSchema', 'R191': 'orderCommandDataSchema',
    'R192': 'orderCommandDataSchema', 'R199': 'shipOrderDataSchema',
    'R200': 'deliverOrderDataSchema',
}.items():
    set_success(rid, 201 if rid in ('R181', 'R182', 'R183', 'R189', 'R199') else 200, schema=schema)

key = next(k for k in cache if k.endswith('#purchaseSubscriptionResponseSchema'))
schemas['Response_purchaseSubscriptionData'] = cache[key]['properties']['data']
set_success('R164', 201, schema='purchaseSubscriptionResponseSchema')
ops['R164']['responses']['201']['content']['application/json']['schema']['properties']['data'] = {
    '$ref': '#/components/schemas/Response_purchaseSubscriptionData'}

for rid in ('R185', 'R186', 'R175', 'R177', 'R159', 'R221'):
    response = next(v for k, v in ops[rid]['responses'].items() if k.isdigit())
    response['content']['application/json']['schema']['properties']['data'] = {'type': 'array', 'items': {}}

for rid in ('R185', 'R186'):
    response = ops[rid]['responses']['200']['content']['application/json']['schema']
    response['properties']['pagination'] = {'type': 'object', 'properties': {
        'page': {'type': 'integer'}, 'limit': {'type': 'integer'},
        'total': {'type': 'integer'}, 'totalPages': {'type': 'integer'}}}

# Payment callbacks intentionally acknowledge with an empty body.
ops['R193']['responses']['200'] = {'description': 'Payment notification acknowledged; no response body.'}

assert all('2XX' not in op['responses'] for op in ops.values())
path.write_text('%YAML 1.2\n---\n' + yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
