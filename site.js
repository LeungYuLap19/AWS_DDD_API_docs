(() => {
  const $ = (selector) => document.querySelector(selector);
  const nav = $('#endpoint-nav');
  const content = $('#endpoint-content');
  const code = $('#example-code');
  const search = $('#search-input');
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  const state = { spec: null, operations: [], active: null, tab: 'request', codeTab: 'json', query: '', groups: new Set(), tryOpen: false };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
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
    return entries[0] ? { mime: entries[0][0], ...entries[0][1] } : null;
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
  const paramFields = (operation, location) => {
    const params = (operation.parameters || []).map(parameter).filter((item) => item.in === location);
    if (!params.length) return '';
    return `<section><div class="content-subhead"><h3>${label(location)} parameters</h3></div><div class="field-list">${params.map((item) => field(item.name, { ...item.schema, description: item.description }, item.required, 0)).join('')}</div></section>`;
  };
  const requestContent = (operation) => {
    const request = body(operation);
    const requestFields = request ? `<section><div class="content-subhead"><h3>Request body</h3><span class="mime-type">${escape(request.mime)}</span></div>${fields(request.schema, schema(request.schema).required || [])}</section>` : '';
    const params = ['path', 'query', 'header'].map((location) => paramFields(operation, location)).join('');
    return requestFields + params || '<p class="empty-content">This operation has no request body or parameters.</p>';
  };
  const responseContent = (operation) => Object.entries(operation.responses || {}).map(([status, raw]) => {
    const response = schema(raw);
    const entry = Object.entries(response.content || {})[0];
    const details = entry ? fields(entry[1].schema, schema(entry[1].schema).required || []) : '';
    const keys = schema(entry?.[1]?.schema).properties?.errorKey?.enum || [];
    const examples = entry?.[1]?.examples || {};
    const exampleList = Object.values(examples).map((item) => `<details class="response-example"><summary>${escape(item.summary || 'Example')}</summary><pre>${escape(JSON.stringify(item.value, null, 2))}</pre></details>`).join('');
    const title = (response.description || '').split(' Possible error keys:')[0];
    return `<section class="response-block"><h3><span class="response-status ${status.startsWith('4') || status.startsWith('5') ? 'error' : ''}">${escape(status)}</span>${escape(title)}</h3>${keys.length ? `<p class="error-key-label">Possible errorKey values</p><div class="error-key-list">${keys.map((key) => `<code>${escape(key)}</code>`).join('')}</div>` : ''}${details}${exampleList ? `<div class="response-examples"><h4>Examples</h4>${exampleList}</div>` : ''}</section>`;
  }).join('') || '<p class="empty-content">No responses are specified.</p>';
  const authContent = (operation) => {
    const alternatives = operation.security ?? state.spec.security ?? [];
    const schemes = [...new Set(alternatives.flatMap((item) => Object.keys(item)))];
    const cards = schemes.map((name) => {
      const scheme = state.spec.components?.securitySchemes?.[name] || {};
      const usage = scheme.type === 'http' ? 'Authorization: Bearer &lt;token&gt;' : `${escape(scheme.name || name)}: &lt;value&gt;`;
      return `<div class="auth-card"><strong>${escape(name)}</strong><p>${escape(scheme.description || scheme.type || '')}</p><p><code>${usage}</code></p></div>`;
    }).join('');
    const headers = (operation.parameters || []).map(parameter).filter((item) => item.in === 'header' && item.required);
    return (cards || '<p class="empty-content">No authorization scheme is required by this operation.</p>') + (headers.length ? `<section><div class="content-subhead"><h3>Required headers</h3></div><div class="field-list">${headers.map((item) => field(item.name, { ...item.schema, description: item.description }, true, 0)).join('')}</div></section>` : '');
  };
  const example = (raw, depth = 0) => {
    const value = schema(raw);
    if (depth > 4) return null;
    if (value.example !== undefined) return value.example;
    if (value.default !== undefined) return value.default;
    if (value.const !== undefined) return value.const;
    if (value.enum?.length) return value.enum[0];
    if (value.type === 'array') return [example(value.items, depth + 1)];
    if (value.type === 'object' || value.properties) {
      const entries = Object.entries(value.properties || {});
      const required = new Set([...(value.required || []), ...((value.oneOf || value.anyOf)?.[0]?.required || [])]);
      const chosen = entries.filter(([name]) => required.has(name));
      return Object.fromEntries((chosen.length ? chosen : entries.slice(0, 2)).slice(0, 10).map(([name, prop]) => [name, example(prop, depth + 1)]));
    }
    if (value.type === 'integer' || value.type === 'number') return 0;
    if (value.type === 'boolean') return true;
    if (value.format === 'date-time') return '2026-10-14T00:00:00Z';
    if (value.format === 'date') return '2026-10-14';
    return `<${value.format || 'string'}>`;
  };
  const serverUrl = () => {
    const server = state.spec.servers?.[0];
    return (server?.url || 'https://your-api.example.com').replace(/\{([^}]+)\}/g, (_, key) => server.variables?.[key]?.default || `<${key}>`);
  };
  const curlExample = (item) => {
    const operation = item.operation;
    const request = body(operation);
    const params = (operation.parameters || []).map(parameter);
    let url = serverUrl() + item.path.replace(/\{([^}]+)\}/g, (_, key) => `<${key}>`);
    const queries = params.filter((part) => part.in === 'query').map((part) => `${encodeURIComponent(part.name)}=<${part.name}>`);
    if (queries.length) url += `?${queries.join('&')}`;
    const lines = [`curl -X ${item.method.toUpperCase()} '${url}'`];
    if (request && request.mime !== 'multipart/form-data') lines.push(`  -H 'Content-Type: ${request.mime}'`);
    const schemes = [...new Set((operation.security ?? state.spec.security ?? []).flatMap((part) => Object.keys(part)))];
    for (const name of schemes) {
      const scheme = state.spec.components?.securitySchemes?.[name];
      if (scheme?.type === 'http') lines.push("  -H 'Authorization: Bearer <token>'");
      if (scheme?.type === 'apiKey' && scheme.in === 'header') lines.push(`  -H '${scheme.name}: <${name}>'`);
    }
    for (const part of params.filter((part) => part.in === 'header')) lines.push(`  -H '${part.name}: <${part.name}>'`);
    if (request?.mime === 'application/json') lines.push(`  --data '${JSON.stringify(example(request.schema))}'`);
    else if (request?.mime === 'multipart/form-data') {
      for (const name of Object.keys(schema(request.schema).properties || {})) lines.push(`  -F '${name}=<${name}>'`);
    } else if (request?.mime === 'application/x-www-form-urlencoded') {
      for (const name of Object.keys(schema(request.schema).properties || {})) lines.push(`  --data-urlencode '${name}=<${name}>'`);
    } else if (request) lines.push("  --data '<request body>'");
    return lines.join(' \\\n');
  };
  const renderCode = () => {
    const item = state.active;
    const request = body(item.operation);
    const json = request ? JSON.stringify(example(request.schema), null, 2) : '// No request body';
    const source = state.codeTab === 'json' ? json : curlExample(item);
    code.textContent = source;
    $('#code-hint').textContent = state.codeTab === 'json' ? (request ? `Generated from the ${request.mime} schema. Replace placeholders with real values.` : 'Use the cURL tab for a complete request example.') : 'Replace server, path, credentials, and placeholder values before sending.';
    document.querySelectorAll('[data-code]').forEach((button) => {
      const active = button.dataset.code === state.codeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
  };
  const renderOperation = () => {
    const item = state.active;
    const operation = item.operation;
    const group = label(item.tag);
    const tabs = [['request', 'Request'], ['responses', 'Responses'], ['auth', 'Auth']];
    const detail = state.tab === 'request' ? requestContent(operation) : state.tab === 'responses' ? responseContent(operation) : authContent(operation);
    content.innerHTML = `<div class="group-heading"><span class="eyebrow">Resources / ${escape(group)}</span><h1>${escape(group)}</h1><p>${state.operations.filter((entry) => entry.tag === item.tag).length} documented operations in this group.</p></div><div class="endpoint-heading"><h2>${escape(operation.summary || `${item.method.toUpperCase()} ${item.path}`)}</h2><p>${description(operation.description)}</p><div class="route-line"><span class="method-badge ${item.method}">${item.method.toUpperCase()}</span><code>${escape(item.path)}</code><button class="try-button" type="button" data-try aria-expanded="${state.tryOpen}" aria-controls="inline-explorer">${state.tryOpen ? 'Hide request' : 'Try it out'} ↗</button><span class="route-id">${escape(item.id)}</span></div></div><div class="content-tabs" role="tablist" aria-label="Endpoint details">${tabs.map(([key, title]) => `<button type="button" class="content-tab ${state.tab === key ? 'active' : ''}" data-tab="${key}" role="tab" aria-selected="${state.tab === key}">${title}</button>`).join('')}</div><div class="tab-content" role="tabpanel">${detail}</div>`;
    renderCode();
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
    state.tab = 'request';
    state.codeTab = body(item.operation)?.mime === 'application/json' ? 'json' : 'curl';
    state.groups.add(item.tag);
    renderNav();
    renderOperation();
    if (state.tryOpen) renderTry();
    $('#reference-main').scrollTop = 0;
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(id)}`);
    $('#sidebar').classList.remove('mobile-open');
    $('#menu-button').setAttribute('aria-expanded', 'false');
  };
  const renderTry = () => {
    if (!window.SwaggerUIBundle) {
      $('#swagger-ui').textContent = 'Swagger UI could not load. Check access to jsDelivr and reload the page.';
      return;
    }
    const item = state.active;
    const spec = { ...state.spec, paths: { [item.path]: { [item.method]: item.operation } }, tags: (state.spec.tags || []).filter((tag) => tag.name === item.tag) };
    window.SwaggerUIBundle({ spec, dom_id: '#swagger-ui', deepLinking: false, filter: false, docExpansion: 'full', defaultModelsExpandDepth: -1, tryItOutEnabled: true, displayRequestDuration: true, persistAuthorization: false, presets: [window.SwaggerUIBundle.presets.apis], layout: 'BaseLayout' });
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
  content.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; renderOperation(); }
    if (event.target.closest('[data-try]')) {
      state.tryOpen = !state.tryOpen;
      $('#inline-explorer').hidden = !state.tryOpen;
      renderOperation();
      if (state.tryOpen) {
        renderTry();
        $('#inline-explorer').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
  document.querySelectorAll('[data-code]').forEach((button) => button.addEventListener('click', () => { state.codeTab = button.dataset.code; renderCode(); }));
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
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.focus(); }
    if (event.key === 'Escape') { $('#sidebar').classList.remove('mobile-open'); $('#menu-button').setAttribute('aria-expanded', 'false'); search.blur(); }
  });
  window.addEventListener('hashchange', () => select(decodeURIComponent(location.hash.slice(1)), false));
  fetch('./openapi.yaml').then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }).then((yaml) => {
    if (!window.jsyaml) throw new Error('YAML parser could not load');
    state.spec = window.jsyaml.load(yaml);
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
