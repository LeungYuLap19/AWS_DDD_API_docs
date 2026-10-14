'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../AWS_DDD_API');
const ts = require(path.join(root, 'node_modules/typescript'));
const { z } = require(path.join(root, 'node_modules/zod'));
const shared = path.join(root, 'layers/shared-runtime/nodejs/node_modules/@aws-ddd-api/shared');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@aws-ddd-api/shared/')) {
    const subpath = request.slice('@aws-ddd-api/shared/'.length);
    const direct = path.join(shared, subpath + '.ts');
    return fs.existsSync(direct) ? direct : path.join(shared, subpath, 'index.ts');
  }
  return originalResolve.call(this, request, parent, ...rest);
};
require.extensions['.ts'] = function (mod, file) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  mod._compile(output.outputText, file);
};
const schemas = {};
const failures = {};
for (const owner of fs.readdirSync(path.join(root, 'functions'))) {
  const directory = path.join(root, 'functions', owner, 'src/zodSchema');
  if (!fs.existsSync(directory)) continue;
  for (const name of fs.readdirSync(directory).filter((name) => name.endsWith('.ts') && !['envSchema.ts', 'clientOutboxSchema.ts'].includes(name))) {
    const file = path.join(directory, name);
    const key = path.relative(root, file).replaceAll('\\', '/');
    try {
      for (const [name, schema] of Object.entries(require(file))) {
        if (!(schema instanceof z.ZodType)) continue;
        const json = z.toJSONSchema(schema, { unrepresentable: 'any', reused: 'inline' });
        delete json.$schema;
        schemas[key + '#' + name] = json;
      }
    } catch (error) { failures[key] = error.message; }
  }
}
const medicalFile = path.join(root, 'functions/pet-medical/src/zodSchema/recordSchemas.ts');
const medical = require(medicalFile);
for (const family of ['vaccines', 'deworms', 'medicals', 'medications', 'blood-tests']) {
  for (const action of ['create', 'patch']) {
    const schema = action === 'create' ? medical.createRecordSchema(family) : medical.patchRecordSchema(family);
    const json = z.toJSONSchema(schema, { unrepresentable: 'any', reused: 'inline' });
    delete json.$schema;
    schemas['functions/pet-medical/src/zodSchema/recordSchemas.ts#' + action + '-' + family] = json;
  }
}
fs.writeFileSync(path.join(__dirname, '_schemas.json'), JSON.stringify(schemas, null, 2));
console.log(JSON.stringify({ count: Object.keys(schemas).length, failures }));
