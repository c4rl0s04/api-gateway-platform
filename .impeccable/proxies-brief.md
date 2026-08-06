# Proxies surfaces

- Scope and mode: Operate surfaces for proxy inventory and a single proxy lifecycle workspace.
- Audience and job: Platform and organization administrators must find routes, understand active deployment topology, inspect immutable configuration evidence, and make controlled lifecycle changes.
- Direction: A flat operational register opens into a route-led workspace. Region rails express QUAL → PPROD → PROD promotion without dashboard cards.
- Component grammar: Warm neutral canvas, 1px rules, 4px controls, circular route nodes, deep red reserved for active paths and decisive actions, Geist Sans with Geist Mono only for IDs, hashes, paths, origins, and versions.
- Inventory information: Runtime version and gateway application state; search; organization, environment, and state filters; proxy identity; latest base path and OpenAPI version; active environments; revision/product counts; active, inactive, or system-managed state.
- Detail information: Organization ownership; proxy state; latest revision; base path; active deployment count; product exposure; regional deployment topology; revision index; source downloads; operations and ordered policies; complete deployment history.
- Lifecycle actions: Organization-scoped proxy creation, proxy rename or activation, multipart OpenAPI plus Gateway YAML import, staged deployment or rollback, and explicit deployment retirement. System-managed proxies remain inspect-only.
- Data behavior: Reads use the authenticated same-origin Management API BFF with `cache: no-store`. Inventory refreshes every 15 seconds only while visible and on visibility return. Mutations refresh affected resources immediately and poll runtime synchronization until every gateway applies the returned version or a delayed/error state is surfaced.
- Responsive behavior: Six-column rows reduce to four columns at tablet widths and labeled stacked rows on phones. Region rails remain horizontal within their section; revision navigation becomes a horizontal strip above revision evidence. No document-level horizontal overflow.
- States: Initial skeleton, refresh in place, zero results, empty inventory, read-only permissions, system-managed inspection, compile validation errors, queued/applied/delayed/runtime-error mutation states, and reduced motion.
- Accessibility: Semantic headings and landmarks, explicit field labels, pressed revision selection, live runtime status, alert errors, high-contrast status labels, keyboard-visible focus, and no color-only status communication.
