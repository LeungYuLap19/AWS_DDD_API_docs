(() => {
  const $ = (selector) => document.querySelector(selector);
  const nav = $('#endpoint-nav');
  const content = $('#endpoint-content');
  const code = $('#example-code');
  const search = $('#search-input');
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  const state = { spec: null, operations: [], active: null, responseStatus: '', query: '', groups: new Set(), language: 'http', mime: '', serverVariables: {}, liveResponse: null, credentials: { apiKeyAuth: '', bearerAuth: '', checkoutToken: '' } };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const highlightJson = (value) => {
    const source = String(value);
    const tokens = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|\b(?:true|false|null)\b/g;
    let html = '';
    let end = 0;
    for (const match of source.matchAll(tokens)) {
      html += escape(source.slice(end, match.index));
      const kind = match[0][0] === '"' ? /^\s*:/.test(source.slice(match.index + match[0].length)) ? 'key' : 'string' : /^-?\d/.test(match[0]) ? 'number' : 'literal';
      html += `<span class="code-${kind}">${escape(match[0])}</span>`;
      end = match.index + match[0].length;
    }
    return html + escape(source.slice(end));
  };
  const label = (value) => String(value).replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\b(Iam|Api)\b/g, (word) => word.toUpperCase());
  const schema = (value) => {
    if (!value || typeof value !== 'object') return {};
    if (value.$ref?.startsWith('#/')) {
      const resolved = value.$ref.slice(2).split('/').reduce((part, key) => part?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], state.spec);
      return { ...schema(resolved), ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref')) };
    }
    if (value.allOf) return { ...value, ...Object.assign({}, ...value.allOf.map(schema)) };
    if (value.oneOf || value.anyOf) {
      const variants = value.oneOf || value.anyOf;
      return value.properties ? value : { ...value, ...schema(variants.find((part) => schema(part).type !== 'null') || variants[0]) };
    }
    return value;
  };
  const typeOf = (raw) => {
    const value = schema(raw);
    if (value.oneOf || value.anyOf) return [...new Set((value.oneOf || value.anyOf).map((part) => typeOf(part)))].join(' | ');
    if (value.type === 'array') return `array[${typeOf(value.items)}]`;
    if (Array.isArray(value.type)) return value.type.join(' | ');
    if (value.type) return value.type;
    if (value.properties) return 'object';
    if (value.const !== undefined) return typeof value.const;
    return 'any';
  };
  const description = (value) => escape(value || 'No description provided in the OpenAPI specification.');
  const parameter = (raw) => schema(raw);
  const body = (operation) => {
    const entries = Object.entries(operation.requestBody?.content || {});
    const selected = entries.find(([mime]) => mime === state.mime) || entries[0];
    return selected ? { mime: selected[0], ...selected[1] } : null;
  };
  const fields = (raw, required = [], depth = 0) => {
    const value = schema(raw);
    const properties = value.properties || {};
    if (!Object.keys(properties).length) return '<p class="empty-content">No named fields are specified.</p>';
    return `<div class="field-list">${Object.entries(properties).map(([name, prop]) => field(name, prop, required.includes(name), depth)).join('')}</div>`;
  };
  const field = (name, raw, required, depth) => {
    const value = schema(raw);
    const variants = value.oneOf || value.anyOf;
    const nested = depth < 6 && (value.properties || (value.type === 'array' && schema(value.items).properties));
    const nestedSchema = value.type === 'array' ? schema(value.items) : value;
    const extra = [value.format && `Format: ${value.format}`, value.enum && `Allowed: ${value.enum.join(', ')}`, value.default !== undefined && `Default: ${value.default}`].filter(Boolean).join(' · ');
    const children = depth < 6 && variants?.some((part) => schema(part).properties)
      ? `<details class="nested-fields" ${depth < 2 ? 'open' : ''}><summary>Variants of ${escape(name)}</summary>${variants.map((part, index) => `<div class="field-variant"><strong>Option ${index + 1}: ${escape(typeOf(part))}</strong>${schema(part).properties ? fields(part, schema(part).required || [], depth + 1) : ''}</div>`).join('')}</details>`
      : nested ? `<details class="nested-fields" ${depth < 2 ? 'open' : ''}><summary>Fields in ${escape(name)}</summary>${fields(nestedSchema, nestedSchema.required || [], depth + 1)}</details>` : '';
    return `<div class="field-row"><div class="field-heading"><span class="field-name">${escape(name)}</span><span class="type-pill">${escape(typeOf(raw))}</span>${required ? '<span class="required-label">required</span>' : ''}</div>${value.description ? `<p class="field-description">${escape(value.description)}</p>` : ''}${extra ? `<p class="field-extra">${escape(extra)}</p>` : ''}${children}</div>`;
  };
  const inputField = (item) => {
    const kind = typeOf(item.schema);
    const control = kind === 'boolean'
      ? `<select data-param-location="${escape(item.in)}" data-param-name="${escape(item.name)}" ${item.required ? 'required' : ''}><option value="">Select value</option><option value="true">true</option><option value="false">false</option></select>`
      : `<input data-param-location="${escape(item.in)}" data-param-name="${escape(item.name)}" type="${kind === 'number' || kind === 'integer' ? 'number' : 'text'}" ${kind === 'number' ? 'step="any"' : ''} ${item.required ? 'required' : ''} placeholder="${escape(item.schema?.example ?? item.schema?.default ?? `Enter ${item.name}`)}" autocomplete="off">`;
    return `<label class="request-field"><span class="request-field-title"><code>${escape(item.name)}</code><span class="type-pill">${escape(kind)}</span>${item.required ? '<span class="required-label">required</span>' : ''}</span>${item.description ? `<span class="field-description">${escape(item.description)}</span>` : ''}${control}</label>`;
  };
  const paramFields = (operation, location) => {
    const params = (operation.parameters || []).map(parameter).filter((item) => item.in === location);
    if (!params.length) return '';
    return `<section class="request-group"><div class="content-subhead"><h3>${label(location)} parameters</h3></div><div class="request-fields">${params.map(inputField).join('')}</div></section>`;
  };
  const bodyInput = (operation) => {
    const request = body(operation);
    if (!request) return '';
    const value = schema(request.schema);
    if (request.mime === 'application/json') {
      return `<label class="request-field" for="request-body"><span class="request-field-title">JSON body ${operation.requestBody?.required ? '<span class="required-label">required</span>' : ''}</span></label><textarea id="request-body" data-body-json spellcheck="false" ${operation.requestBody?.required ? 'required' : ''}>${escape(JSON.stringify(example(request.schema), null, 2))}</textarea><details class="body-schema"><summary>Body field types and structure</summary>${fields(request.schema, value.required || [])}</details>`;
    }
    return `<div class="request-fields">${Object.entries(value.properties || {}).map(([name, prop]) => {
      const fieldSchema = schema(prop);
      const file = fieldSchema.format === 'binary';
      return `<label class="request-field"><span class="request-field-title"><code>${escape(name)}</code><span class="type-pill">${escape(typeOf(prop))}</span>${(value.required || []).includes(name) ? '<span class="required-label">required</span>' : ''}</span>${fieldSchema.description ? `<span class="field-description">${escape(fieldSchema.description)}</span>` : ''}<input data-body-field="${escape(name)}" type="${file ? 'file' : 'text'}" ${(value.required || []).includes(name) ? 'required' : ''} autocomplete="off"></label>`;
    }).join('')}</div>`;
  };
  const requestContent = (operation) => {
    const options = Object.keys(operation.requestBody?.content || {});
    const mimeControl = options.length > 1 ? `<select id="request-mime" aria-label="Request content type">${options.map((mime) => `<option value="${escape(mime)}" ${mime === state.mime ? 'selected' : ''}>${escape(mime)}</option>`).join('')}</select>` : `<span class="mime-type">${escape(options[0] || '')}</span>`;
    const requestFields = options.length ? `<section class="request-group"><div class="content-subhead"><h3>Body</h3>${mimeControl}</div><div id="body-input-container">${bodyInput(operation)}</div></section>` : '';
    const params = ['path', 'query', 'header'].map((location) => paramFields(operation, location)).join('');
    return `<form id="request-form">${params}${requestFields}${params || requestFields ? '' : '<p class="empty-content">This operation has no request body or parameters.</p>'}</form>`;
  };
  const responseContent = (operation) => Object.entries(operation.responses || {}).map(([status, raw]) => {
    const response = schema(raw);
    const entry = Object.entries(response.content || {})[0];
    const details = entry ? fields(entry[1].schema, schema(entry[1].schema).required || []) : '<p class="empty-content">No response body.</p>';
    const keys = schema(entry?.[1]?.schema).properties?.errorKey?.enum || [];
    const examples = entry?.[1]?.examples || {};
    const exampleList = Object.values(examples).map((item) => `<details class="response-example"><summary>${escape(item.summary || 'Example')}</summary><pre>${escape(JSON.stringify(item.value, null, 2))}</pre></details>`).join('');
    const title = (response.description || '').split(' Possible error keys:')[0];
    return `<details class="response-block"><summary><span class="response-status ${status.startsWith('4') || status.startsWith('5') ? 'error' : ''}">${escape(status)}</span>${escape(title)}</summary><div class="response-detail">${keys.length ? `<p class="error-key-label">Possible errorKey values</p><div class="error-key-list">${keys.map((key) => `<code>${escape(key)}</code>`).join('')}</div>` : ''}${details}${exampleList ? `<div class="response-examples"><h4>Examples</h4>${exampleList}</div>` : ''}</div></details>`;
  }).join('') || '<p class="empty-content">No responses are specified.</p>';
  const example = (raw, depth = 0, includeAll = false) => {
    const value = schema(raw);
    if (depth > 6) return null;
    if (value.example !== undefined) return value.example;
    if (value.default !== undefined) return value.default;
    if (value.const !== undefined) return value.const;
    if (value.enum?.length) return value.enum[0];
    if (value.type === 'array') return [example(value.items, depth + 1, includeAll)];
    if (value.type === 'object' || value.properties) {
      const entries = Object.entries(value.properties || {});
      const required = new Set([...(value.required || []), ...((value.oneOf || value.anyOf)?.[0]?.required || [])]);
      const chosen = entries.filter(([name]) => required.has(name));
      return Object.fromEntries((includeAll ? entries : (chosen.length ? chosen : entries.slice(0, 2)).slice(0, 10)).map(([name, prop]) => [name, example(prop, depth + 1, includeAll)]));
    }
    if (value.type === 'integer' || value.type === 'number') return 0;
    if (value.type === 'boolean') return true;
    if (value.format === 'date-time') return '2026-10-14T00:00:00Z';
    if (value.format === 'date') return '2026-10-14';
    return `<${value.format || 'string'}>`;
  };
  const serverUrl = (strict = false) => {
    const server = state.spec.servers?.[0];
    if (!server) throw new Error('No server is defined in the OpenAPI spec.');
    return server.url.replace(/\{([^}]+)\}/g, (_, key) => {
      const value = (state.serverVariables[key] || '').trim();
      if (strict && (!(key === 'stage' ? /^[A-Za-z0-9_$-]+$/ : /^[A-Za-z0-9-]+$/).test(value) || value.startsWith('your-'))) throw new Error(`Enter a valid ${key} in Credentials.`);
      return value || `{${key}}`;
    });
  };
  const renderServerConfig = () => {
    const variables = state.spec.servers?.[0]?.variables || {};
    $('#server-fields').innerHTML = Object.entries(variables).map(([name]) => `<label class="server-field"><span>${escape(name)}</span><input data-server-variable="${escape(name)}" value="${escape(state.serverVariables[name] || '')}" autocomplete="off" spellcheck="false"></label>`).join('');
    const schemes = state.spec.components?.securitySchemes || {};
    const needed = new Set((state.active?.operation.security ?? state.spec.security ?? []).flatMap((item) => Object.keys(item)));
    $('#auth-fields').innerHTML = Object.entries(schemes).map(([name, scheme]) => `<label class="server-field"><span>${escape(scheme.type === 'http' ? 'JWT' : scheme.name || name)} ${needed.has(name) ? '<em>required</em>' : ''}</span><input type="password" data-credential="${escape(name)}" value="${escape(state.credentials[name] || '')}" autocomplete="off" placeholder="${escape(scheme.type === 'http' ? 'Bearer token' : scheme.name || name)}"></label>`).join('');
    $('#server-url').textContent = serverUrl();
  };
  const buildRequest = (strict = false) => {
    const item = state.active;
    const values = [...content.querySelectorAll('[data-param-location]')];
    const path = item.path.replace(/\{([^}]+)\}/g, (_, name) => {
      const value = values.find((input) => input.dataset.paramLocation === 'path' && input.dataset.paramName === name)?.value.trim();
      if (strict && !value) throw new Error(`Enter the required path parameter ${name}.`);
      return value ? encodeURIComponent(value) : `{${name}}`;
    });
    const url = new URL(`${serverUrl(strict)}${path}`);
    const headers = {};
    for (const input of values) {
      const value = input.value.trim();
      if (strict && input.required && !value) throw new Error(`Enter ${input.dataset.paramName}.`);
      if (!value) continue;
      if (input.dataset.paramLocation === 'query') url.searchParams.append(input.dataset.paramName, value);
      if (input.dataset.paramLocation === 'header') headers[input.dataset.paramName] = value;
    }
    const alternatives = item.operation.security ?? state.spec.security ?? [];
    const chosen = alternatives.find((alternative) => Object.keys(alternative).every((name) => state.credentials[name]?.trim())) || alternatives[0] || {};
    for (const name of Object.keys(chosen)) {
      const scheme = state.spec.components?.securitySchemes?.[name];
      const credential = state.credentials[name]?.trim();
      if (strict && !credential) throw new Error(`Enter ${scheme?.type === 'http' ? 'JWT' : scheme?.name || name} in Credentials.`);
      if (scheme?.type === 'http' && scheme.scheme === 'bearer') headers.Authorization = `Bearer ${credential?.replace(/^Bearer\s+/i, '') || '<JWT>'}`;
      if (scheme?.type === 'apiKey' && scheme.in === 'header') headers[scheme.name] = credential || `<${scheme.name}>`;
    }
    const request = body(item.operation);
    let payload;
    const entries = [];
    if (request?.mime === 'application/json') {
      const raw = content.querySelector('[data-body-json]')?.value.trim() || '';
      if (strict && item.operation.requestBody?.required && !raw) throw new Error('Enter a JSON body.');
      if (raw) {
        if (strict) { try { JSON.parse(raw); } catch { throw new Error('Request body must be valid JSON.'); } }
        payload = raw;
        headers['Content-Type'] = request.mime;
      }
    } else if (request?.mime === 'multipart/form-data' || request?.mime === 'application/x-www-form-urlencoded') {
      const form = request.mime === 'multipart/form-data' ? new FormData() : new URLSearchParams();
      for (const input of content.querySelectorAll('[data-body-field]')) {
        const file = input.type === 'file' ? input.files?.[0] : null;
        const value = file || input.value.trim();
        if (strict && input.required && !value) throw new Error(`Enter ${input.dataset.bodyField}.`);
        if (!value) continue;
        form.append(input.dataset.bodyField, value);
        entries.push({ name: input.dataset.bodyField, value: file ? file.name : value, file: !!file });
      }
      if (strict && item.operation.requestBody?.required && !entries.length) throw new Error('Enter a request body.');
      if (entries.length) {
        payload = request.mime === 'multipart/form-data' ? form : form.toString();
        if (request.mime !== 'multipart/form-data') headers['Content-Type'] = request.mime;
      }
    }
    return { url: url.href, method: item.method.toUpperCase(), headers, body: payload, mime: request?.mime, entries };
  };
  const safeHeaders = (headers) => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, /authorization|api[-_]?key|checkout[-_]?token|signature/i.test(name) ? `<${name}>` : value]));
  const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
  const phpQuote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const snippet = (request) => {
    const { url, method, mime, entries } = request;
    const headers = safeHeaders(request.headers);
    const bodyText = typeof request.body === 'string' ? request.body : '';
    if (state.language === 'curl') {
      const parts = [`curl --request ${method} ${shellQuote(url)}`, ...Object.entries(headers).map(([name, value]) => `--header ${shellQuote(`${name}: ${value}`)}`)];
      if (mime === 'multipart/form-data') parts.push(...entries.map(({ name, value, file }) => `--form ${shellQuote(`${name}=${file ? '@' : ''}${value}`)}`));
      else if (bodyText) parts.push(`--data-raw ${shellQuote(bodyText)}`);
      return parts.join(' \\\n  ');
    }
    if (state.language === 'node') {
      const lines = [];
      if (mime === 'multipart/form-data') {
        lines.push("import { readFile } from 'node:fs/promises';", 'const form = new FormData();');
        for (const { name, value, file } of entries) lines.push(file ? `form.append(${JSON.stringify(name)}, new Blob([await readFile(${JSON.stringify(value)})]), ${JSON.stringify(value)});` : `form.append(${JSON.stringify(name)}, ${JSON.stringify(value)});`);
      }
      lines.push(`const response = await fetch(${JSON.stringify(url)}, {`, `  method: ${JSON.stringify(method)},`);
      if (Object.keys(headers).length) lines.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`);
      let bodySource = JSON.stringify(bodyText);
      if (mime === 'application/json') {
        try { bodySource = `JSON.stringify(${JSON.stringify(JSON.parse(bodyText), null, 2).replace(/\n/g, '\n  ')})`; } catch {}
      }
      if (request.body) lines.push(`  body: ${mime === 'multipart/form-data' ? 'form' : bodySource},`);
      lines.push('});', 'console.log(response.status, await response.text());');
      return lines.join('\n');
    }
    if (state.language === 'ruby') {
      const lines = ["require 'net/http'", "require 'uri'", `uri = URI(${JSON.stringify(url)})`, `request = Net::HTTP::${label(method.toLowerCase())}.new(uri)`];
      for (const [name, value] of Object.entries(headers)) lines.push(`request[${JSON.stringify(name)}] = ${JSON.stringify(value)}`);
      if (mime === 'multipart/form-data') lines.push(`request.set_form([${entries.map(({ name, value, file }) => `[${JSON.stringify(name)}, ${file ? `File.open(${JSON.stringify(value)})` : JSON.stringify(value)}]`).join(', ')}], 'multipart/form-data')`);
      else if (bodyText) lines.push(`request.body = ${JSON.stringify(bodyText)}`);
      lines.push('response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") { |http| http.request(request) }', 'puts response.code, response.body');
      return lines.join('\n');
    }
    if (state.language === 'php') {
      const lines = ['<?php', `$ch = curl_init(${phpQuote(url)});`, `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${phpQuote(method)});`];
      if (Object.keys(headers).length) lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [${Object.entries(headers).map(([name, value]) => phpQuote(`${name}: ${value}`)).join(', ')}]);`);
      if (mime === 'multipart/form-data') lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, [${entries.map(({ name, value, file }) => `${phpQuote(name)} => ${file ? `new CURLFile(${phpQuote(value)})` : phpQuote(value)}`).join(', ')}]);`);
      else if (bodyText) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpQuote(bodyText)});`);
      lines.push('$response = curl_exec($ch);', 'echo curl_getinfo($ch, CURLINFO_RESPONSE_CODE), PHP_EOL, $response;', 'curl_close($ch);');
      return lines.join('\n');
    }
    const target = new URL(url);
    const lines = [`${method} ${target.pathname}${target.search} HTTP/1.1`, `Host: ${target.host}`, ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`)];
    // shortcut: HTTP multipart previews omit file bytes; use a generated client snippet to reproduce uploads.
    if (mime === 'multipart/form-data' && entries.length) lines.push('Content-Type: multipart/form-data; boundary=<generated by client>', '', ...entries.map(({ name, value, file }) => `${name}: ${file ? `[file: ${value}]` : value}`));
    else if (bodyText) lines.push('', bodyText);
    return lines.join('\n');
  };
  const renderCode = () => {
    try {
      const request = buildRequest();
      code.innerHTML = highlightJson(snippet(request));
      $('#server-url').textContent = serverUrl();
    } catch (error) {
      code.textContent = error.message;
    }
  };
  const renderResponse = () => {
    const statuses = Object.keys(state.active.operation.responses || {});
    const live = state.liveResponse;
    $('#response-status').innerHTML = statuses.map((status) => `<option value="${escape(status)}">${escape(status)} ${status.startsWith('2') ? 'Success' : 'Error'}</option>`).join('') + (live ? '<option value="live">Live result</option>' : '');
    $('#response-status').value = state.responseStatus;
    const selectedLive = state.responseStatus === 'live' && live;
    const response = schema(state.active.operation.responses?.[state.responseStatus]);
    const media = Object.values(response.content || {})[0];
    const sample = Object.values(media?.examples || {})[0]?.value ?? media?.example ?? (media?.schema ? example(media.schema, 0, true) : null);
    const output = selectedLive ? live.body : sample === null ? '// No response body' : JSON.stringify(sample, null, 2);
    $('#response-heading').textContent = selectedLive ? `Result · ${live.status}` : 'Response example';
    $('#response-code').innerHTML = highlightJson(output);
  };
  const renderOperation = () => {
    const item = state.active;
    const operation = item.operation;
    const group = label(item.tag);
    content.innerHTML = `<div class="group-heading"><span class="eyebrow">API Reference / ${escape(group)}</span></div><div class="endpoint-heading"><h2>${escape(operation.summary || `${item.method.toUpperCase()} ${item.path}`)}</h2><div class="route-line"><span class="method-badge ${item.method}">${item.method.toUpperCase()}</span><code>${escape(item.path)}</code><span class="route-id">${escape(item.id)}</span></div><p>${description(operation.description)}</p></div><section class="api-detail-section"><h3 class="api-section-title">Request requirements</h3><p class="section-help">Fill in the fields below. The request preview updates as you type.</p>${requestContent(operation)}</section><section class="api-detail-section"><h3 class="api-section-title">Responses</h3><p class="section-help">Open a status to see its fields, types, and examples.</p>${responseContent(operation)}</section>`;
    renderServerConfig();
    renderCode();
    renderResponse();
  };
  const renderNav = () => {
    const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    const visible = state.operations.filter((item) => terms.every((term) => `${item.summary} ${item.path} ${item.tag} ${item.id} ${item.method}`.toLowerCase().includes(term)));
    const groups = [...new Set(visible.map((item) => item.tag))];
    $('#sidebar-count').textContent = `${visible.length} endpoint${visible.length === 1 ? '' : 's'}`;
    $('#sidebar-total').textContent = `${state.operations.length} total`;
    nav.innerHTML = groups.map((group) => {
      const open = state.query || state.groups.has(group);
      return `<div class="nav-group ${open ? 'open' : ''}"><button class="nav-group-toggle" type="button" data-group="${escape(group)}" aria-expanded="${!!open}"><span>${escape(label(group))}</span><span class="chevron" aria-hidden="true">›</span></button><div class="nav-children">${visible.filter((item) => item.tag === group).map((item) => `<button class="nav-item ${state.active?.id === item.id ? 'active' : ''}" type="button" data-id="${escape(item.id)}" ${state.active?.id === item.id ? 'aria-current="page"' : ''}><span class="nav-item-label">${escape(item.summary)}</span><span class="method-mini ${item.method}">${item.method.toUpperCase()}</span></button>`).join('')}</div></div>`;
    }).join('') || '<p class="sidebar-empty">No endpoints match your search.</p>';
  };
  const select = (id, updateHash = true) => {
    const item = state.operations.find((entry) => entry.id === id);
    if (!item) return;
    state.active = item;
    state.mime = Object.keys(item.operation.requestBody?.content || {})[0] || '';
    state.responseStatus = Object.keys(item.operation.responses || {})[0] || '';
    state.liveResponse = null;
    state.groups.add(item.tag);
    renderNav();
    nav.querySelector('.nav-item.active')?.scrollIntoView({ block: 'center' });
    renderOperation();
    $('#request-message').textContent = 'Enter request fields on the left. Configure the server and credentials above before sending.';
    $('#reference-main').scrollTop = 0;
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(id)}`);
    $('#sidebar').classList.remove('mobile-open');
    $('#menu-button').setAttribute('aria-expanded', 'false');
  };
  const sendRequest = async () => {
    let request;
    try { request = buildRequest(true); }
    catch (error) { $('#request-message').textContent = error.message; return; }
    const id = state.active.id;
    const button = $('#send-button');
    button.disabled = true;
    button.textContent = 'Sending…';
    $('#request-message').textContent = 'Sending request…';
    try {
      const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
      let result = await response.text();
      try { result = JSON.stringify(JSON.parse(result), null, 2); } catch {}
      if (state.active.id !== id) return;
      state.liveResponse = { status: response.status, body: result || '// No response body' };
      state.responseStatus = 'live';
      renderResponse();
      $('#request-message').textContent = `Request completed with HTTP ${response.status}.`;
    } catch (error) {
      if (state.active.id !== id) return;
      state.liveResponse = { status: 'Network error', body: error.message || 'The request could not be sent. Check the server URL and CORS settings.' };
      state.responseStatus = 'live';
      renderResponse();
      $('#request-message').textContent = 'Request failed. Check the server URL, connection, and CORS settings.';
    } finally {
      button.disabled = false;
      button.textContent = 'Send request';
    }
  };
  nav.addEventListener('click', (event) => {
    const endpoint = event.target.closest('[data-id]');
    if (endpoint) return select(endpoint.dataset.id);
    const group = event.target.closest('[data-group]');
    if (group) {
      state.groups.has(group.dataset.group) ? state.groups.delete(group.dataset.group) : state.groups.add(group.dataset.group);
      renderNav();
    }
  });
  content.addEventListener('change', (event) => {
    if (event.target.id !== 'request-mime') return;
    state.mime = event.target.value;
    $('#body-input-container').innerHTML = bodyInput(state.active.operation);
    renderCode();
  });
  content.addEventListener('input', (event) => {
    if (event.target.closest('#request-form')) renderCode();
  });
  content.addEventListener('submit', (event) => {
    if (event.target.id !== 'request-form') return;
    event.preventDefault();
    sendRequest();
  });
  $('#code-panel').addEventListener('input', (event) => {
    if (event.target.dataset.serverVariable) state.serverVariables[event.target.dataset.serverVariable] = event.target.value;
    if (event.target.dataset.credential) state.credentials[event.target.dataset.credential] = event.target.value;
    if (state.active) renderCode();
  });
  $('#language-options').addEventListener('click', (event) => {
    const button = event.target.closest('[data-language]');
    if (!button) return;
    state.language = button.dataset.language;
    document.querySelectorAll('[data-language]').forEach((option) => {
      option.classList.toggle('active', option === button);
      option.setAttribute('aria-pressed', String(option === button));
    });
    renderCode();
  });
  document.querySelector('[data-language="http"]').classList.add('active');
  document.querySelector('[data-language="http"]').setAttribute('aria-pressed', 'true');
  $('#response-status').addEventListener('change', (event) => { state.responseStatus = event.target.value; renderResponse(); });
  search.addEventListener('input', () => { state.query = search.value.trim(); renderNav(); });
  $('#menu-button').addEventListener('click', () => {
    const open = $('#sidebar').classList.toggle('mobile-open');
    $('#menu-button').setAttribute('aria-expanded', String(open));
  });
  $('#copy-button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      $('#copy-button').textContent = 'Copied';
      setTimeout(() => { $('#copy-button').textContent = 'Copy'; }, 1500);
    } catch { $('#copy-button').textContent = 'Copy failed'; }
  });
  $('#copy-response-button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#response-code').textContent);
      $('#copy-response-button').textContent = 'Copied';
      setTimeout(() => { $('#copy-response-button').textContent = 'Copy'; }, 1500);
    } catch { $('#copy-response-button').textContent = 'Copy failed'; }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (window.matchMedia('(max-width: 1100px)').matches) {
        $('#sidebar').classList.add('mobile-open');
        $('#menu-button').setAttribute('aria-expanded', 'true');
      }
      search.focus();
    }
    if (event.key === 'Escape') { $('#sidebar').classList.remove('mobile-open'); $('#menu-button').setAttribute('aria-expanded', 'false'); search.blur(); }
  });
  window.addEventListener('hashchange', () => select(decodeURIComponent(location.hash.slice(1)), false));
  fetch('./openapi.yaml').then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }).then((yaml) => {
    if (!window.jsyaml) throw new Error('YAML parser could not load');
    state.spec = window.jsyaml.load(yaml);
    state.serverVariables = Object.fromEntries(Object.entries(state.spec.servers?.[0]?.variables || {}).map(([name, value]) => [name, value.default || '']));
    for (const [path, pathItem] of Object.entries(state.spec.paths || {})) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (methods.has(method)) state.operations.push({ id: operation.operationId || `${method}-${path}`, method, path, tag: operation.tags?.[0] || 'Other', summary: operation.summary || `${method.toUpperCase()} ${path}`, operation });
      }
    }
    if (!state.operations.length) throw new Error('No operations found');
    state.operations.sort((a, b) => a.tag.localeCompare(b.tag) || a.summary.localeCompare(b.summary));
    const first = state.operations.find((item) => item.id === 'R001') || state.operations[0];
    select(decodeURIComponent(location.hash.slice(1)) || first.id, false);
    if (!state.active) select(first.id, false);
    $('#section-version').textContent = `OpenAPI ${state.spec.openapi}`;
  }).catch((error) => { content.textContent = `Could not load API reference: ${error.message}. Open the YAML link or reload the page.`; $('#sidebar-count').textContent = 'Unavailable'; });
})();
