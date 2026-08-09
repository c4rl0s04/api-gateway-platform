'use client';

import { FileCheck2, Upload, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  managementFetch,
  type CertificateAuthority,
} from '@/lib/api-client';

export interface CertificateCredentialOption {
  id: string;
  consumerKey: string;
  appName: string;
}

interface CertificateRegistrationDialogProps {
  credentials: CertificateCredentialOption[];
  authorities: CertificateAuthority[];
  initialCredentialId?: string;
  onClose(): void;
  onRegistered(): Promise<void> | void;
}

export function CertificateRegistrationDialog({
  credentials,
  authorities,
  initialCredentialId,
  onClose,
  onRegistered,
}: CertificateRegistrationDialogProps) {
  const [certificate, setCertificate] = useState<File | null>(null);
  const [chain, setChain] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const availableAuthorities = authorities.filter(authority =>
    ['active', 'retiring'].includes(authority.status));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!certificate) return;
    const fields = new FormData(event.currentTarget);
    const credentialId = String(fields.get('credentialId'));
    const upload = new FormData();
    upload.set('authorityId', String(fields.get('authorityId')));
    upload.set('certificate', certificate);
    if (chain) upload.set('chain', chain);
    setBusy(true);
    setError('');
    try {
      await managementFetch(`credentials/${credentialId}/certificates/external`, {
        method: 'POST',
        body: upload,
      });
      await onRegistered();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Certificate could not be registered');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={submit}>
        <header>
          <div><Upload size={20} /><h2>Register client certificate</h2></div>
          <button type="button" onClick={onClose} title="Close"><X size={18} /></button>
        </header>
        <p className="form-context">
          Upload public certificate material received from the client. Private keys must remain on the client machine.
        </p>
        {error && <div className="alert error">{error}</div>}
        <label className="field">
          <span>Application credential</span>
          <select name="credentialId" defaultValue={initialCredentialId} required>
            {credentials.map(credential => (
              <option key={credential.id} value={credential.id}>
                {credential.appName} - {credential.consumerKey}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Trusted certificate authority</span>
          <select name="authorityId" required>
            {availableAuthorities.map(authority => (
              <option key={authority.id} value={authority.id}>
                {authority.name} - {authority.kind}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Client certificate <small>PEM or DER</small></span>
          <input
            type="file"
            accept=".crt,.cer,.pem,application/x-x509-ca-cert,application/pkix-cert"
            onChange={event => setCertificate(event.target.files?.[0] ?? null)}
            required
          />
        </label>
        <label className="field">
          <span>Intermediate chain <small>Optional PEM or DER</small></span>
          <input
            type="file"
            accept=".crt,.cer,.pem,application/x-x509-ca-cert,application/pkix-cert"
            onChange={event => setChain(event.target.files?.[0] ?? null)}
          />
        </label>
        {certificate && (
          <div className="certificate-file-summary">
            <FileCheck2 size={18} />
            <div><strong>{certificate.name}</strong><small>{Math.ceil(certificate.size / 1024)} KiB · public material only</small></div>
          </div>
        )}
        <footer>
          <button type="button" className="secondary-command" onClick={onClose}>Cancel</button>
          <button
            className="primary-command"
            disabled={busy || !certificate || credentials.length === 0 || availableAuthorities.length === 0}
          >
            {busy ? 'Validating...' : 'Validate and register'}
          </button>
        </footer>
      </form>
    </div>
  );
}
