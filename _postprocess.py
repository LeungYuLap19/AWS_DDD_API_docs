from pathlib import Path
import copy
import os
import yaml

file = Path(__file__).with_name(os.environ.get('OPENAPI_FILE', 'openapi.yaml'))
spec = yaml.safe_load(file.read_text(encoding='utf-8'))
ops = {op['operationId']: op for methods in spec['paths'].values() for op in methods.values()}

for op in ops.values():
    for param in op.get('parameters', []):
        if param.get('in') == 'query' and param['name'] in ('page', 'limit', 'search'):
            param['required'] = False

for rid in ('R201', 'R202'):
    envelope = ops[rid]['responses']['200']['content']['application/json']['schema']
    envelope['properties']['data'] = {'type': 'array', 'items': {'type': 'object'}}
    envelope['properties']['pagination'] = {'type': 'object', 'properties': {
        'page': {'type': 'integer'}, 'limit': {'type': 'integer'},
        'total': {'type': 'integer'}, 'totalPages': {'type': 'integer'}}}

ops['R203']['responses']['200']['content']['application/json']['schema']['properties'].pop('data')

for rid, primary, secondary in (
    ('R199', '201', '200'), ('R061', '201', '200'), ('R063', '201', '200'),
    ('R071', '201', '200'), ('R074', '201', '200'),
    ('R019', '200', '202'), ('R211', '202', '200'), ('R213', '202', '200')):
    ops[rid]['responses'][secondary] = copy.deepcopy(ops[rid]['responses'][primary])
    ops[rid]['responses'][secondary]['description'] = (
        'Existing or repeated request succeeded.' if secondary == '200' else
        'Challenge accepted for asynchronous delivery.')

product = {'type': 'object', 'required': ['productId', 'name', 'deliveryCharge', 'options', 'tiers', 'revision'],
           'properties': {
               'productId': {'type': 'string'}, 'name': {'type': 'string'},
               'deliveryCharge': {'type': 'number'},
               'options': {'type': 'object', 'properties': {
                   'sizes': {'type': 'array', 'items': {}}, 'colours': {'type': 'array', 'items': {}}}},
               'tiers': {'type': 'array', 'items': {'type': 'object', 'properties': {
                   'type': {'type': 'string'}, 'price': {'type': 'number'}}}},
               'revision': {'type': 'string'}, 'createdAt': {'type': ['string', 'null'], 'format': 'date-time'},
               'updatedAt': {'type': ['string', 'null'], 'format': 'date-time'}}}
spec['components']['schemas']['PtagProductView'] = product
for rid in ('R176', 'R178', 'R180'):
    ops[rid]['responses'][next(k for k in ops[rid]['responses'] if k.isdigit())]['content']['application/json']['schema']['properties']['data'] = {
        '$ref': '#/components/schemas/PtagProductView'}
ops['R175']['responses']['200']['content']['application/json']['schema']['properties']['data'] = {
    'type': 'array', 'items': {'$ref': '#/components/schemas/PtagProductView'}}

core = {'orderReference': {'type': 'string'}, 'purchaseType': {'const': 'physical_order'},
        'status': {'type': 'string'}, 'pricing': {'type': 'object'},
        'items': {'type': 'array', 'items': {'type': 'object'}},
        'createdAt': {'type': ['string', 'null'], 'format': 'date-time'},
        'updatedAt': {'type': ['string', 'null'], 'format': 'date-time'}}
public = {'type': 'object', 'properties': {'access': {'const': 'public'}, **core,
    'payment': {'type': 'object', 'properties': {'status': {'type': 'string'}}},
    'shipment': {'type': 'object', 'properties': {'provider': {'const': 'sf_express'},
       'status': {'type': 'string'}, 'shippedAt': {'type': 'string', 'format': 'date-time'},
       'deliveredAt': {'type': 'string', 'format': 'date-time'}}}}}
owned = {'type': 'object', 'properties': {'access': {'type': 'string', 'enum': ['owner', 'checkout']},
    'orderId': {'type': 'string'}, 'checkoutId': {'type': 'string'}, 'quoteId': {'type': 'string'},
    **core, 'customer': {'type': 'object'}, 'shipping': {'type': 'object'},
    'pet': {'type': 'object'}, 'ptags': {'type': 'array', 'items': {'type': 'object'}},
    'payment': {'type': 'object'}, 'shipment': {'type': 'object'}}}
spec['components']['schemas']['PublicOrderView'] = public
spec['components']['schemas']['OwnedOrderView'] = owned
for rid, name in [('R187', 'PublicOrderView'), ('R188', 'OwnedOrderView'), ('R184', 'OwnedOrderView')]:
    ops[rid]['responses']['200']['content']['application/json']['schema']['properties']['data'] = {
        '$ref': '#/components/schemas/' + name}
for rid in ('R185', 'R186'):
    ops[rid]['responses']['200']['content']['application/json']['schema']['properties']['data']['items'] = {
        'type': 'object', 'properties': {'orderId': {'type': 'string'}, **core}}

for key in ('iam_auth_src_zodSchema_challengeBodySchema_ts_createChallengeBodySchema',
            'iam_auth_src_zodSchema_challengeBodySchema_ts_verifyChallengeBodySchema'):
    spec['components']['schemas'][key]['oneOf'] = [
        {'required': ['email'], 'not': {'required': ['phone']}},
        {'required': ['phone'], 'not': {'required': ['email']}},
    ]

for rid, note in {
    'R001': 'Supply exactly one of email or phone. The response does not reveal whether an account exists.',
    'R002': 'Supply the same destination and its one-time code. Exactly one of email or phone is accepted.',
    'R005': 'A browser can use the refresh cookie; the body token is for the supported non-cookie transport.',
    'R008': 'With no body, the refresh cookie identifies the session; a body token is supported for non-cookie clients.',
    'R183': 'The server calculates the quote and returns the checkout token needed for draft, detail, payment, and cancellation.',
    'R187': 'Public order reference returns sanitized detail, without the private owner or payment projection.',
    'R190': 'The checkout token must be supplied in x-checkout-token; cancellation is allowed before payment begins.',
    'R189': 'The checkout token must be supplied in x-checkout-token; the request body cannot replace it.',
    'R171': 'Public PTag lookup returns an allowlisted pet projection.',
}.items():
    ops[rid]['description'] += ' ' + note

spec['components']['schemas'].pop('Response_purchaseSubscriptionResponseSchema', None)
assert all('2XX' not in op['responses'] for op in ops.values())
file.write_text('%YAML 1.2\n---\n' + yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=110), encoding='utf-8')
