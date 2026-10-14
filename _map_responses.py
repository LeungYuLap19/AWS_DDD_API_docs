from pathlib import Path
import json
import re
import yaml

here = Path(__file__).resolve().parent
root = here.parent / 'AWS_DDD_API'
spec = yaml.safe_load((here / 'openapi.yaml').read_text(encoding='utf-8'))
responses = json.loads((here / '_responses.json').read_text(encoding='utf-8'))
for path, methods in spec['paths'].items():
    for method, op in methods.items():
        owner = op['x-source-router'].split('/')[1]
        router = (root / op['x-source-router']).read_text(encoding='utf-8')
        route = re.search(r"'" + method.upper() + r" " + re.escape(path) + r"':(?P<body>.*?)(?=\n\s*'(?:GET|POST|PUT|PATCH|DELETE) /|\n};)", router, re.S)
        target = re.search(r"import\('\./operations/([^']+)'\)\s*\.then\(\(m\) => (?:\(ctx\) => )?m\.([\w]+)", route['body']) if route else None
        if not target:
            print(op['operationId'], 'NO ROUTE')
            continue
        filename = root / 'functions' / owner / 'src/operations' / (target[1] + '.ts')
        source = filename.read_text(encoding='utf-8')
        func = target[2]
        match = re.search(r'(?:export )?(?:(?:async )?function |const )' + func + r'\b[\s\S]*?(?=\nexport (?:(?:async )?function |const )|\Z)', source)
        body = match.group() if match else source
        handles = set(re.findall(r'\b(handle\w+)\(', body))
        direct = [r for r in responses if r['file'] == filename.relative_to(root).as_posix() and r['function'] == func]
        service = [r for r in responses if r['file'].startswith('functions/' + owner + '/src/services/') and r['function'] in handles]
        found = direct + service
        print(op['operationId'], func, ','.join(sorted(handles)), ','.join(str(x['status']) + ':' + str(x['dataExpression'])[:30] for x in found) or 'NONE')
