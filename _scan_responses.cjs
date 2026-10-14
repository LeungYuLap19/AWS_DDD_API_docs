'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../AWS_DDD_API');
const ts = require(path.join(root, 'node_modules/typescript'));
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const rows = [];
const calls = [];
const schemaKeys = {};

function validationKeys(node, source, seen = new Set()) {
  const keys = new Set();
  function visit(current) {
    if (ts.isStringLiteral(current) && /^[a-z][\w-]*(?:\.[\w-]+)+$/.test(current.text)) keys.add(current.text);
    if (ts.isIdentifier(current)) {
      const symbol = checker.getSymbolAtLocation(current);
      const declaration = symbol?.declarations?.find((item) => ts.isVariableDeclaration(item) && item.initializer && item.getSourceFile() === source);
      if (declaration && !seen.has(declaration)) {
        seen.add(declaration);
        visit(declaration.initializer);
      }
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return [...keys];
}

function visitFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visitFiles(file);
    else if (entry.name.endsWith('.ts') && file.includes(path.sep + 'src' + path.sep)) scan(file);
  }
}

function nameOf(property) {
  return property.name?.getText().replace(/^['"]|['"]$/g, '') ?? null;
}

function shape(expression) {
  if (!expression) return {};
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) return shape(expression.expression);
  if (ts.isObjectLiteralExpression(expression)) {
    const properties = {};
    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) properties[nameOf(property)] = shape(property.initializer);
      else if (ts.isShorthandPropertyAssignment(property)) properties[nameOf(property)] = {};
    }
    return { type: 'object', properties, additionalProperties: true };
  }
  if (ts.isArrayLiteralExpression(expression)) return { type: 'array', items: expression.elements.length ? shape(expression.elements[0]) : {} };
  if (ts.isStringLiteral(expression) || ts.isTemplateExpression(expression)) return { type: 'string' };
  if (ts.isNumericLiteral(expression)) return { type: 'number' };
  if (expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword) return { type: 'boolean' };
  if (expression.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' };
  if (ts.isCallExpression(expression) && expression.expression.getText().endsWith('.map')) {
    const callback = expression.arguments[0];
    if (callback && ts.isArrowFunction(callback)) return { type: 'array', items: shape(callback.body) };
  }
  return {};
}

function typedShape(type, node, depth = 0, seen = new Set()) {
  if (!type || depth > 6 || type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return {};
  if (type.flags & ts.TypeFlags.StringLiteral) return { type: 'string', const: type.value };
  if (type.flags & ts.TypeFlags.NumberLiteral) return { type: 'number', const: type.value };
  if (type.flags & ts.TypeFlags.BooleanLiteral) return { type: 'boolean', const: type.intrinsicName === 'true' };
  if (type.isUnion()) {
    const parts = type.types.filter((part) => !(part.flags & ts.TypeFlags.Undefined));
    const nullable = parts.some((part) => part.flags & ts.TypeFlags.Null);
    const values = parts.filter((part) => !(part.flags & ts.TypeFlags.Null));
    if (values.every((part) => part.isLiteral()) && values.length) {
      const literals = values.map((part) => part.value ?? (part.intrinsicName === 'true'));
      return { type: typeof literals[0], enum: [...literals, ...(nullable ? [null] : [])] };
    }
    if (values.length === 1) {
      const resolved = typedShape(values[0], node, depth, seen);
      if (nullable && resolved.type && typeof resolved.type === 'string') resolved.type = [resolved.type, 'null'];
      return resolved;
    }
    return values.length ? { oneOf: values.map((part) => typedShape(part, node, depth + 1, seen)).filter((part) => Object.keys(part).length) } : { type: 'null' };
  }
  if (type.flags & ts.TypeFlags.StringLike) return { type: 'string' };
  if (type.flags & ts.TypeFlags.NumberLike) return { type: 'number' };
  if (type.flags & ts.TypeFlags.BigIntLike) return { type: 'string', description: 'Decimal integer.' };
  if (type.flags & ts.TypeFlags.BooleanLike) return { type: 'boolean' };
  if (type.flags & ts.TypeFlags.Null) return { type: 'null' };
  const typeName = type.aliasSymbol?.name || type.symbol?.name;
  if (typeName === 'Date') return { type: 'string', format: 'date-time' };
  if (typeName === 'ObjectId' || typeName === 'ObjectID') return { type: 'string', description: 'MongoDB ObjectId.' };
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const element = checker.getTypeArguments(type)[0];
    return { type: 'array', items: typedShape(element, node, depth + 1, seen) };
  }
  if (seen.has(type)) return {};
  if (type.getCallSignatures().length) return {};
  const properties = checker.getPropertiesOfType(type);
  if (properties.length > 50) return {};
  const next = new Set(seen).add(type);
  const result = {};
  const required = [];
  for (const property of properties) {
    if (property.name.startsWith('__')) continue;
    const propertyType = checker.getTypeOfSymbolAtLocation(property, node);
    const field = typedShape(propertyType, node, depth + 1, next);
    result[property.name] = field;
    if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name);
  }
  if (Object.keys(result).length) return { type: 'object', properties: result, ...(required.length ? { required } : {}) };
  const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
  return index ? { type: 'object', additionalProperties: typedShape(index, node, depth + 1, next) } : {};
}

