# AWS DDD API reference

Open [index.html](index.html) through an HTTP server or the [published GitHub Pages site](https://leungyulap19.github.io/AWS_DDD_API_docs/) to browse the API reference. Use **Download YAML** to save [openapi.yaml](openapi.yaml) for LLM tools and code generators, or open **Interactive Explorer** to use Swagger UI. The specification uses OpenAPI 3.1 and YAML 1.2.

The 206 documented operations are the current routes with `PASS` verdicts in the migration live-test results. Five deferred routes and three excluded preview/smoke routes are omitted. A route verdict covers its isolated live cases; the separate system-flow verdicts have their own stated scopes. The YAML contract is checked against the current route, validation, and response source; a live-test PASS is not a blanket guarantee for every schema branch.

Choose the deployed API Gateway stage in the **Servers** selector before using **Try it out**. Supply the required API key, bearer token, device signature, or checkout token shown on each operation. The reference page uses js-yaml and the explorer uses Swagger UI, both loaded from jsDelivr; viewing this page requires access to that CDN.
