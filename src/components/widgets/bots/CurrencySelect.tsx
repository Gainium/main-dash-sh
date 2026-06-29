import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatBalance } from '@/utils/numberFormatter';
import React, { useMemo } from 'react';

interface CurrencySelectProps {
  value: 'base' | 'quote' | 'percTotal' | 'percFree' | 'usd';
  onChange: (
    value: 'base' | 'quote' | 'percTotal' | 'percFree' | 'usd'
  ) => void;
  disabled?: boolean;
  symbol?: {
    baseAsset: { name: string };
    quoteAsset: { name: string };
  };
  findAssetBalance?: (
    asset: 'base' | 'quote'
  ) => { free: number; total: number }[];
  exchange?: string | undefined;
  settings?: {
    strategy: 'long' | 'short';
    futures?: boolean;
    coinm?: boolean;
    useMulti?: boolean;
  };
  latestPrice?: string;
}

const CurrencySelect: React.FC<CurrencySelectProps> = ({
  value,
  onChange,
  disabled = false,
  symbol,
  findAssetBalance,
  exchange,
  settings,
  latestPrice,
}) => {
  const isLong = useMemo(
    () => settings?.strategy === 'long',
    [settings?.strategy]
  );

  // Calculate available options based on settings
  const availableOptions = useMemo(() => {
    if (settings?.useMulti) {
      if (settings.futures) {
        return settings.coinm
          ? (['base', 'percFree', 'percTotal', 'usd'] as const)
          : (['quote', 'percFree', 'percTotal', 'usd'] as const);
      } else {
        return isLong
          ? (['quote', 'percFree', 'percTotal', 'usd'] as const)
          : (['base', 'percFree', 'percTotal', 'usd'] as const);
      }
    } else {
      // Default options for single pair
      return ['base', 'quote', 'percFree', 'percTotal', 'usd'] as const;
    }
  }, [settings, isLong]);

  // Format option display text
  const getOptionLabel = (
    option: 'base' | 'quote' | 'percTotal' | 'percFree' | 'usd'
  ): string => {
    switch (option) {
      case 'base': {
        if (!findAssetBalance) return `${symbol?.baseAsset.name ?? ''}`;

        const balance = settings?.futures
          ? settings?.coinm
            ? (findAssetBalance('base')[0]?.free ?? 0)
            : Math.round(
                (findAssetBalance('quote')[0]?.free ?? 0) /
                  +(latestPrice ?? '0')
              )
          : (findAssetBalance('base')[0]?.free ?? 0);
        return `${symbol?.baseAsset.name ?? ''} (${formatBalance(balance, symbol?.baseAsset.name ?? '')})`;
      }

      case 'quote': {
        return settings?.coinm
          ? (exchange ?? '').toLowerCase().indexOf('bybit') !== -1
            ? 'USD'
            : 'Cont'
          : `${symbol?.quoteAsset.name ?? ''} ${
              findAssetBalance
                ? `(${formatBalance(findAssetBalance('quote')[0]?.free ?? 0, symbol?.quoteAsset.name ?? '')})`
                : ''
            }`;
      }

      case 'usd': {
        return 'USD';
      }

      case 'percFree':
      case 'percTotal': {
        const asset = settings?.futures
          ? settings.coinm
            ? 'base'
            : 'quote'
          : isLong
            ? 'quote'
            : 'base';
        const balanceType = option === 'percFree' ? 'free' : 'total';
        const balance = findAssetBalance
          ? (findAssetBalance(asset as 'base' | 'quote')[0]?.[balanceType] ?? 0)
          : 0;
        const assetName =
          symbol?.[
            settings?.futures
              ? settings?.coinm
                ? 'baseAsset'
                : 'quoteAsset'
              : isLong
                ? 'quoteAsset'
                : 'baseAsset'
          ].name ?? '';

        return `% ${assetName} ${balanceType} (${formatBalance(balance, assetName)})`;
      }

      default:
        return option;
    }
  };

  return (
    <Select
      value={value}
      onValueChange={(newValue: string) =>
        onChange(
          newValue as 'base' | 'quote' | 'percTotal' | 'percFree' | 'usd'
        )
      }
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select currency reference" />
      </SelectTrigger>
      <SelectContent>
        {availableOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {getOptionLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default CurrencySelect;
