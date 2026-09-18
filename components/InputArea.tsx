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
    <div className="flex flex-col border-t border-neutral-800 bg-neutral-900">
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
      <form 
        onSubmit={handleSubmit} 
        className="p-2 md:p-4 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={disabled ? "Processing..." : "Enter action..."}
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