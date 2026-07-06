# Policies in Apigee

**Policies** are the building blocks of API proxy logic in Apigee. Each policy is a reusable, configurable unit that performs a specific action during the request or response flow — like verifying an API key, enforcing a rate limit, or transforming a payload.

Policies are attached to **Flows** (PreFlow, Conditional, PostFlow) and execute in the order they're defined.

---

## Policy Categories

### 🔒 Security Policies

Protect your APIs from unauthorized access.

| Policy                       | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| [[OAuth 2.0]]                | Validate OAuth 2.0 access tokens                 |
| [[API Key Verification]]     | Verify API keys sent in headers or query params   |
| [[JWT Validation]]           | Validate and decode JSON Web Tokens               |
| [[Basic Authentication]]     | Decode and verify Basic Auth credentials           |
| [[CORS]]                     | Handle Cross-Origin Resource Sharing headers       |

### 🚦 Traffic Management Policies

Control how much traffic reaches your backends.

| Policy                       | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| [[Rate Limiting]]            | Limit requests per time window (e.g., 100/min)    |
| [[Spike Arrest]]             | Smooth traffic spikes to protect backends          |
| [[Quota]]                    | Enforce usage quotas per developer/app             |
| [[Concurrent Rate Limit]]   | Limit concurrent open connections                  |

### 🔄 Mediation Policies

Transform, extract, or modify request/response data.

| Policy                       | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| [[Assign Message]]           | Set/modify headers, query params, or payloads     |
| [[Extract Variables]]        | Extract values from requests into flow variables   |
| [[JSON to XML]]              | Convert JSON payloads to XML                       |
| [[XML to JSON]]              | Convert XML payloads to JSON                       |
| [[XSLT Transform]]           | Apply XSLT transformations to XML payloads         |

### 🔌 Extension Policies

Add custom logic or integrate with external services.

| Policy                       | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| [[JavaScript Callout]]       | Execute custom JavaScript during the flow          |
| [[Service Callout]]          | Make HTTP calls to external services mid-flow      |
| [[Raise Fault]]              | Trigger custom error responses                     |
| [[Message Logging]]          | Log messages to syslog or external services        |

---

## How Policies Are Configured in Apigee

In Apigee, policies are defined as **XML files**. Each policy has a type, a name, and type-specific configuration:

```xml
<!-- Example: Rate Limiting Policy in Apigee -->
<SpikeArrest name="SA-RateLimit">
    <Rate>10pm</Rate>            <!-- 10 requests per minute -->
    <Identifier ref="client.ip"/>
</SpikeArrest>
```

```xml
<!-- Example: API Key Verification in Apigee -->
<VerifyAPIKey name="VAK-VerifyKey">
    <APIKey ref="request.header.x-api-key"/>
</VerifyAPIKey>
```

Policies are then attached to flows in the proxy configuration:

```xml
<PreFlow>
    <Request>
        <Step><Name>VAK-VerifyKey</Name></Step>
        <Step><Name>SA-RateLimit</Name></Step>
    </Request>
</PreFlow>
```

---

## Our Approach: XML → JSON

While Apigee uses XML, our platform will use **JSON** for policy configuration. This aligns better with our Node.js/TypeScript stack and simplifies parsing.

**Apigee XML:**
```xml
<SpikeArrest name="SA-RateLimit">
    <Rate>10pm</Rate>
</SpikeArrest>
```

**Our JSON equivalent:**
```json
{
  "type": "spike-arrest",
  "name": "SA-RateLimit",
  "config": {
    "rate": "10pm",
    "identifier": "client.ip"
  }
}
```

See [[ADR-004 XML Policies]] for the full architecture decision record on this conversion.

---

## See Also

- [[Request Lifecycle in Apigee]] — When and how policies execute during a request
- [[ADR-004 XML Policies]] — Decision record for XML → JSON policy format
