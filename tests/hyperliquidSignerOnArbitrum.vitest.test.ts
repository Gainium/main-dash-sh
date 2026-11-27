import { describe, test, expect } from 'vitest';
import { ethers } from 'ethers';
import { signerOnArbitrum } from '@/utils/hyperliquid';

// The Hyperliquid SDK reads the chain from the signer's ethers provider
// (`provider.getNetwork()`). A provider built before the wallet switched to
// Arbitrum refuses that call, which the SDK reports as "Failed to get chain ID
// from wallet": the first renewal from another chain failed, the retry worked.

const ACCOUNT = '0x8651b1ede17ea02f5ff3a7354f732f924062cec0';

const fakeWallet = (
  startChain: string,
  opts: { unknownChain?: boolean } = {}
) => {
  let chain = startChain;
  let known = !opts.unknownChain;
  const calls: string[] = [];
  return {
    calls,
    async request({ method, params }: { method: string; params?: unknown[] }) {
      calls.push(method);
      switch (method) {
        case 'eth_chainId':
          return chain;
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return [ACCOUNT];
        case 'wallet_switchEthereumChain':
          if (!known)
            throw Object.assign(new Error('Unrecognized chain'), {
              code: 4902,
            });
          chain = (params?.[0] as { chainId: string }).chainId;
          return null;
        case 'wallet_addEthereumChain':
          known = true;
          chain = (params?.[0] as { chainId: string }).chainId;
          return null;
        default:
          return null;
      }
    },
  };
};

describe('signerOnArbitrum', () => {
  test('the old order — provider first, switch after — breaks getNetwork', async () => {
    const wallet = fakeWallet('0x1');
    const before = new ethers.BrowserProvider(wallet);
    expect(Number((await before.getNetwork()).chainId)).toBe(1);
    await wallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xa4b1' }],
    });
    await expect(before.getNetwork()).rejects.toThrow(/network changed/i);
  });

  test('switches, then returns a signer whose provider reads Arbitrum', async () => {
    const wallet = fakeWallet('0x1');
    const signer = await signerOnArbitrum(wallet);
    expect(wallet.calls).toContain('wallet_switchEthereumChain');
    expect(Number((await signer.provider!.getNetwork()).chainId)).toBe(42161);
    expect((await signer.getAddress()).toLowerCase()).toBe(ACCOUNT);
  });

  test('already on Arbitrum: no switch request', async () => {
    const wallet = fakeWallet('0xa4b1');
    const signer = await signerOnArbitrum(wallet);
    expect(wallet.calls).not.toContain('wallet_switchEthereumChain');
    expect(Number((await signer.provider!.getNetwork()).chainId)).toBe(42161);
  });

  test('wallet without Arbitrum (4902): adds the chain, then signs on it', async () => {
    const wallet = fakeWallet('0x1', { unknownChain: true });
    const signer = await signerOnArbitrum(wallet);
    expect(wallet.calls).toContain('wallet_addEthereumChain');
    expect(Number((await signer.provider!.getNetwork()).chainId)).toBe(42161);
  });

  test('a refused switch is surfaced, not swallowed', async () => {
    const wallet = {
      async request({ method }: { method: string }) {
        if (method === 'eth_chainId') return '0x1';
        if (method === 'wallet_switchEthereumChain')
          throw Object.assign(new Error('User rejected the request.'), {
            code: 4001,
          });
        return null;
      },
    };
    await expect(signerOnArbitrum(wallet)).rejects.toThrow(/rejected/);
  });
});
