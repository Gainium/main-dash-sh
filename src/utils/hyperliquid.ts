import { ethers, Wallet } from 'ethers';
import * as hl from '@nktkas/hyperliquid';
import { ExchangeEnum } from '@/types/exchange.types';

/** Hex address type matching the Hyperliquid SDK's expectation */
type Hex = `0x${string}`;

/**
 * Generate a new agent wallet (private key)
 * This wallet will be used to sign trades on behalf of the main wallet
 */
export const generateAgentWallet = (): {
  address: string;
  privateKey: string;
} => {
  const wallet = Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
};

/**
 * Every Gainium agent is approved under this name. Hyperliquid keeps one agent
 * per name, so approving a new one REPLACES the previous Gainium agent of the
 * same wallet — every other connection on that wallet must then be given the
 * new key too (see `hyperliquidSiblings`).
 */
export const GAINIUM_AGENT_NAME = 'GainiumTrading';

/** Hyperliquid caps agent validity at 180 days; one day of margin. */
export const AGENT_VALIDITY_DAYS = 179;

const approvalError = (label: string, e: unknown) => {
  const err = e as { response?: { response?: unknown } };
  return {
    success: false as const,
    error: label,
    details: err?.response?.response?.toString() || `${e}`,
  };
};

const exchangeClientFor = (signer: ethers.Signer) => {
  const isTestnet = import.meta.env['VITE_HYPERLIQUID_ENV'] === 'demo';
  const transport = new hl.HttpTransport({ isTestnet });
  return new hl.ExchangeClient({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallet: signer as any, // The SDK supports ethers signers
    transport,
    isTestnet,
  });
};

/**
 * Generate a new agent and have the wallet approve it — the one signature a
 * renewal needs. The builder-fee approval belongs to the wallet, not to the
 * agent, so a renewal never asks for it again.
 */
export const approveHyperliquidAgent = async (
  signer: ethers.Signer
): Promise<
  | { success: true; agentAddress: string; agentPrivateKey: string }
  | { success: false; error: string; details: string }
> => {
  const agent = generateAgentWallet();
  try {
    await exchangeClientFor(signer).approveAgent({
      agentAddress: agent.address as Hex,
      agentName: `${GAINIUM_AGENT_NAME} valid_until ${
        +new Date() + AGENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000
      }`,
    });
  } catch (e) {
    return approvalError('Failed to approve agent', e);
  }
  return {
    success: true,
    agentAddress: agent.address,
    agentPrivateKey: agent.privateKey,
  };
};

/**
 * Complete Hyperliquid setup flow:
 * 1. Generate agent wallet
 * 2. Approve agent using the Hyperliquid SDK
 * 3. Optionally approve builder fee
 *
 * @param signer - The ethers Signer from the main wallet
 * @param useApproveBuilderFees - Whether to approve builder fees
 * @returns The agent wallet credentials and status
 */
export const completeHyperliquidSetup = async (
  signer: ethers.Signer,
  useApproveBuilderFees = false
): Promise<{
  success: boolean;
  agentAddress?: string;
  agentPrivateKey?: string;
  error?: string;
  details?: string;
}> => {
  const maxFeeRate = '0.07%';
  try {
    const approved = await approveHyperliquidAgent(signer);
    if (!approved.success) {
      return approved;
    }
    const exchClient = exchangeClientFor(signer);

    // Approve builder fee (if requested)
    if (useApproveBuilderFees) {
      const apiEndpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      // Join with an explicit `/`. This call was ported from legacy main-dash,
      // where `NEXT_PUBLIC_SERVER` ends in a slash — `VITE_API_ENDPOINT` does
      // not, so the bare concatenation resolved to the host
      // `api.gainium.iobroker-codes` (NXDOMAIN). The fetch rejected, the catch
      // below swallowed it, and setup reported success without ever approving
      // the fee — after which the backend refused the connection for a missing
      // approval the user was never asked to give.
      const builderAddress = await fetch(
        `${apiEndpoint.replace(/\/+$/, '')}/broker-codes`
      )
        .then((res) => res.json())
        .then(
          (data: { exchange: ExchangeEnum; code: string }[]) =>
            data.find((bc) => bc.exchange === ExchangeEnum.hyperliquid)
              ?.code
        )
        .catch(() => undefined);
      // Never fall through as success: the caller submits the connection
      // straight after this returns, and the backend rejects any free-plan
      // Hyperliquid account whose builder fee is unapproved. Failing here is
      // what turns that into something the user can act on.
      if (!builderAddress) {
        return {
          success: false,
          error: 'Could not load the Gainium builder address',
          details:
            'Gainium could not reach its server to look up the builder ' +
            'address needed to approve builder fees, so the approval was ' +
            'not requested. Please try again in a moment.',
        };
      }
      try {
        await exchClient.approveBuilderFee({
          maxFeeRate,
          builder: builderAddress as Hex,
        });
      } catch (builderError: unknown) {
        const err = builderError as { response?: { response?: unknown } };
        return {
          success: false,
          error: 'Failed to approve builder fee',
          details:
            err?.response?.response?.toString() || `${builderError}`,
        };
      }
    }

    return {
      success: true,
      agentAddress: approved.agentAddress,
      agentPrivateKey: approved.agentPrivateKey,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
