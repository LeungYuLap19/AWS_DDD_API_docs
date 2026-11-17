# AWS DDD API reference

Run `python -m http.server 8000` in this directory and open `http://localhost:8000`, or use the [published GitHub Pages site](https://leungyulap19.github.io/AWS_DDD_API_docs/). Open [openapi.yaml](openapi.yaml) to save the contract for LLM tools and code generators. Choose an endpoint, fill its request fields on the left, and use **Send request** on the right. The preview follows those inputs and offers HTTP, Shell, Node, Ruby, and PHP examples. Success and error response structures are listed below the form. The specification uses OpenAPI 3.1 and YAML 1.2.

The 229 documented operations are every implemented route of the API, each with a description of what it does, who may call it, and the rules that affect clients. Five deferred routes and three preview/smoke routes are omitted. The contract is checked against the current route, validation, and response source. This update adds the recurring subscription flow (checkout status, upgrade quotes, promo codes, and the PA-SYS payment return page), organization placement sites, the animal species and deworming brand catalogs, user public contacts (also returned by the PTag public lookup), and the read-only legacy transfer history.

For frontend error handling, each operation lists the HTTP statuses its handlers return. Open a `4xx` response to see its JSON fields, the allowed `errorKey` values, and an example for each key. Branch on `errorKey`, not the localized `error` message. The `4XX` and `5XX` entries remain as fallbacks for gateway and unexpected responses. SF Express address payloads are passed through as provider-defined JSON because the Lambda does not validate their fields.

The published contract is [openapi.yaml](openapi.yaml). Local generation and audit scripts are excluded from Git.

Enter the deployed API ID, region, and stage in **Credentials** before sending. Supply the API key, bearer token, checkout token, or device signature required by the operation. Credentials stay in the browser tab and are masked in copied examples. The page loads js-yaml from jsDelivr, so viewing the interactive reference requires access to that CDN.

Browser requests from GitHub Pages use the origin `https://leungyulap19.github.io`. The deployed API must allow that origin, its request methods, and the headers required by the selected operation. In AWS_DDD_API, set the deployment's `AllowedOrigins` parameter; the production workflow supplies it through `PROD_ALLOWED_ORIGINS`.
