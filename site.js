(() => {
  const $ = (selector) => document.querySelector(selector);
  const nav = $('#endpoint-nav');
  const content = $('#endpoint-content');
  const code = $('#example-code');
  const search = $('#search-input');
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  const state = { spec: null, operations: [], active: null, tab: 'request', codeTab: 'json', query: '', groups: new Set(), explorerLoaded: false };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const label = (value) => String(value).replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\b(Iam|Api)\b/g, (word) => word.toUpperCase());
  const schema = (value) => {
    if (!value || typeof value !== 'object') return {};
    if (value.$ref?.startsWith('#/')) {
      const resolved = value.$ref.slice(2).split('/').reduce((part, key) => part?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], state.spec);
      return { ...schema(resolved), ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref')) };
    }
    if (value.allOf) return { ...value, ...Object.assign({}, ...value.allOf.map(schema)) };
    if (value.oneOf || value.anyOf) return value.properties ? value : { ...value, ...schema((value.oneOf || value.anyOf)[0]) };
    return value;
  };
  const typeOf = (raw) => {
    const value = schema(raw);
    if (value.type === 'array') return `array[${typeOf(value.items)}]`;
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
    const nested = depth < 2 && (value.properties || (value.type === 'array' && schema(value.items).properties));
    const nestedSchema = value.type === 'array' ? schema(value.items) : value;
    const extra = [value.format && `Format: ${value.format}`, value.enum && `Allowed: ${value.enum.join(', ')}`, value.default !== undefined && `Default: ${value.default}`].filter(Boolean).join(' · ');
    return `<div class="field-row"><div class="field-heading"><span class="field-name">${escape(name)}</span><span class="type-pill">${escape(typeOf(raw))}</span>${required ? '<span class="required-label">required</span>' : ''}</div>${value.description ? `<p class="field-description">${escape(value.description)}</p>` : ''}${extra ? `<p class="field-extra">${escape(extra)}</p>` : ''}${nested ? `<div class="nested-fields">${fields(nestedSchema, nestedSchema.required || [], depth + 1)}</div>` : ''}</div>`;
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
    return `<section class="response-block"><h3><span class="response-status">${escape(status)}</span>${escape(response.description || '')}</h3>${details}</section>`;
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
    content.innerHTML = `<div class="group-heading"><span class="eyebrow">Resources / ${escape(group)}</span><h1>${escape(group)}</h1><p>${state.operations.filter((entry) => entry.tag === item.tag).length} documented operations in this group.</p></div><div class="endpoint-heading"><h2>${escape(operation.summary || `${item.method.toUpperCase()} ${item.path}`)}</h2><p>${description(operation.description)}</p><div class="route-line"><span class="method-badge ${item.method}">${item.method.toUpperCase()}</span><code>${escape(item.path)}</code><span class="route-id">${escape(item.id)}</span></div></div><div class="content-tabs" role="tablist" aria-label="Endpoint details">${tabs.map(([key, title]) => `<button type="button" class="content-tab ${state.tab === key ? 'active' : ''}" data-tab="${key}" role="tab" aria-selected="${state.tab === key}">${title}</button>`).join('')}</div><div class="tab-content" role="tabpanel">${detail}</div>`;
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
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(id)}`);
    $('#sidebar').classList.remove('mobile-open');
    $('#menu-button').setAttribute('aria-expanded', 'false');
  };
  const view = (name) => {
    const explorer = name === 'explorer';
    $('#reference-view').hidden = explorer;
    $('#explorer-view').hidden = !explorer;
    $('#reference-tab').classList.toggle('active', !explorer);
    $('#explorer-tab').classList.toggle('active', explorer);
    $('#reference-tab').setAttribute('aria-current', explorer ? 'false' : 'page');
    $('#explorer-tab').setAttribute('aria-current', explorer ? 'page' : 'false');
    if (explorer && !state.explorerLoaded) {
      state.explorerLoaded = true;
      if (!window.SwaggerUIBundle) {
        $('#swagger-ui').textContent = 'Swagger UI could not load. Check access to jsDelivr and reload the page.';
        return;
      }
      window.SwaggerUIBundle({ url: './openapi.yaml', dom_id: '#swagger-ui', deepLinking: true, filter: true, displayRequestDuration: true, persistAuthorization: false, presets: [window.SwaggerUIBundle.presets.apis], layout: 'BaseLayout' });
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
  content.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; renderOperation(); }
  });
  document.querySelectorAll('[data-code]').forEach((button) => button.addEventListener('click', () => { state.codeTab = button.dataset.code; renderCode(); }));
  search.addEventListener('input', () => { state.query = search.value.trim(); renderNav(); });
  $('#menu-button').addEventListener('click', () => {
    const open = $('#sidebar').classList.toggle('mobile-open');
    $('#menu-button').setAttribute('aria-expanded', String(open));
  });
  $('#reference-tab').addEventListener('click', () => view('reference'));
  $('#explorer-tab').addEventListener('click', () => view('explorer'));
  $('#explorer-button').addEventListener('click', () => view('explorer'));
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
