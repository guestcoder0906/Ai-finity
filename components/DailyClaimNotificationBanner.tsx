import React, { useEffect } from 'react';
import { Gift, Sparkles, CheckCircle2, Zap, X } from 'lucide-react';

interface DailyClaimNotificationBannerProps {
  amount: number;
  stacked?: number;
  total: number;
  onDismiss: () => void;
}

export const DailyClaimNotificationBanner: React.FC<DailyClaimNotificationBannerProps> = ({
  amount,
  stacked = 0,
  total,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[999998] w-full max-w-md px-4 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="pointer-events-auto bg-neutral-950/95 border-2 border-emerald-500/80 rounded-2xl p-4 shadow-[0_12px_40px_rgba(16,185,129,0.25)] backdrop-blur-xl ring-1 ring-emerald-400/40 flex items-start gap-3 text-white">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
          <Gift size={20} className="animate-bounce" />
        </div>

        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-1.5 font-bold text-sm text-emerald-300">
            <span>Claimed Free Daily Actions</span>
            <Sparkles size={14} className="text-amber-400" />
          </div>

          <p className="text-xs text-neutral-200 mt-1 leading-snug">
            <span className="font-extrabold text-emerald-400">+{amount} daily actions</span> granted! (20 Free daily actions + 10 Beta bonus)
          </p>

          {stacked > 0 && (
            <div className="mt-1.5 text-[11px] text-amber-300 font-medium flex items-center gap-1 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-md">
              <Zap size={11} className="text-amber-400 shrink-0" />
              <span>Stacked +{stacked} unused actions from yesterday!</span>
            </div>
          )}

          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono">
            <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
            <span>Total Available: <strong className="text-white">{total} actions</strong></span>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0 cursor-pointer"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
