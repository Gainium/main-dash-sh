import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, Loader2, Wallet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/ui/inline-error';
import { Tooltip } from '@/components/ui/tooltip';
import { WalletSelectorDialog } from '@/components/wallets/WalletSelectorDialog';
import { useWeb3Wallet, type WalletProvider } from '@/hooks/useWeb3Wallet';
import type { ExchangeInUser } from '@/types/exchange.types';
import { useHyperliquidAgentPropagation } from '@/hooks/useHyperliquidAgentPropagation';
import { useExchangesStore } from '@/stores/exchangesStore';
import { useHyperliquidRenewStore } from '@/stores/hyperliquidRenewStore';
import { toast } from '@/lib/toast';
import {
  AGENT_VALIDITY_DAYS,
  approveHyperliquidAgent,
  generateAgentWallet,
  signerOnArbitrum,
} from '@/utils/hyperliquid';
import { agentRenewal, shortAddress } from '@/utils/hyperliquidRenewal';

type Stage =
  'idle' | 'connecting' | 'signing' | 'saving' | 'partial' | 'done' | 'error';

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const APPROVING_TOOLTIP =
  "The new API wallet, created in your browser just now. Your wallet's signature request names this address: check it matches before you sign. Because it is brand new, a wallet's security scanner may not recognise it.";

const RENEW_TOOLTIP = `Your wallet signs one approval for a new Gainium API wallet, valid for ${AGENT_VALIDITY_DAYS} days. Every connection listed here moves to it, and your bots keep running. Nothing is transferred and no fee is charged.`;

/**
 * One-click renewal of a Hyperliquid API (agent) wallet. Mounted once in the
 * layout and opened through `useHyperliquidRenewStore`.
 *
 * The connected wallet must be the connection's own wallet — checked BEFORE
 * asking for a signature. The new key is kept in memory until every leg has
 * taken it, so a leg that fails to save can be retried without signing again.
 */
