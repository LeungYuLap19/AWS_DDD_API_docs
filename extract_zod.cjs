'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const repo = path.resolve(__dirname, '../AWS_DDD_API');
const ts = require(path.join(repo, 'node_modules/typescript'));
const { z } = require(path.join(repo, 'node_modules/zod'));
const shared = path.join(repo, 'layers/shared-runtime/nodejs/node_modules/@aws-ddd-api/shared');

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@aws-ddd-api/shared/')) {
    const subpath = request.slice('@aws-ddd-api/shared/'.length);
    const direct = path.join(shared, subpath + '.ts');
    return fs.existsSync(direct) ? direct : path.join(shared, subpath, 'index.ts');
  }
  return resolveFilename.call(this, request, parent, ...rest);
};
require.extensions['.ts'] = function (mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  mod._compile(output.outputText, filename);
};

async function main() {
  const schemas = {};
  const failures = {};
  for (const owner of fs.readdirSync(path.join(repo, 'functions'))) {
    const directory = path.join(repo, 'functions', owner, 'src', 'zodSchema');
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory).filter((name) => name.endsWith('.ts') && !['envSchema.ts', 'clientOutboxSchema.ts'].includes(name))) {
      const file = path.join(directory, name);
      const relative = path.relative(repo, file).replaceAll('\\', '/');
      try {
        for (const [exportName, schema] of Object.entries(require(file))) {
          if (!(schema instanceof z.ZodType)) continue;
          const json = z.toJSONSchema(schema, { unrepresentable: 'any', reused: 'inline' });
          delete json.$schema;
          schemas[relative + '#' + exportName] = json;
        }
      } catch (error) {
        failures[relative] = error.message;
      }
    }
  }
  fs.writeFileSync(path.join(__dirname, 'schema-cache.json'), JSON.stringify(schemas, null, 2));
  console.log(JSON.stringify({ schemas: Object.keys(schemas).length, failures }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
