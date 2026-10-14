from pathlib import Path
import json
import re
import yaml

root = Path(__file__).resolve().parent.parent / 'AWS_DDD_API'
spec = yaml.safe_load(Path(__file__).with_name('openapi.yaml').read_text(encoding='utf-8'))
cache = json.loads(Path(__file__).with_name('_schemas.json').read_text(encoding='utf-8'))
for path, methods in spec['paths'].items():
    for method, operation in methods.items():
        if 'requestBody' in operation and method != 'get':
            continue
        router = root / operation['x-source-router']
        owner = router.parents[1].name
        source = router.read_text(encoding='utf-8')
        match = re.search(r"'" + method.upper() + r" " + re.escape(path) + r"':(?P<body>.*?)(?=\n\s*'(?:GET|POST|PUT|PATCH|DELETE) /|\n};)", source, re.S)
        target = re.search(r"import\('\./operations/([^']+)'\)\.then\(\(m\) => m\.([\w]+)", match['body']) if match else None
        if not target:
            print(operation['operationId'], method, path, 'NO TARGET')
            continue
        file = root / 'functions' / owner / 'src/operations' / (target[1] + '.ts')
        body = file.read_text(encoding='utf-8') if file.exists() else ''
        schemas = re.findall(r'\b(?:parseBody\([^,]+,\s*|([A-Za-z]\w+Schema)\.safeParse\()', body)
        names = sorted(set(re.findall(r'\b[A-Za-z]\w*Schema\b', body)))
        if method == 'get':
            queries = sorted(set(re.findall(r'(\w+Schema)\.safeParse\(ctx\.event\.queryStringParameters', body)))
            print(operation['operationId'], method, path, target[2], ','.join(queries or names))
        else:
            print(operation['operationId'], method, path, target[2], ','.join(names))
