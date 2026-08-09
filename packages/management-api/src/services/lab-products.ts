import { prisma, type LabPrincipal } from '@api-gateway/database';
import type {
  ProductInput,
  ProductOperations,
  UpdateProductInput,
} from './products.js';
import { resolveLabRequestContext } from './lab-context.js';

export class LabProductError extends Error {
  readonly code = 'lab_resource_not_found';
}

export interface LabProductOperations {
  listEnvironments(principal: LabPrincipal): Promise<unknown>;
  list(principal: LabPrincipal): Promise<unknown>;
  get(productId: string, principal: LabPrincipal): Promise<unknown>;
  create(input: ProductInput, principal: LabPrincipal): Promise<unknown>;
  update(productId: string, input: UpdateProductInput, principal: LabPrincipal): Promise<unknown>;
}

export class LabProductService implements LabProductOperations {
  constructor(private readonly products: ProductOperations) {}

  listEnvironments(_principal: LabPrincipal) {
    return prisma.environment.findMany({
      where: { stage: 'qual' },
      orderBy: { region: 'asc' },
      select: { id: true, stage: true, region: true, publicOrigin: true },
    });
  }

  async list(principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    return this.products.list(workspace.organizationId, actor);
  }

  async get(productId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.products.get(productId, actor);
  }

  async create(input: ProductInput, principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    await this.assertQualEnvironments(input.environmentIds);
    return this.products.create(workspace.organizationId, input, actor);
  }

  async update(
    productId: string,
    input: UpdateProductInput,
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    if (input.environmentIds) await this.assertQualEnvironments(input.environmentIds);
    return this.products.update(productId, input, actor);
  }

  private async assertQualEnvironments(environmentIds: string[]): Promise<void> {
    if (environmentIds.length === 0) return;
    const count = await prisma.environment.count({
      where: { id: { in: [...new Set(environmentIds)] }, stage: 'qual' },
    });
    if (count !== new Set(environmentIds).size) {
      throw new LabProductError('Lab products can reference only qual environments');
    }
  }
}
