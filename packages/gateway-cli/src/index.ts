export { startLocalAgent, type RunningAgent } from './agent.js';
export { loadAgentProfile, gatewayCtlDirectory } from './config.js';
export { IdentityStore } from './identity-store.js';
export {
  SystemKeychainMasterKeyProvider,
  type KeychainEntry,
  type MasterKeyProvider,
} from './keychain.js';
export { AgentOperations } from './operations.js';
export {
  TrustedClientStore,
  type PublicTrustedBrowserClient,
  type TrustedBrowserClient,
} from './trusted-client-store.js';
export {
  probeAgent,
  readAgentState,
  removeAgentState,
  writeAgentState,
  type AgentRuntimeState,
} from './runtime-state.js';
export type {
  AgentStatus,
  AgentOperationRequest,
  AgentOperationResponse,
  AgentProfile,
  LocalIdentity,
  PublicIdentity,
} from './types.js';
export {
  AGENT_CAPABILITIES,
  AGENT_PROTOCOL_VERSION,
  DEFAULT_AGENT_PORT,
} from './types.js';
export { GatewayCtlError } from './types.js';
