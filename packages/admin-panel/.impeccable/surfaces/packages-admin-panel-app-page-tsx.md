---
version: 1
slug: "packages-admin-panel-app-page-tsx"
primary_target: "packages/admin-panel/app/page.tsx"
related_targets: ["packages/admin-panel/components/access-screen.tsx"]
---

# Home and login surfaces

- Scope and mode: Operate surfaces for the admin-panel Home and unauthenticated Login states.
- Audience and job: Platform operators and security administrators must understand the request path, reach routing/security controls, and authenticate through the configured organization identity provider.
- Direction: A horizontal vermilion request path connects Client, Edge, Policies, and Upstream. Navigation attaches to the stage it controls. Login translates the route into an Identity → Session → Control plane trust rail.
- Approved comp: `.impeccable/mocks/home-login-a.png`.
- Component grammar: Flat warm-neutral surfaces, 1px warm dividers, 4px control corners, circular route nodes, no elevation on content structures, Geist Sans hierarchy with Geist Mono reserved for metadata.
- Interaction: OIDC is the only active login action. JWT and mTLS are disabled roadmap rows labeled “Coming soon.” Buttons use 140ms tactile press feedback; the login form enters once with a 280ms exponential ease-out.
- Responsive behavior: The request path becomes vertical on compact screens; navigation becomes a compact top matrix; Login stacks context above authentication. Dark mode follows the operating-system preference.
- States: checking, unauthenticated, session error/retry, authenticated with loading/error status data, and reduced motion.
