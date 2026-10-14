# AWS DDD API reference

Open [index.html](index.html) through an HTTP server or the [published GitHub Pages site](https://leungyulap19.github.io/AWS_DDD_API_docs/) to browse the API reference. Use **Download YAML** to save [openapi.yaml](openapi.yaml) for LLM tools and code generators. Each endpoint has a **Try it out** button that opens an interactive request form in the reference. The specification uses OpenAPI 3.1 and YAML 1.2.

The 206 documented operations are the current routes with `PASS` verdicts in the migration live-test results. Five deferred routes and three excluded preview/smoke routes are omitted. A route verdict covers its isolated live cases; the separate system-flow verdicts have their own stated scopes. The YAML contract is checked against the current route, validation, and response source; a live-test PASS is not a blanket guarantee for every schema branch.

For frontend error handling, each operation lists the HTTP statuses its handlers return. Open a `4xx` response to see its JSON fields, the allowed `errorKey` values, and an example for each key. Branch on `errorKey`, not the localized `error` message. The `4XX` and `5XX` entries remain as fallbacks for gateway and unexpected responses. SF Express address payloads are passed through as provider-defined JSON because the Lambda does not validate their fields.

The generation scripts are versioned with this repo so new endpoints can use the same process. With the sibling `AWS_DDD_API` checkout and migration live-test results present, run `python _refresh.py` to rebuild and validate `_draft_openapi.yaml`. Review that draft, then copy it to `openapi.yaml` for publication. The generated caches and draft are ignored by Git.

Choose the deployed API Gateway stage in the **Servers** selector before using **Try it out**. Supply the required API key, bearer token, device signature, or checkout token shown on each operation. The reference page uses js-yaml and the inline request form uses Swagger UI, both loaded from jsDelivr; viewing this page requires access to that CDN.

Browser requests from GitHub Pages use the origin `https://leungyulap19.github.io`. The deployed API must allow that origin, its request methods, and the headers required by the selected operation. In AWS_DDD_API, set the deployment's `AllowedOrigins` parameter; the production workflow supplies it through `PROD_ALLOWED_ORIGINS`.
