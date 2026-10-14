"""Regenerate an ignored OpenAPI draft from the sibling AWS_DDD_API checkout."""

from pathlib import Path
import os
import shutil
import subprocess
import sys

here = Path(__file__).resolve().parent
env = os.environ.copy()
env['OPENAPI_FILE'] = '_draft_openapi.yaml'

for command in (
    ['node', 'extract_zod.cjs'],
    ['node', '_extract_schemas.cjs'],
    ['node', '_scan_responses.cjs'],
    [sys.executable, 'build_openapi.py'],
):
    subprocess.run(command, cwd=here, check=True)

shutil.copyfile(here / '_base_openapi.yaml', here / '_draft_openapi.yaml')
for script in ('_enrich_openapi.py', '_finish_openapi.py', '_correct_responses.py',
               '_postprocess.py', '_detail_responses.py', '_complete_response_fields.py',
               '_detail_errors.py',
               '_validate.py', '_audit_response_coverage.py'):
    subprocess.run([sys.executable, script], cwd=here, env=env, check=True)
draft = here / '_draft_openapi.yaml'
draft.write_bytes(draft.read_bytes().replace(b'\r\n', b'\n'))
print('Draft ready:', here / '_draft_openapi.yaml')
