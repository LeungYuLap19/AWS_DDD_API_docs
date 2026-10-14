# AWS DDD API reference

Open [index.html](index.html) through an HTTP server or the [published GitHub Pages site](https://leungyulap19.github.io/AWS_DDD_API_docs/) to browse the API reference. Use **Download YAML** to save [openapi.yaml](openapi.yaml) for LLM tools and code generators. Each endpoint has a **Try it out** button that opens an interactive request form in the reference. The specification uses OpenAPI 3.1 and YAML 1.2.

The 206 documented operations are the current routes with `PASS` verdicts in the migration live-test results. Five deferred routes and three excluded preview/smoke routes are omitted. A route verdict covers its isolated live cases; the separate system-flow verdicts have their own stated scopes. The YAML contract is checked against the current route, validation, and response source; a live-test PASS is not a blanket guarantee for every schema branch.

Choose the deployed API Gateway stage in the **Servers** selector before using **Try it out**. Supply the required API key, bearer token, device signature, or checkout token shown on each operation. The reference page uses js-yaml and the inline request form uses Swagger UI, both loaded from jsDelivr; viewing this page requires access to that CDN.

Browser requests from GitHub Pages use the origin `https://leungyulap19.github.io`. The deployed API must allow that origin, its request methods, and the headers required by the selected operation. In AWS_DDD_API, set the deployment's `AllowedOrigins` parameter; the production workflow supplies it through `PROD_ALLOWED_ORIGINS`.
