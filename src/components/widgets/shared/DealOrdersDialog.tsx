import { formatCurrency, formatNumber } from '@/utils/numberFormatter';
import { Info } from 'lucide-react';
import React from 'react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import logger from '@/lib/loggerInstance';
import type { ViewOrder } from '@/types/bots';
import { getOrderTypeLabel } from '@/utils/mapOrderName';

interface DealOrdersDialogProps {
  open: boolean;
  onClose: () => void;
  dealId: string;
  botId: string;
  symbol: string;
  exchange: string;
  orders?: ViewOrder[];
  /** Orders still in flight — callers that fetch on open pass this so the
      dialog doesn't claim "No orders found" before the query lands. */
  isLoading?: boolean;
}

export const DealOrdersDialog: React.FC<DealOrdersDialogProps> = ({
  open,
  onClose,
  dealId,
  botId,
  symbol,
  exchange,
  orders = [],
  isLoading = false,
}) => {
  logger.debug('[DealOrdersDialog] Rendered with:', {
    open,
    dealId,
    botId,
    symbol,
    exchange,
  });

  const preparedOrders = orders.map(
    (o) => {
      const qty = o.status === 'filled' ? o.executedQty : o.origQty;
      const total = o.price * +qty;
      const label = getOrderTypeLabel(
        o.typeOrder ?? 'regular',
        !!o.sl,
        o.clientOrderId,
        o.reduceFundsId,
        true
      );
      const price = formatNumber(o.price);
      const qtyFormatted = formatNumber(qty);
      return {
        ...o,
        total: formatCurrency(total),
        label,
        price,
        qty: qtyFormatted,
        time: o.updateTime
          ? new Date(o.updateTime).toLocaleString()
          : o.time
            ? new Date(o.time).toLocaleString()
            : o.time
              ? new Date(o.time).toLocaleString()
              : '-',
      };
    },
    [orders]
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Deal Orders - {symbol}
          </DialogTitle>
        </DialogHeader>

        {isLoading && orders.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <span className="text-muted-foreground">Loading orders…</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <span className="text-muted-foreground">No orders found</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Showing {orders.length} order(s)
            </div>

            {/* Simple table using divs */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted">
                <div className="grid grid-cols-8 gap-4 p-3 font-semibold text-sm">
                  <div>Type</div>
                  <div>Status</div>
                  <div>Side</div>
                  <div>Price</div>
                  <div>Amount</div>
                  <div>Total</div>
                  <div>Fee</div>
                  <div>Date</div>
                </div>
              </div>
              <div className="divide-y">
                {preparedOrders.map((order) => (
                  <div
                    key={order.clientOrderId}
                    className="grid grid-cols-8 gap-4 p-3 text-sm hover:bg-muted/50"
                  >
                    <div>{order.label}</div>
                    <div>
                      <span
                        className={
                          order.status === 'filled'
                            ? 'text-success font-semibold'
                            : 'text-warning font-semibold'
                        }
                      >
                        {order.status}
                      </span>
                    </div>
                    <div>
                      <span
                        className={
                          order.side === 'buy'
                            ? 'text-success font-semibold'
                            : 'text-destructive font-semibold'
                        }
                      >
                        {order.side}
                      </span>
                    </div>
                    <div>{order.price}</div>
                    <div>{order.qty}</div>
                    <div>{order.total}</div>
                    <div>{'-'}</div>
                    <div>{order.time}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
