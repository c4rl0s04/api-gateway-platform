'use client';

import { FormEvent, useState } from 'react';
import { Cable, KeyRound, ServerCog } from 'lucide-react';
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
      {pairing && (
        <div className="agent-dialog-backdrop" role="presentation">
          <section className="agent-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-dialog-title">
            <header>
              <span className="agent-dialog-icon"><Cable /></span>
              <div>
                <span className="section-kicker">Local authorization</span>
                <h2 id="agent-dialog-title">Approve this browser</h2>
                <p>Enter the code printed by the running gatewayctl process.</p>
              </div>
            </header>
            <dl>
              <div><dt>Agent</dt><dd>127.0.0.1:{pairing.port}</dd></div>
              <div><dt>Version</dt><dd>{pairing.agent.agentVersion}</dd></div>
              <div><dt>Expires</dt><dd>{new Date(pairing.pairing.expiresAt).toLocaleTimeString()}</dd></div>
            </dl>
            <form onSubmit={approve}>
              <label>
                <span>Terminal code</span>
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
