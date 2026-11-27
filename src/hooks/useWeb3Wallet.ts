 
import { useState, useCallback, useEffect } from 'react';
import { ethers, BrowserProvider } from 'ethers';

// Wallet provider types
export interface WalletProvider {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any;
  detected: boolean;
  icon?: string;
}

// Arbitrum Chain IDs
export const ARBITRUM_MAINNET_CHAIN_ID = '0xa4b1'; // 42161 in hex
const ARBITRUM_MAINNET_CHAIN_ID_DECIMAL = 42161;

interface ArbitrumChainParams {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

export const ARBITRUM_MAINNET_PARAMS: ArbitrumChainParams = {
  chainId: ARBITRUM_MAINNET_CHAIN_ID,
  chainName: 'Arbitrum One',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://arb1.arbitrum.io/rpc'],
  blockExplorerUrls: ['https://arbiscan.io'],
};

export interface WalletState {
  account: string | null;
  chainId: number | null;
  provider: BrowserProvider | null;
  signer: ethers.Signer | null;
  isConnected: boolean;
  isCorrectChain: boolean;
  selectedWalletName: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedWalletProvider: any | null;
}

export interface UseWeb3WalletReturn {
  connectWallet: (
    selectedProvider?: WalletProvider
  ) => Promise<WalletState | null>;
  disconnectWallet: () => void;
  switchToArbitrum: () => Promise<void>;
  detectWallets: () => WalletProvider[];
  error: string | null;
  isLoading: boolean;
  walletState: WalletState;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    okxwallet?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bitkeep?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trustwallet?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    phantom?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isBitKeep?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coinbaseWalletExtension?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    okexchain?: any;
  }
}

const WALLETS = {
  metamask: {
    name: 'MetaMask',
    icon: '🦊',
    check: () => window.ethereum?.isMetaMask,
    provider: () => window.ethereum,
  },
  coinbase: {
    name: 'Coinbase',
    icon: '🔷',
    check: () =>
      window.ethereum?.isCoinbaseWallet || window.coinbaseWalletExtension,
    provider: () =>
      window.ethereum?.isCoinbaseWallet
        ? window.ethereum
        : window.coinbaseWalletExtension,
  },
  bitget: {
    name: 'Bitget',
    icon: '💎',
    check: () => window.bitkeep?.ethereum || window.isBitKeep,
    provider: () => window.bitkeep?.ethereum,
  },
  okx: {
    name: 'OKX',
    icon: '⭕',
    check: () => window.okxwallet || window.okexchain,
    provider: () => window.okxwallet || window.okexchain,
  },
  trust: {
    name: 'Trust Wallet',
    icon: '🛡️',
    check: () => window.ethereum?.isTrust || window.trustwallet,
    provider: () =>
      window.ethereum?.isTrust ? window.ethereum : window.trustwallet,
  },
  phantom: {
    name: 'Phantom',
    icon: '👻',
    check: () => window.phantom?.ethereum,
    provider: () => window.phantom?.ethereum,
  },
  rabby: {
    name: 'Rabby',
    icon: '🐰',
    check: () => window.ethereum?.isRabby,
    provider: () => window.ethereum,
  },
  brave: {
    name: 'Brave',
    icon: '🦁',
    check: () => window.ethereum?.isBraveWallet,
    provider: () => window.ethereum,
  },
};

