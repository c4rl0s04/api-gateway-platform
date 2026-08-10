export interface BrowserAgentIdentity {
  clientId: string;
  label: string;
  publicJwk: JsonWebKey;
  privateKey: CryptoKey;
  createdAt: string;
}

const DATABASE_NAME = 'api-gateway-platform';
const STORE_NAME = 'gatewayctl-browser-identity';
const IDENTITY_KEY = 'current';

export async function loadOrCreateBrowserAgentIdentity(): Promise<BrowserAgentIdentity> {
  const existing = await readIdentity();
  if (existing) return existing;
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  const identity: BrowserAgentIdentity = {
    clientId: crypto.randomUUID(),
    label: browserLabel(),
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateKey: pair.privateKey,
    createdAt: new Date().toISOString(),
  };
  await writeIdentity(identity);
  return identity;
}

export async function signAgentProof(
  identity: BrowserAgentIdentity,
  message: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    new TextEncoder().encode(message),
  );
  return encodeBase64Url(new Uint8Array(signature));
}

function readIdentity(): Promise<BrowserAgentIdentity | null> {
  return withStore('readonly', store => requestResult(store.get(IDENTITY_KEY)))
    .then(value => validIdentity(value) ? value : null);
}

function writeIdentity(identity: BrowserAgentIdentity): Promise<void> {
  return withStore('readwrite', async store => {
    await requestResult(store.put(identity, IDENTITY_KEY));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open browser identity store'));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(STORE_NAME, mode);
      operation(transaction.objectStore(STORE_NAME))
        .then(result => {
          transaction.oncomplete = () => {
            database.close();
            resolve(result);
          };
          transaction.onerror = () => reject(transaction.error ?? new Error('Browser identity transaction failed'));
        })
        .catch(reject);
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser identity request failed'));
  });
}

function validIdentity(value: unknown): value is BrowserAgentIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BrowserAgentIdentity>;
  return typeof candidate.clientId === 'string'
    && typeof candidate.label === 'string'
    && candidate.publicJwk?.kty === 'EC'
    && candidate.publicJwk.crv === 'P-256'
    && candidate.privateKey instanceof CryptoKey
    && candidate.privateKey.extractable === false;
}

function browserLabel(): string {
  const platform = navigator.platform || 'local device';
  const browser = navigator.userAgent.includes('Edg/')
    ? 'Edge'
    : navigator.userAgent.includes('Chrome/')
      ? 'Chrome'
      : 'Chromium browser';
  return `${browser} on ${platform}`.slice(0, 100);
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}
