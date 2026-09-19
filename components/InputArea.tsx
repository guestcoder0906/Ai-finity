import React, { useState } from 'react';

interface InputAreaProps {
  onSend: (text: string) => void;
  disabled: boolean;
  recommendations?: string[];
}

const InputArea: React.FC<InputAreaProps> = ({ onSend, disabled, recommendations }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col border-t border-neutral-800 bg-neutral-900 pb-[env(safe-area-inset-bottom,0px)] shrink-0">
      {recommendations && recommendations.length > 0 && !disabled && (
        <div className="flex items-center gap-1.5 p-1.5 px-2.5 sm:px-4 bg-neutral-950 border-b border-neutral-800 overflow-x-auto no-scrollbar">
          {recommendations.map((rec, idx) => (
            <button
              key={idx}
              onClick={() => setInput(rec)}
              className="text-[11px] sm:text-xs bg-neutral-800 hover:bg-neutral-700 text-blue-300 px-2.5 py-1 rounded-full border border-neutral-700 transition-colors font-mono whitespace-nowrap shrink-0 active:scale-95"
            >
              {rec}
            </button>
          ))}
        </div>
      )}
      <form 
        onSubmit={handleSubmit} 
        className="p-2 sm:p-3 md:p-4 flex gap-1.5 sm:gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={disabled ? "Processing..." : "Enter action..."}
          disabled={disabled}
          className="flex-1 bg-black border border-neutral-700 rounded px-3 py-2 sm:px-4 sm:py-2.5 text-base sm:text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono transition-colors disabled:opacity-50"
          style={{ fontSize: '16px' }}
          autoComplete="off"
        />
        <button 
          type="submit" 
          disabled={disabled || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 sm:px-6 py-2 rounded text-xs sm:text-sm transition-colors disabled:bg-neutral-800 disabled:text-gray-500 active:scale-95 shrink-0"
        >
          SEND
        </button>
      </form>
    </div>
  );
};

export default InputArea;