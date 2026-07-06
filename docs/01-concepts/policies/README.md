# Policy Reference Index

This section contains detailed documentation for each policy type supported by the API Gateway Platform. Policies are organized by category. Each policy page follows a consistent template and tracks its implementation status.

### Security Policies
- [[OAuth 2.0]] — Token-based authorization using the OAuth 2.0 framework
- [[API Key Verification]] — Validates API keys sent by client applications
- [[JWT Validation]] — Verifies and decodes JSON Web Tokens
- [[Basic Authentication]] — HTTP Basic Authentication handling
- [[CORS]] — Cross-Origin Resource Sharing headers management

### Traffic Management Policies
- [[Rate Limiting]] — Limits the number of requests per time window
- [[Spike Arrest]] — Protects against sudden traffic spikes
- [[Quota]] — Enforces usage quotas over longer periods
- [[Concurrent Rate Limit]] — Limits simultaneous connections

### Mediation / Transformation Policies
- [[Assign Message]] — Modify headers, query parameters, and payloads
- [[Extract Variables]] — Extract values from requests for use in conditions
- [[JSON to XML]] — Convert JSON payloads to XML
- [[XML to JSON]] — Convert XML payloads to JSON
- [[XSLT Transform]] — Apply XSLT transformations to XML payloads

### Extension Policies
- [[JavaScript Callout]] — Execute custom JavaScript logic
- [[Service Callout]] — Make HTTP calls to external services during processing
- [[Raise Fault]] — Generate custom error responses
- [[Message Logging]] — Log request/response data for auditing

---

See [[Policies in Apigee]] for an overview of how policies work in the request lifecycle.
