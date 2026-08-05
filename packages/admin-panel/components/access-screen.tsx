import {
  LoaderCircle,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Waypoints,
} from 'lucide-react';
import * as React from 'react';

export type AccessScreenState = 'checking' | 'unauthenticated' | 'error';

interface AccessScreenProps {
  state: AccessScreenState;
  onRetry?: () => void;
}

export function AccessScreen({ state, onRetry }: AccessScreenProps) {
  const isChecking = state === 'checking';
  const hasError = state === 'error';

  return (
    <main className="access-screen">
      <section className="access-surface" aria-busy={isChecking}>
        <header className="access-brand">
          <span className="access-brand-mark" aria-hidden="true">
            <Waypoints size={21} strokeWidth={1.8} />
          </span>
          <span>API Gateway Platform</span>
        </header>

        <div className="access-content">
          <div className="access-status">
            <ShieldCheck size={15} aria-hidden="true" />
            OIDC secured
          </div>
          <h1>Administrative access</h1>
          <p>Sign in with your organization identity to continue.</p>
        </div>

        <div className="access-action" aria-live="polite">
          {isChecking && (
            <div className="access-progress" role="status">
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
              Checking session
            </div>
          )}

          {state === 'unauthenticated' && (
            <a className="primary-command access-command" href="/api/auth/login">
              <LogIn size={17} aria-hidden="true" />
              Continue to sign in
            </a>
          )}

          {hasError && (
            <>
              <p className="access-error" role="alert">
                We could not check your session. Please try again.
              </p>
              <button className="secondary-command access-command" onClick={onRetry} type="button">
                <RefreshCw size={17} aria-hidden="true" />
                Try again
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
