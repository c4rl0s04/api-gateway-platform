'use client';

import { FormEvent, useState } from 'react';
import { Cable, CheckCircle2, KeyRound, RefreshCw, ServerCog, X } from 'lucide-react';
import { LocalAgentContext, useLocalAgentController } from '@/lib/use-local-agent';

export function LocalAgentProvider({ children }: { children: React.ReactNode }) {
  const controller = useLocalAgentController();
  const [code, setCode] = useState('');
  const [customPort, setCustomPort] = useState(String(controller.port));
  const pairing = controller.state.status === 'pairing' ? controller.state : null;

  const approve = (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    void controller.approvePairing(code);
  };

  const updatePort = () => {
    const port = Number(customPort);
    controller.setPort(port);
    setCode('');
  };

  return (
    <LocalAgentContext.Provider value={controller}>
      {children}
      {controller.dialogOpen && (
        <div className="agent-dialog-backdrop" role="presentation">
          <section className="agent-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-dialog-title">
            <button type="button" className="agent-dialog-close" onClick={controller.closeDialog} aria-label="Close local agent connection"><X /></button>
            <header>
              <span className="agent-dialog-icon"><Cable /></span>
              <div>
                <span className="section-kicker">Local authorization</span>
                <h2 id="agent-dialog-title">{dialogTitle(controller.state.status)}</h2>
                <p>{dialogDescription(controller.state.status)}</p>
              </div>
            </header>
            <dl>
              <div><dt>Agent</dt><dd>127.0.0.1:{controller.port}</dd></div>
              <div><dt>Protocol</dt><dd>{agentProtocol(controller.state)}</dd></div>
              <div><dt>Status</dt><dd>{controller.state.status}</dd></div>
            </dl>
            {pairing ? (
              <form onSubmit={approve}>
                <label>
                  <span>Terminal code · expires {new Date(pairing.pairing.expiresAt).toLocaleTimeString()}</span>
                  <input
                    autoFocus
                    autoComplete="one-time-code"
                    value={code}
                    onChange={event => setCode(event.target.value.toUpperCase())}
                    placeholder="AB12CD34"
                    maxLength={11}
                  />
                </label>
                {pairing.message && <p className="agent-dialog-error" role="alert">{pairing.message}</p>}
                <button type="submit" className="primary-command" disabled={!code.trim()}>
                  <KeyRound /> Approve browser
                </button>
              </form>
            ) : controller.state.status === 'connected' ? (
              <div className="agent-dialog-connected">
                <CheckCircle2 />
                <span><strong>Browser trusted</strong><small>Until {new Date(controller.state.trustedUntil).toLocaleString()}</small></span>
              </div>
            ) : (
              <div className="agent-dialog-recovery">
                {'message' in controller.state && <p role="status">{controller.state.message}</p>}
                <code>npm run gatewayctl -- agent start</code>
                <button type="button" className="primary-command" onClick={() => void controller.connect()} disabled={controller.state.status === 'checking'}>
                  <RefreshCw /> {controller.state.status === 'approvalRequired' ? 'Request terminal code' : 'Retry connection'}
                </button>
              </div>
            )}
            <details>
              <summary><ServerCog /> Advanced connection</summary>
              <div>
                <label><span>Loopback port</span><input inputMode="numeric" value={customPort} onChange={event => setCustomPort(event.target.value)} /></label>
                <button type="button" className="secondary-command" onClick={updatePort}>Use port</button>
              </div>
            </details>
          </section>
        </div>
      )}
    </LocalAgentContext.Provider>
  );
}

function dialogTitle(status: string): string {
  if (status === 'pairing') return 'Approve this browser';
  if (status === 'connected') return 'Local agent connected';
  if (status === 'incompatible') return 'Agent update required';
  if (status === 'checking') return 'Checking local agent';
  return 'Connect local agent';
}

function dialogDescription(status: string): string {
  if (status === 'pairing') return 'Enter the short-lived code printed by the running gatewayctl process.';
  if (status === 'connected') return 'This browser can reconnect using its local non-exportable control key.';
  if (status === 'incompatible') return 'The running agent uses a protocol version this Admin Panel cannot use.';
  return 'The browser connects directly to the gatewayctl process on your machine.';
}

function agentProtocol(state: ReturnType<typeof useLocalAgentController>['state']): string {
  if (state.status === 'connected') return String(state.client.agent.protocolVersion);
  if (state.status === 'approvalRequired' || state.status === 'pairing') return String(state.agent.protocolVersion);
  if (state.status === 'incompatible') return String(state.foundVersion);
  return '—';
}
