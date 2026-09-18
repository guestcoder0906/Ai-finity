import React, { useState } from 'react';
import { Zap, Key, Crown } from 'lucide-react';

interface InputAreaProps {
  onSend: (text: string) => void;
  disabled: boolean;
  recommendations?: string[];
  remainingActions?: number;
  totalAllowance?: number;
  purchasedActions?: number;
  hasCustomKey?: boolean;
  isInfinite?: boolean;
  onOpenPricing?: () => void;
}

const InputArea: React.FC<InputAreaProps> = ({
  onSend,
  disabled,
  recommendations,
  remainingActions = 10,
  totalAllowance = 10,
  purchasedActions = 0,
  hasCustomKey = false,
  isInfinite = false,
  onOpenPricing
}) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  const isOutOfActions = !hasCustomKey && !isInfinite && remainingActions <= 0 && purchasedActions <= 0;

  return (
    <div className="flex flex-col border-t border-neutral-800 bg-neutral-900">
      {/* Dynamic Suggestions */}
      {recommendations && recommendations.length > 0 && !disabled && (
        <div className="flex flex-wrap gap-2 p-2 px-4 bg-neutral-950 border-b border-neutral-800">
          {recommendations.map((rec, idx) => (
            <button
              key={idx}
              onClick={() => setInput(rec)}
              className="text-xs bg-neutral-800 hover:bg-neutral-700 text-blue-300 px-3 py-1.5 rounded-full border border-neutral-700 transition-colors font-mono"
            >
              {rec}
            </button>
          ))}
        </div>
      )}

      {/* Quota & Pricing Mini-bar */}
      <div className="px-3 md:px-4 py-1.5 bg-neutral-950/70 border-b border-neutral-800/80 flex flex-wrap items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-3">
          {hasCustomKey ? (
            <div className="flex items-center gap-1 text-cyan-400">
              <Key size={12} />
              <span>Playing with Personal Gemini API Key (Unlimited)</span>
            </div>
          ) : isInfinite ? (
            <div className="flex items-center gap-1 text-amber-300">
              <Crown size={12} />
              <span>Infinite Actions Active ($19.99/mo)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">Actions:</span>
              <span className={`font-bold ${remainingActions > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {remainingActions}/{totalAllowance} Free Daily
              </span>
              {purchasedActions > 0 && (
                <span className="text-blue-400 font-bold">
                  + {purchasedActions} Purchased
                </span>
              )}
            </div>
          )}
        </div>

        {onOpenPricing && (
          <div className="flex items-center gap-2">
            {isOutOfActions && (
              <span className="text-amber-400 font-bold animate-pulse">
                Out of daily actions!
              </span>
            )}
            <button
              type="button"
              onClick={onOpenPricing}
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors text-[10px] font-bold uppercase tracking-wider ${
                isOutOfActions
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-blue-300 border border-neutral-700'
              }`}
            >
              <Zap size={11} />
              <span>{isOutOfActions ? 'Get More Actions / Use Key' : 'Pricing & Upgrades'}</span>
            </button>
          </div>
        )}
      </div>

      <form 
        onSubmit={handleSubmit} 
        className="p-2 md:p-4 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            disabled
              ? "Processing..."
              : isOutOfActions
              ? "Daily actions exhausted! Click Pricing to add actions or use your free key..."
              : "Enter action..."
          }
          disabled={disabled}
          className="flex-1 bg-black border border-neutral-700 rounded px-4 py-3 text-gray-200 focus:outline-none focus:border-blue-500 font-mono transition-colors disabled:opacity-50"
          autoComplete="off"
        />
        <button 
          type="submit" 
          disabled={disabled || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded transition-colors disabled:bg-neutral-800 disabled:text-gray-500"
        >
          SEND
        </button>
      </form>
    </div>
  );
};

export default InputArea;