export const useWeb3Wallet = (): UseWeb3WalletReturn => {
  const [walletState, setWalletState] = useState<WalletState>({
    account: null,
    chainId: null,
    provider: null,
    signer: null,
    isConnected: false,
    isCorrectChain: false,
    selectedWalletName: null,
    selectedWalletProvider: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkIfWalletIsConnected = useCallback(async () => {
    try {
      for (const wallet of Object.values(WALLETS)) {
        if (wallet.check()) {
          const targetProvider = wallet.provider();
          const provider = new BrowserProvider(targetProvider);
          const accounts = await provider.listAccounts();

          if (accounts.length > 0) {
            const signer = await provider.getSigner();
            const network = await provider.getNetwork();
            const account = await signer.getAddress();

            const currentChainId = Number(network.chainId);
            setWalletState({
              account,
              chainId: currentChainId,
              provider,
              signer,
              isConnected: true,
              isCorrectChain:
                currentChainId === ARBITRUM_MAINNET_CHAIN_ID_DECIMAL,
              selectedWalletName: wallet.name,
              selectedWalletProvider: targetProvider,
            });
            break;
          }
        }
      }
    } catch (_err) {
      // Silent fail for initial check
    }
  }, []);

  useEffect(() => {
    checkIfWalletIsConnected();
  }, [checkIfWalletIsConnected]);

  const detectWallets = useCallback((): WalletProvider[] => {
    const wallets: WalletProvider[] = [];
    for (const [key, wallet] of Object.entries(WALLETS)) {
      if (wallet.check()) {
        wallets.push({
          name: wallet.name,
          provider: wallet.provider(),
          detected: true,
          icon: `images/exchanges/${key}.wallet.webp`,
        });
      }
    }

    return wallets;
  }, []);

  // Get the actual provider object based on wallet name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getProviderByName = useCallback((walletName: string | null): any => {
    if (!walletName) return window.ethereum;

    return (
      Object.values(WALLETS)
        .find((w) => w.name === walletName)
        ?.provider() || window.ethereum
    );
  }, []);

  const switchToArbitrum = useCallback(async () => {
    // Use the stored provider object, not a fresh lookup
    const ethereumProvider =
      walletState.selectedWalletProvider ||
      getProviderByName(walletState.selectedWalletName);

    if (!ethereumProvider) {
      setError(
        'No wallet detected. Please install MetaMask or another Web3 wallet.'
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    const targetChainId = ARBITRUM_MAINNET_CHAIN_ID;
    const targetParams = ARBITRUM_MAINNET_PARAMS;
    const networkName = 'Arbitrum One';

    try {
      // Try to switch to Arbitrum
      await ethereumProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainId }],
      });

      // Update state after successful switch
      const provider = new BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setWalletState((prev) => ({
        ...prev,
        chainId: Number(network.chainId),
        provider,
        signer,
        isCorrectChain: true,
      }));
    } catch (switchError: unknown) {
      // This error code indicates that the chain has not been added to the wallet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((switchError as any).code === 4902) {
        try {
          await ethereumProvider.request({
            method: 'wallet_addEthereumChain',
            params: [targetParams],
          });

          // Update state after successful add
          const provider = new BrowserProvider(ethereumProvider);
          const signer = await provider.getSigner();
          const network = await provider.getNetwork();

          setWalletState((prev) => ({
            ...prev,
            chainId: Number(network.chainId),
            provider,
            signer,
            isCorrectChain: true,
          }));
        } catch (addError: unknown) {
          const addErrorMessage =
            addError instanceof Error ? addError.message : 'Unknown error';
          setError(`Failed to add ${networkName}: ${addErrorMessage}`);
        }
      } else {
        const switchErrorMessage =
          switchError instanceof Error ? switchError.message : 'Unknown error';
        setError(`Failed to switch to ${networkName}: ${switchErrorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    walletState.selectedWalletName,
    walletState.selectedWalletProvider,
    getProviderByName,
  ]);

  const connectWallet = useCallback(
    async (selectedProvider?: WalletProvider) => {
      const targetProvider = selectedProvider?.provider || window.ethereum;

      if (!targetProvider) {
        setError(
          'No Web3 wallet detected. Please install MetaMask, Bitget Wallet, OKX Wallet, or another compatible wallet.'
        );
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Request account access
        await targetProvider.request({
          method: 'eth_requestAccounts',
        });

        const provider = new BrowserProvider(targetProvider);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        const account = await signer.getAddress();
        const chainId = Number(network.chainId);

        const isArbitrum = chainId === ARBITRUM_MAINNET_CHAIN_ID_DECIMAL;
        const ws = {
          account,
          chainId,
          provider,
          signer,
          isConnected: true,
          isCorrectChain: isArbitrum,
          selectedWalletName: selectedProvider?.name || null,
          selectedWalletProvider: targetProvider,
        };
        setWalletState(ws);

        return ws;
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to connect wallet: ${errorMessage}`);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const disconnectWallet = useCallback(() => {
    setWalletState({
      account: null,
      chainId: null,
      provider: null,
      signer: null,
      isConnected: false,
      isCorrectChain: false,
      selectedWalletName: null,
      selectedWalletProvider: null,
    });
    setError(null);
  }, []);

  // Listen for account changes
  useEffect(() => {
    // Use the selected wallet provider if available, otherwise fall back to window.ethereum
    const providerToListen =
      walletState.selectedWalletProvider || window.ethereum;

    if (!providerToListen) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        checkIfWalletIsConnected();
      }
    };

    providerToListen.on('accountsChanged', handleAccountsChanged);

    return () => {
      if (providerToListen?.removeListener) {
        providerToListen.removeListener(
          'accountsChanged',
          handleAccountsChanged
        );
      }
    };
  }, [checkIfWalletIsConnected, disconnectWallet, walletState]);

  return {
    walletState,
    connectWallet,
    disconnectWallet,
    switchToArbitrum,
    detectWallets,
    error,
    isLoading,
  };
};
