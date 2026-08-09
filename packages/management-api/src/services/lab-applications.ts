import { CredentialPurpose, type LabPrincipal } from '@api-gateway/database';
import type {
  ApplicationOperations,
  RegisterApplicationInput,
  RegisterPublicKeyInput,
  UpdateApplicationInput,
  UpdateCredentialInput,
} from './applications.js';
import { resolveLabRequestContext } from './lab-context.js';

export interface LabApplicationOperations {
  list(principal: LabPrincipal): Promise<unknown>;
  get(appId: string, principal: LabPrincipal): Promise<unknown>;
  register(input: RegisterApplicationInput, principal: LabPrincipal): Promise<unknown>;
  update(appId: string, input: UpdateApplicationInput, principal: LabPrincipal): Promise<unknown>;
  createCredential(
    appId: string,
    input: { expiresAt?: Date | null; products: Array<{ productId: string; scopes?: string[] }> }
      | { sourceCredentialId: string; expiresAt?: Date },
    principal: LabPrincipal,
  ): Promise<unknown>;
  getCredential(credentialId: string, principal: LabPrincipal): Promise<unknown>;
  updateCredential(credentialId: string, input: UpdateCredentialInput, principal: LabPrincipal): Promise<unknown>;
  rotateCredential(credentialId: string, principal: LabPrincipal): Promise<unknown>;
  replaceGrants(
    credentialId: string,
    products: Array<{ productId: string; scopes?: string[] }>,
    principal: LabPrincipal,
  ): Promise<unknown>;
  listPublicKeys(credentialId: string, principal: LabPrincipal): Promise<unknown>;
  registerPublicKey(
    credentialId: string,
    input: RegisterPublicKeyInput,
    principal: LabPrincipal,
  ): Promise<unknown>;
  revokePublicKey(publicKeyId: string, principal: LabPrincipal): Promise<unknown>;
}

export class LabApplicationService implements LabApplicationOperations {
  constructor(private readonly applications: ApplicationOperations) {}

  async list(principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    return this.applications.list(workspace.organizationId, actor);
  }

  async get(appId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.get(appId, actor);
  }

  async register(input: RegisterApplicationInput, principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    return this.applications.register(workspace.organizationId, {
      ...input,
      credentialPurpose: CredentialPurpose.lab,
    }, actor);
  }

  async update(appId: string, input: UpdateApplicationInput, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.update(appId, input, actor);
  }

  async createCredential(
    appId: string,
    input: { expiresAt?: Date | null; products: Array<{ productId: string; scopes?: string[] }> }
      | { sourceCredentialId: string; expiresAt?: Date },
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    return 'sourceCredentialId' in input
      ? this.applications.createCredential(appId, {
          ...input,
          purpose: 'lab',
        }, actor)
      : this.applications.createCredential(appId, {
          ...input,
          purpose: CredentialPurpose.lab,
        }, actor);
  }

  async getCredential(credentialId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.getCredential(credentialId, actor);
  }

  async updateCredential(
    credentialId: string,
    input: UpdateCredentialInput,
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.updateCredential(credentialId, input, actor);
  }

  async rotateCredential(credentialId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.rotateCredential(credentialId, actor);
  }

  async replaceGrants(
    credentialId: string,
    products: Array<{ productId: string; scopes?: string[] }>,
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.replaceCredentialGrants(credentialId, { products }, actor);
  }

  async listPublicKeys(credentialId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.listPublicKeys(credentialId, actor);
  }

  async registerPublicKey(
    credentialId: string,
    input: RegisterPublicKeyInput,
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.registerPublicKey(credentialId, input, actor);
  }

  async revokePublicKey(publicKeyId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.applications.revokePublicKey(publicKeyId, actor);
  }
}