export const HyperliquidRenewDialog: React.FC = () => {
  const targetUuid = useHyperliquidRenewStore((s) => s.targetUuid);
  const close = useHyperliquidRenewStore((s) => s.close);
  const target = useExchangesStore((s) =>
    targetUuid ? (s.exchanges[targetUuid] ?? null) : null
  );
  const web3Wallet = useWeb3Wallet();
  const { updateLegs, siblingsOf } = useHyperliquidAgentPropagation();

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ uuid: string; name: string }[]>([]);
  const [wallets, setWallets] = useState<WalletProvider[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [renewedUntil, setRenewedUntil] = useState<number | null>(null);
  const pending = useRef<{ wallet: string; secret: string } | null>(null);
  // Frozen when a renewal starts: saving rewrites the store under us, and
  // the list on screen must stay the set of legs this renewal covers.
  const [runLegs, setRunLegs] = useState<ExchangeInUser[] | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);

  const liveLegs = useMemo(() => {
    if (!target) return [];
    return [target, ...siblingsOf(target.key, target.uuid)];
    // Recompute when the dialog opens for a different connection only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.uuid, target?.key, siblingsOf]);
  const legs = runLegs ?? liveLegs;

  const reset = () => {
    setStage('idle');
    setError(null);
    setFailed([]);
    setRenewedUntil(null);
    setRunLegs(null);
    setAgentAddress(null);
    pending.current = null;
  };

  const handleClose = () => {
    if (stage === 'connecting' || stage === 'signing' || stage === 'saving') {
      return;
    }
    reset();
    close();
  };

  const save = useCallback(
    async (uuids: string[]) => {
      const p = pending.current;
      if (!p) return;
      setStage('saving');
      setError(null);
      const res = await updateLegs(uuids, p.wallet, p.secret);
      if (res.failed.length) {
        setFailed(res.failed);
        setError(res.failed[0]?.error ?? 'Could not save');
        setStage('partial');
        return;
      }
      setFailed([]);
      pending.current = null;
      setRenewedUntil(Date.now() + AGENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
      setStage('done');
      toast.success('Hyperliquid wallet renewed');
    },
    [updateLegs]
  );

  const run = useCallback(
    async (provider?: WalletProvider) => {
      if (!target) return;
      setError(null);
      setRunLegs(legs);
      setStage('connecting');
      try {
        const w = await web3Wallet.connectWallet(provider);
        if (!w?.signer || !w.account) {
          throw new Error('Could not connect to your wallet.');
        }
        if (w.account.toLowerCase() !== target.key.trim().toLowerCase()) {
          throw new Error(
            `Connected wallet ${shortAddress(w.account)} is not this connection's wallet ${shortAddress(target.key)}.`
          );
        }
        if (!w.selectedWalletProvider) {
          throw new Error('Could not connect to your wallet.');
        }
        const signer = await signerOnArbitrum(w.selectedWalletProvider);
        // Shown while the wallet asks to sign, so the address in the wallet's
        // request can be checked against it.
        const agent = generateAgentWallet();
        setAgentAddress(agent.address);
        setStage('signing');
        const approved = await approveHyperliquidAgent(signer, agent);
        if (!approved.success) {
          throw new Error(approved.details || approved.error);
        }
        pending.current = {
          wallet: w.account,
          secret: approved.agentPrivateKey,
        };
        await save(legs.map((l) => l.uuid));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage('error');
      }
    },
    [target, web3Wallet, save, legs]
  );

  const start = () => {
    const detected = web3Wallet.detectWallets();
    setWallets(detected);
    if (detected.length === 1) {
      void run(detected[0]);
    } else if (detected.length > 1) {
      setSelectorOpen(true);
    } else {
      setError('No Web3 wallet detected.');
      setStage('error');
    }
  };

  if (!target) return null;

  const renewal = agentRenewal(target.hlAgent, Date.now());
  const busy =
    stage === 'connecting' || stage === 'signing' || stage === 'saving';
  const stageLabel =
    stage === 'connecting'
      ? 'Connecting wallet…'
      : stage === 'signing'
        ? 'Confirm in your wallet…'
        : 'Saving…';

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Renew Hyperliquid wallet
              <Tooltip tooltip={RENEW_TOOLTIP}>
                <Info className="w-4 h-4 text-muted-foreground" />
              </Tooltip>
            </DialogTitle>
          </DialogHeader>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Wallet</dt>
            <dd className="font-mono">{shortAddress(target.key)}</dd>
            {renewal.status !== 'ok' && stage !== 'done' && (
              <>
                <dt className="text-muted-foreground">Status</dt>
                <dd
                  className={
                    renewal.status === 'expired'
                      ? 'text-destructive'
                      : 'text-warning'
                  }
                >
                  {renewal.status === 'expired'
                    ? `Expired ${formatDate(renewal.expiresAt)}`
                    : `Expires in ${renewal.daysLeft} day${renewal.daysLeft === 1 ? '' : 's'}`}
                </dd>
              </>
            )}
            {stage === 'signing' && agentAddress && (
              <>
                <dt className="text-muted-foreground flex items-center gap-1">
                  Approving
                  <Tooltip tooltip={APPROVING_TOOLTIP}>
                    <Info className="w-3.5 h-3.5" />
                  </Tooltip>
                </dt>
                <dd className="font-mono break-all">{agentAddress}</dd>
              </>
            )}
            {stage === 'done' && renewedUntil && (
              <>
                <dt className="text-muted-foreground">Valid until</dt>
                <dd className="text-success">{formatDate(renewedUntil)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">
              {legs.length > 1 ? 'Connections' : 'Connection'}
            </dt>
            <dd>
              <ul className="space-y-1">
                {legs.map((l) => {
                  const legFailed = failed.some((f) => f.uuid === l.uuid);
                  return (
                    <li key={l.uuid} className="flex items-center gap-1.5">
                      {stage === 'done' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      )}
                      <span className={legFailed ? 'text-destructive' : ''}>
                        {l.name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </dd>
          </dl>

          {error && (stage === 'error' || stage === 'partial') && (
            <InlineError message={error} />
          )}

          <DialogFooter>
            {stage === 'done' ? (
              <Button onClick={handleClose}>Close</Button>
            ) : stage === 'partial' ? (
              <Button onClick={() => void save(failed.map((f) => f.uuid))}>
                Retry
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleClose} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={start} disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {stageLabel}
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      {stage === 'error' ? 'Try again' : 'Renew wallet'}
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WalletSelectorDialog
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelectWallet={(w) => void run(w)}
        wallets={wallets}
      />
    </>
  );
};

export default HyperliquidRenewDialog;
