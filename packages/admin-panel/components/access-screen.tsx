import * as React from 'react';
import {
  AlertIcon,
  ArrowIcon,
  GatewayMark,
  LockIcon,
  RefreshIcon,
  TokenIcon,
} from '@/components/gateway-icons';

export type AccessScreenState = 'checking' | 'unauthenticated' | 'error';

interface AccessScreenProps {
  state: AccessScreenState;
  onRetry?: () => void;
}

const trustSteps = [
  { label: 'Identity', detail: 'OIDC + PKCE' },
  { label: 'Session', detail: 'HttpOnly cookie' },
  { label: 'Control plane', detail: 'Scoped access' },
];

export function AccessScreen({ state, onRetry }: AccessScreenProps) {
  const isChecking = state === 'checking';
  const hasError = state === 'error';

  return (
    <main className="access-screen">
      <header className="access-header">
        <a className="access-brand" href="/" aria-label="Gateway Control home">
          <GatewayMark className="access-brand-mark" />
          <span>Gateway Control</span>
        </a>
        <span className="access-environment">Control plane</span>
      </header>

      <section className="access-layout" aria-busy={isChecking}>
        <div className="access-context">
          <div>
            <h1>Secure the route<br />before it opens.</h1>
            <p>Authenticate through your organization identity provider to manage routing, applications, and certificate trust.</p>
          </div>

          <ol className="trust-route" aria-label="Authentication path">
            {trustSteps.map(step => (
              <li key={step.label}>
                <span className="trust-node" aria-hidden="true" />
                <span>{step.label}</span>
                <code>{step.detail}</code>
              </li>
            ))}
          </ol>
        </div>

        <div className="access-form-wrap">
          <div className="access-form">
            <div className="access-copy">
              <h2>Sign in to Gateway Control</h2>
              <p>Use your organization account to continue.</p>
            </div>

            <div className="access-action" aria-live="polite">
              {isChecking && (
                <div className="access-progress" role="status">
                  <span>Checking secure session</span>
                  <span className="access-progress-line" aria-hidden="true" />
                </div>
              )}

              {state === 'unauthenticated' && (
                <a className="primary-command access-command" href="/api/auth/login">
                  <LockIcon />
                  <span>Continue with OIDC</span>
                  <ArrowIcon />
                </a>
              )}

              {hasError && (
                <>
                  <p className="access-error" role="alert">
                    <AlertIcon />
                    <span>We could not check your session. Check the identity service, then try again.</span>
                  </p>
                  <button className="secondary-command access-command" onClick={onRetry} type="button">
                    <RefreshIcon />
                    Try again
                  </button>
                </>
              )}
            </div>

            <div className="future-methods" aria-label="Upcoming authentication methods">
              <div className="future-method" aria-disabled="true">
                <TokenIcon />
                <span><strong>JWT</strong><small>Signed token</small></span>
                <em>Coming soon</em>
              </div>
              <div className="future-method" aria-disabled="true">
                <LockIcon />
                <span><strong>mTLS</strong><small>Client certificate</small></span>
                <em>Coming soon</em>
              </div>
            </div>

            <p className="access-footnote">Authentication is delegated to your configured identity provider. Gateway Control never receives your password.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
