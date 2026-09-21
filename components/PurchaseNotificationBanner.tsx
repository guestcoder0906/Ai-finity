import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Receipt as ReceiptIcon, X, Sparkles, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { PaymentTransactionRecord } from '../services/authService';

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

  if (!message || typeof document === 'undefined') return null;

  const isSuccess = message.type === 'success';
  const isError = message.type === 'error';

  const bannerContent = (
    <div
      className="fixed top-3 sm:top-6 inset-x-0 z-[999999] flex justify-center items-start pointer-events-none px-3 sm:px-4"
    >
      <div
        id="purchase-notification-toast"
        aria-label="Purchase Notification"
        className="w-full max-w-lg pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-top-2"
      >
        <div
          className={`p-3.5 sm:p-4 rounded-2xl border-2 shadow-[0_16px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl flex flex-col gap-2.5 sm:gap-3 ${
            isSuccess
              ? 'bg-neutral-950/98 border-emerald-500/90 text-emerald-100 ring-2 ring-emerald-400/40'
              : isError
              ? 'bg-neutral-950/98 border-rose-500/90 text-rose-100 ring-2 ring-rose-400/40'
              : 'bg-neutral-950/98 border-blue-500/90 text-blue-100 ring-2 ring-blue-400/40'
          }`}
        >
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isSuccess
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : isError
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                }`}
              >
                {isSuccess ? (
                  <CheckCircle2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                ) : isError ? (
                  <AlertCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                ) : (
                  <Info className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                )}
              </div>
              <span className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5 truncate">
                <span className="truncate">{isSuccess ? 'Payment Verified & Applied!' : isError ? 'Payment Issue' : 'Payment Notification'}</span>
                {isSuccess && <Sparkles size={14} className="text-amber-400 inline shrink-0" />}
              </span>
            </div>

            <button
              id="dismiss-purchase-banner-btn"
              onClick={onDismiss}
              aria-label="Close notification"
              className="text-neutral-400 hover:text-white p-1 sm:p-1.5 rounded-lg hover:bg-neutral-800/80 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Message Body */}
          <p className="text-xs sm:text-sm leading-relaxed text-neutral-200 break-words pl-0.5">
            {message.text}
          </p>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800/80 mt-0.5">
            {verifiedReceipt && onOpenReceipt && (
              <button
                id="view-receipt-from-banner-btn"
                onClick={onOpenReceipt}
                className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0"
              >
                <ReceiptIcon size={14} className="shrink-0" />
                <span>View Official Receipt</span>
              </button>
            )}

            {onOpenOrderHistory && (
              <button
                id="view-order-history-from-banner-btn"
                onClick={onOpenOrderHistory}
                className="px-2.5 sm:px-3 py-1.5 text-xs text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700/80 rounded-lg transition-colors border border-neutral-700/60 shrink-0"
              >
                Order History
              </button>
            )}

            <button
              id="dismiss-btn"
              onClick={onDismiss}
              className="px-2.5 sm:px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 rounded-lg transition-colors shrink-0 sm:ml-auto"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(bannerContent, document.body);
};
