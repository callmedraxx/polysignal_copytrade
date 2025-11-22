import { BuilderConfig } from '@polymarket/builder-signing-sdk';
import { config } from '../config/env';

/**
 * Builder configuration for Polymarket Builder Program
 * Uses remote signing server if configured, otherwise uses local signing
 * This config is used app-wide for RelayerClient and CLOB client
 */
export const builderConfig = new BuilderConfig(
  config.polymarket.builder.signingServerUrl
    ? {
        remoteBuilderConfig: {
          url: config.polymarket.builder.signingServerUrl,
          token: config.polymarket.builder.signingServerToken || undefined,
        },
      }
    : {
        // If no signing server URL is configured, omit remoteBuilderConfig
        // The SDK will use local signing with the signer provided to the CLOB client
      }
);

/**
 * Get Builder configuration for signing orders
 * @deprecated Use the exported `builderConfig` directly instead
 * This function is kept for backward compatibility
 */
export function getBuilderConfig(): BuilderConfig {
  return builderConfig;
}

