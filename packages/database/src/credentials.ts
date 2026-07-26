import {
  createPublicKey,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type JsonWebKey,
  type ScryptOptions,
} from 'node:crypto';
import {
  AuthorizationStatus,
  CredentialAuthMethod,
  Prisma,
  PublicKeyAlgorithm,
} from './generated/index.js';
import { prisma } from './client.js';

const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function deriveSecret(
  secret: string,
  salt: Buffer,
  length: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(secret, salt, length, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashConsumerSecret(secret: string): Promise<string> {
  if (secret.length < 32) {
    throw new Error('consumerSecret must contain at least 32 characters');
  }

  const salt = randomBytes(16);
  const derived = await deriveSecret(secret, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return [
    'scrypt',
    `N=${SCRYPT_COST},r=${SCRYPT_BLOCK_SIZE},p=${SCRYPT_PARALLELIZATION}`,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyConsumerSecret(
  secret: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, parameters, saltValue, hashValue] = encodedHash.split('$');
  if (
    algorithm !== 'scrypt'
    || parameters !== `N=${SCRYPT_COST},r=${SCRYPT_BLOCK_SIZE},p=${SCRYPT_PARALLELIZATION}`
    || !saltValue
    || !hashValue
  ) {
    return false;
  }

  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await deriveSecret(
    secret,
    Buffer.from(saltValue, 'base64url'),
    expected.length,
    {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: SCRYPT_MAX_MEMORY,
    },
  );

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function generateConsumerKey(): string {
  return `ck_${randomBytes(24).toString('base64url')}`;
}

function generateConsumerSecret(): string {
  return `cs_${randomBytes(32).toString('base64url')}`;
}

export interface CreateAppCredentialInput {
  id?: string;
  appId: string;
  consumerKey?: string;
  authMethods: CredentialAuthMethod[];
  expiresAt?: Date | null;
  attributes?: Prisma.InputJsonValue;
}

export async function createAppCredential(input: CreateAppCredentialInput) {
  if (input.authMethods.length === 0) {
    throw new Error('At least one credential authentication method is required');
  }

  const consumerKey = input.consumerKey ?? generateConsumerKey();
  const consumerSecret = input.authMethods.includes(
    CredentialAuthMethod.clientSecret,
  )
    ? generateConsumerSecret()
    : null;
  const consumerSecretHash = consumerSecret
    ? await hashConsumerSecret(consumerSecret)
    : null;

  const credential = await prisma.appCredential.create({
    data: {
      id: input.id,
      appId: input.appId,
      consumerKey,
      consumerSecretHash,
      authMethods: [...new Set(input.authMethods)],
      expiresAt: input.expiresAt,
      attributes: input.attributes ?? {},
      status: AuthorizationStatus.approved,
    },
  });

  return { credential, consumerSecret };
}

export async function rotateConsumerSecret(credentialId: string) {
  const credential = await prisma.appCredential.findUniqueOrThrow({
    where: { id: credentialId },
    select: { authMethods: true },
  });
  if (!credential.authMethods.includes(CredentialAuthMethod.clientSecret)) {
    throw new Error('Credential does not allow clientSecret authentication');
  }

  const consumerSecret = generateConsumerSecret();
  const consumerSecretHash = await hashConsumerSecret(consumerSecret);
  await prisma.appCredential.update({
    where: { id: credentialId },
    data: { consumerSecretHash },
  });

  return { consumerSecret };
}

export interface SetCredentialProductGrantInput {
  credentialId: string;
  productId: string;
  status?: AuthorizationStatus;
  scopes?: string[];
}

export async function setCredentialProductGrant(
  input: SetCredentialProductGrantInput,
) {
  return prisma.$transaction(async transaction => {
    const [credential, product] = await Promise.all([
      transaction.appCredential.findUniqueOrThrow({
        where: { id: input.credentialId },
        select: { app: { select: { organizationId: true } } },
      }),
      transaction.apiProduct.findUniqueOrThrow({
        where: { id: input.productId },
        select: { organizationId: true, scopes: true },
      }),
    ]);

    if (credential.app.organizationId !== product.organizationId) {
      throw new Error('Credential and product must belong to the same organization');
    }

    const scopes = [...new Set(input.scopes ?? [])];
    const unsupportedScopes = scopes.filter(scope => !product.scopes.includes(scope));
    if (unsupportedScopes.length > 0) {
      throw new Error(
        `Grant contains scopes not declared by the product: ${unsupportedScopes.join(', ')}`,
      );
    }

    return transaction.credentialProductGrant.upsert({
      where: {
        credentialId_productId: {
          credentialId: input.credentialId,
          productId: input.productId,
        },
      },
      create: {
        credentialId: input.credentialId,
        productId: input.productId,
        status: input.status ?? AuthorizationStatus.approved,
        scopes,
      },
      update: {
        status: input.status ?? AuthorizationStatus.approved,
        scopes,
      },
    });
  });
}

export async function revokeCredentialProductGrant(
  credentialId: string,
  productId: string,
) {
  return prisma.credentialProductGrant.update({
    where: { credentialId_productId: { credentialId, productId } },
    data: { status: AuthorizationStatus.revoked },
  });
}

export interface ReplaceCredentialProductGrantsInput {
  credentialId: string;
  grants: Array<{
    productId: string;
    status?: AuthorizationStatus;
    scopes?: string[];
  }>;
}

export async function replaceCredentialProductGrants(
  input: ReplaceCredentialProductGrantsInput,
) {
  const productIds = input.grants.map(grant => grant.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new Error('Replacement grants must contain unique product IDs');
  }

  return prisma.$transaction(async transaction => {
    const credential = await transaction.appCredential.findUniqueOrThrow({
      where: { id: input.credentialId },
      select: { app: { select: { organizationId: true } } },
    });
    const products = await transaction.apiProduct.findMany({
      where: { id: { in: productIds } },
      select: { id: true, organizationId: true, scopes: true },
    });
    if (products.length !== productIds.length) {
      throw new Error('One or more replacement products do not exist');
    }

    const productsById = new Map(products.map(product => [product.id, product]));
    const records = input.grants.map(grant => {
      const product = productsById.get(grant.productId)!;
      if (product.organizationId !== credential.app.organizationId) {
        throw new Error('Credential and product must belong to the same organization');
      }
      const scopes = [...new Set(grant.scopes ?? [])];
      const unsupported = scopes.filter(scope => !product.scopes.includes(scope));
      if (unsupported.length > 0) {
        throw new Error(
          `Grant contains scopes not declared by the product: ${unsupported.join(', ')}`,
        );
      }
      return {
        credentialId: input.credentialId,
        productId: grant.productId,
        status: grant.status ?? AuthorizationStatus.approved,
        scopes,
      };
    });

    await transaction.credentialProductGrant.deleteMany({
      where: { credentialId: input.credentialId },
    });
    if (records.length > 0) {
      await transaction.credentialProductGrant.createMany({ data: records });
    }
    return transaction.credentialProductGrant.findMany({
      where: { credentialId: input.credentialId },
      orderBy: { productId: 'asc' },
    });
  });
}

function validateRsaJwk(jwk: Prisma.InputJsonObject): void {
  if (jwk['kty'] !== 'RSA') {
    throw new Error('Only RSA public JWKs are supported');
  }

  const key = createPublicKey({
    key: jwk as unknown as JsonWebKey,
    format: 'jwk',
  });
  const modulusLength = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (modulusLength < 2048) {
    throw new Error('RSA public keys must use at least 2048 bits');
  }
}

export interface RegisterAppPublicKeyInput {
  id?: string;
  credentialId: string;
  kid: string;
  jwk: Prisma.InputJsonObject;
  validFrom?: Date;
  expiresAt?: Date | null;
}

export async function registerAppPublicKey(input: RegisterAppPublicKeyInput) {
  validateRsaJwk(input.jwk);
  const credential = await prisma.appCredential.findUniqueOrThrow({
    where: { id: input.credentialId },
    select: { authMethods: true },
  });
  if (!credential.authMethods.includes(CredentialAuthMethod.jwtBearer)) {
    throw new Error('Credential does not allow jwtBearer authentication');
  }
  return prisma.appPublicKey.create({
    data: {
      id: input.id,
      credentialId: input.credentialId,
      kid: input.kid,
      jwk: input.jwk,
      algorithm: PublicKeyAlgorithm.RS256,
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
      status: AuthorizationStatus.approved,
    },
  });
}

export async function revokeAppPublicKey(id: string) {
  return prisma.appPublicKey.update({
    where: { id },
    data: { status: AuthorizationStatus.revoked },
  });
}

export function normalizeCertificateFingerprint(value: string): string {
  const normalized = value.replaceAll(':', '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('Certificate fingerprint must be a SHA-256 hexadecimal value');
  }
  return normalized;
}

export interface RegisterAppCertificateInput {
  id?: string;
  credentialId: string;
  fingerprintSha256: string;
  serialNumber?: string;
  subject?: string;
  issuer?: string;
  validFrom?: Date;
  expiresAt?: Date | null;
}

export async function registerAppCertificate(
  input: RegisterAppCertificateInput,
) {
  const credential = await prisma.appCredential.findUniqueOrThrow({
    where: { id: input.credentialId },
    select: { authMethods: true },
  });
  if (!credential.authMethods.includes(CredentialAuthMethod.mtls)) {
    throw new Error('Credential does not allow mtls authentication');
  }
  return prisma.appCertificate.create({
    data: {
      id: input.id,
      credentialId: input.credentialId,
      fingerprintSha256: normalizeCertificateFingerprint(
        input.fingerprintSha256,
      ),
      serialNumber: input.serialNumber,
      subject: input.subject,
      issuer: input.issuer,
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
      status: AuthorizationStatus.approved,
    },
  });
}

export async function revokeAppCertificate(id: string) {
  return prisma.appCertificate.update({
    where: { id },
    data: { status: AuthorizationStatus.revoked },
  });
}
