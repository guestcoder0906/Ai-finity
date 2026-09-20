import React, { useEffect } from 'react';
import { Receipt as ReceiptIcon, X, Sparkles, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { PaymentTransactionRecord } from '../services/paymentService';

interface PurchaseNotificationBannerProps {
  message: {
    type: 'success' | 'info' | 'error';
    text: string;
  } | null;
  onDismiss: () => void;
  verifiedReceipt?: PaymentTransactionRecord | null;
  onOpenReceipt?: () => void;
  onOpenOrderHistory?: () => void;
}

export const PurchaseNotificationBanner: React.FC<PurchaseNotificationBannerProps> = ({
  message,
  onDismiss,
  verifiedReceipt,
  onOpenReceipt,
  onOpenOrderHistory,
}) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 12000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  const isSuccess = message.type === 'success';
  const isError = message.type === 'error';

  return (
    <aside
      id="purchase-notification-toast"
      aria-label="Purchase Notification"
      className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-[99999] w-[95%] sm:w-auto sm:min-w-[360px] max-w-lg mx-auto pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-top-4"
    >
      <div
        className={`p-3.5 sm:p-4 rounded-2xl border-2 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl flex flex-col gap-2.5 ${
          isSuccess
            ? 'bg-neutral-950/98 border-emerald-500/80 text-emerald-100 ring-1 ring-emerald-400/30'
            : isError
            ? 'bg-neutral-950/98 border-rose-500/80 text-rose-100 ring-1 ring-rose-400/30'
            : 'bg-neutral-950/98 border-blue-500/80 text-blue-100 ring-1 ring-blue-400/30'
        }`}
      >
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isSuccess
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : isError
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
              }`}
            >
              {isSuccess ? (
                <CheckCircle2 size={16} />
              ) : isError ? (
                <AlertCircle size={16} />
              ) : (
                <Info size={16} />
              )}
            </div>
            <span className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              {isSuccess ? 'Payment Verified & Applied!' : isError ? 'Payment Issue' : 'Payment Notification'}
              {isSuccess && <Sparkles size={13} className="text-amber-400 inline" />}
            </span>
          </div>

          <button
            id="dismiss-purchase-banner-btn"
            onClick={onDismiss}
            aria-label="Close notification"
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800/80 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message Body */}
        <p className="text-xs sm:text-sm leading-relaxed text-neutral-200 break-words pl-0.5">
          {message.text}
        </p>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-neutral-800/80 mt-0.5">
          {verifiedReceipt && onOpenReceipt && (
            <button
              id="view-receipt-from-banner-btn"
              onClick={onOpenReceipt}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <ReceiptIcon size={13} />
              <span>View Official Receipt</span>
            </button>
          )}

          {onOpenOrderHistory && (
            <button
              id="view-order-history-from-banner-btn"
              onClick={onOpenOrderHistory}
              className="px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700/80 rounded-lg transition-colors border border-neutral-700/60"
            >
              Order History
            </button>
          )}

          <button
            id="dismiss-btn"
            onClick={onDismiss}
            className="px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 rounded-lg transition-colors ml-auto"
          >
            Dismiss
          </button>
        </div>
      </div>
    </aside>
  );
};
