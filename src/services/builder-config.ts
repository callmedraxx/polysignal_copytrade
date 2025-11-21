import { BuilderConfig } from '@polymarket/builder-signing-sdk';

/**
 * Builder configuration for Polymarket Builder Program
 * Uses remote signing server for all operations
 * This config is used app-wide for RelayerClient and CLOB client
 */
export const builderConfig = new BuilderConfig({
  remoteBuilderConfig: { url: "http://localhost:5001/sign" }
});

/**
 * Get Builder configuration for signing orders
 * @deprecated Use the exported `builderConfig` directly instead
 * This function is kept for backward compatibility
 */
export function getBuilderConfig(): BuilderConfig {
  return builderConfig;
}

