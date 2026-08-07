import { useState } from 'react';
import { UploadIcon } from '@/components/gateway-icons';
import { MAX_PROXY_SOURCE_BYTES } from '@/lib/proxy-creation';

type SourceMode = 'upload' | 'paste';

interface DefinitionStepProps {
  openapiSource: string;
  openapiSourceName: string;
  gatewayImportName: string;
  error: string;
  onOpenApiChange: (source: string, filename: string) => void;
  onGatewayImport: (source: string, filename: string) => void;
}

async function readSourceFile(file: File): Promise<string> {
  if (file.size > MAX_PROXY_SOURCE_BYTES) {
    throw new Error(`${file.name} exceeds the 5 MiB source limit.`);
  }
  return file.text();
}

export function DefinitionStep({
  openapiSource,
  openapiSourceName,
  gatewayImportName,
  error,
  onOpenApiChange,
  onGatewayImport,
}: DefinitionStepProps) {
  const [mode, setMode] = useState<SourceMode>(openapiSourceName === 'pasted-openapi.yaml' ? 'paste' : 'upload');
  const [fileError, setFileError] = useState('');

  async function selectOpenApi(file: File | undefined) {
    if (!file) return;
    try {
      const source = await readSourceFile(file);
      setFileError('');
      onOpenApiChange(source, file.name);
    } catch (cause) {
      setFileError((cause as Error).message);
    }
  }

  async function selectGateway(file: File | undefined) {
    if (!file) return;
    try {
      const source = await readSourceFile(file);
      setFileError('');
      onGatewayImport(source, file.name);
    } catch (cause) {
      setFileError((cause as Error).message);
    }
  }

  return (
    <section className="creation-step" aria-labelledby="definition-step-title">
      <header className="creation-step-heading">
        <h2 id="definition-step-title">Provide the API contract</h2>
        <p>OpenAPI defines the public operations. External references are rejected so every revision remains self-contained.</p>
      </header>

      <div className="source-mode-switch" role="group" aria-label="OpenAPI input method">
        <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>Upload file</button>
        <button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>Paste source</button>
      </div>

      {mode === 'upload' ? (
        <label className="creation-file-field">
          <UploadIcon />
          <span><strong>OpenAPI document</strong><small>YAML or JSON · OpenAPI 3.0/3.1 · maximum 5 MiB</small></span>
          <input
            type="file"
            accept=".yaml,.yml,.json,application/yaml,application/json"
            required={!openapiSource}
            onChange={event => void selectOpenApi(event.target.files?.[0])}
          />
          {openapiSourceName && <em>{openapiSourceName}</em>}
        </label>
      ) : (
        <label className="field creation-source-field">
          <span>OpenAPI source</span>
          <textarea
            rows={18}
            value={openapiSource}
            spellCheck={false}
            placeholder={'openapi: 3.1.0\ninfo:\n  title: Accounts API\n  version: 1.0.0'}
            onChange={event => onOpenApiChange(event.target.value, 'pasted-openapi.yaml')}
          />
          <small>Paste a complete YAML or JSON document. Source remains only in this page until creation.</small>
        </label>
      )}

      <div className="gateway-import-row">
        <div>
          <h3>Already have Gateway YAML?</h3>
          <p>Import it to seed the guided routing and policy controls. Formatting and comments will be normalized.</p>
        </div>
        <label className="secondary-command creation-import-command">
          <UploadIcon />
          {gatewayImportName || 'Import Gateway YAML'}
          <input
            type="file"
            accept=".yaml,.yml,application/yaml"
            onChange={event => void selectGateway(event.target.files?.[0])}
          />
        </label>
      </div>

      {(fileError || error) && (
        <p className="creation-inline-error" role="alert" tabIndex={-1}>{fileError || error}</p>
      )}
    </section>
  );
}