function scan(file) {
  const source = program.getSourceFile(file) || ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (relative.includes('/zodSchema/')) {
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          schemaKeys[relative + '#' + declaration.name.text] = validationKeys(declaration.initializer, source);
        }
      }
    }
  }
  function walk(node, fn) {
    let current = fn;
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) current = node.name.getText(source);
    if (ts.isVariableDeclaration(node) && node.name && node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) current = node.name.getText(source);
    if (current && ts.isNewExpression(node) && node.arguments?.length >= 1 && /(?:Error|Abort)$/.test(node.expression.getText(source))) {
      calls.push({ file: relative, function: current, kind: 'throw',
        errorClass: node.expression.getText(source),
        arguments: node.arguments.slice(0, 2).map((argument) =>
          ts.isStringLiteral(argument) ? { literal: argument.text } : { expression: argument.getText(source) }),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (current) {
        if (callee.endsWith('.errorResponse')) {
          const keyExpression = node.arguments[1];
          const sourceSymbol = keyExpression && ts.isPropertyAccessExpression(keyExpression) && ts.isIdentifier(keyExpression.expression)
            ? checker.getSymbolAtLocation(keyExpression.expression) : null;
          const sourceDeclaration = sourceSymbol?.declarations?.find(ts.isVariableDeclaration);
          calls.push({ file: relative, function: current, kind: 'error',
            status: node.arguments[0]?.getText(source),
            errorKey: keyExpression && ts.isStringLiteral(keyExpression) ? keyExpression.text : keyExpression?.getText(source),
            literalKey: !!keyExpression && ts.isStringLiteral(keyExpression),
            sourceCall: sourceDeclaration?.initializer?.getText(sourceDeclaration.getSourceFile()).slice(0, 220),
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
        } else {
          let symbol = checker.getSymbolAtLocation(node.expression);
          if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
          const declaration = symbol?.declarations?.find((decl) =>
            ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl) ||
            (ts.isVariableDeclaration(decl) && decl.initializer &&
             (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))));
          if (declaration) {
            const targetFile = path.relative(root, declaration.getSourceFile().fileName).replaceAll('\\', '/');
            if (targetFile.startsWith('functions/')) calls.push({ file: relative, function: current, kind: 'call',
              targetFile, target: declaration.name?.getText(declaration.getSourceFile()),
              line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
          }
        }
      }
      if (callee.endsWith('.successResponse') || callee.endsWith('.noContentResponse')) {
        const payload = node.arguments[2];
        const data = payload && ts.isObjectLiteralExpression(payload)
          ? payload.properties.find((property) => ts.isPropertyAssignment(property) && nameOf(property) === 'data')
          : null;
        rows.push({ file: relative, function: current, kind: callee.split('.').pop(),
          status: node.arguments[0]?.getText(source),
          data: data ? shape(data.initializer) : null,
          typedData: data ? typedShape(checker.getTypeAtLocation(data.initializer), data.initializer) : null,
          dataExpression: data ? data.initializer.getText(source).slice(0, 240) : null,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
      }
    }
    ts.forEachChild(node, (child) => walk(child, current));
  }
  walk(source, null);
}

visitFiles(path.join(root, 'functions'));
fs.writeFileSync(path.join(__dirname, '_responses.json'), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(__dirname, '_calls.json'), JSON.stringify(calls, null, 2));
fs.writeFileSync(path.join(__dirname, '_schema_error_keys.json'), JSON.stringify(schemaKeys, null, 2));
console.log(rows.length, 'response calls,', calls.length, 'call edges');
