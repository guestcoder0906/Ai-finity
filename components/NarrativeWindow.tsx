import React, { useEffect, useRef } from 'react';
import { NarrativeEntry } from '../types';
import { FileSystem } from '../services/fileSystem';

interface NarrativeWindowProps {
  history: NarrativeEntry[];
  fileSystem: FileSystem; // Passed not for reading, but for resolving references if needed
  onReferenceClick: (ref: string) => void;
  debugMode: boolean;
  username: string;
}

const NarrativeWindow: React.FC<NarrativeWindowProps> = ({ history, onReferenceClick, debugMode, username }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Helper to parse text with [Links], hide[...], and target(...)
  const parseText = (text: string) => {
    let processed = text;

    // 1. Handle target(...)
    processed = processed.replace(/target\((.*?)\)\[(.*?)\]/gs, (match, targets, innerText) => {
      const targetList = targets.split(',').map((t: string) => t.trim().toLowerCase());
      if (debugMode || targetList.includes(username.toLowerCase())) {
        return `<span class="text-purple-300 bg-purple-900/20 px-1 border border-dashed border-purple-800 rounded" title="Target: ${targets}">${innerText}</span>`;
      }
      return ''; // Hide completely for non-targets
    });

    // 2. Handle hide[...]
    if (debugMode) {
      processed = processed.replace(/hide\[(.*?)\]/gs, (match, p1) => `<span class="bg-yellow-900/30 text-yellow-300 px-1 rounded border border-yellow-700/50 border-dashed">${p1}</span>`);
    } else {
      processed = processed.replace(/hide\[.*?\]/gs, '<span class="text-gray-600 italic font-mono">&#91;hidden&#93;</span>');
    }

    // 3. Handle Status/Effect/Outcome effects specially so they don't become clickable links
    // This catches patterns like [Status:Hidden(...)], [Effect:Poison], [Jump: Failure], [Perception: Success]
    processed = processed.replace(/\[((?:Status|Effect)\s*:[^\]]+)\]/gi, (match) => {
      return `<span class="text-blue-400 bg-blue-900/20 px-1 rounded border border-blue-800/50 font-semibold">${match}</span>`;
    });

    processed = processed.replace(/\[([^\]]+:\s*(?:Success|Failure|Critical Success|Critical Failure)[^\]]*)\]/gi, (match) => {
      const isSuccess = match.toLowerCase().includes('success');
      const color = isSuccess ? 'text-green-400 bg-green-900/20 border-green-800/50' : 'text-red-400 bg-red-900/20 border-red-800/50';
      return `<span class="${color} px-1 rounded border font-semibold">${match}</span>`;
    });

    // 4. Handle [Probability Check: ...] for detailed math
    processed = processed.replace(/\[Probability Check:\s*(.*?)\s*-\s*Result:\s*(.*?)\s*\|\s*Roll:\s*(.*?)\s*\|\s*Math:\s*(.*?)\s*\|\s*Thresholds:\s*(.*?)\]/g, (match, name, result, roll, math, thresholds) => {
      const isSuccess = result.toLowerCase().includes('success');
      const baseColor = isSuccess ? 'text-green-300' : 'text-red-300';

      return `<span class="group relative ${baseColor} border-b border-dashed border-current select-none ml-1 text-xs cursor-help inline-block">
        [Math: ${name}]
        <span class="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 md:w-80 p-2 bg-neutral-900 border border-neutral-700 rounded shadow-xl text-xs text-gray-300 z-50 pointer-events-none format-pre text-left max-w-[85vw] md:max-w-sm">
          <div class="font-bold text-blue-400 border-b border-neutral-800 pb-1 mb-1 truncate">${name}</div>
          <div class="grid grid-cols-2 gap-x-2 gap-y-1 mb-1">
            <span class="text-gray-500">Roll:</span> <span class="text-white">${roll}</span>
            <span class="text-gray-500">Result:</span> <span class="${baseColor} font-bold">${result}</span>
          </div>
          <div class="text-gray-500 mt-1 border-t border-neutral-800 pt-1 text-[10px] uppercase tracking-wider">Calculation</div>
          <div class="text-xs text-white mb-1 font-mono">${math}</div>
          <div class="text-gray-500 mb-1 border-t border-neutral-800 pt-1 text-[10px] uppercase tracking-wider">Thresholds</div>
          <div class="font-mono text-[10px] whitespace-pre-wrap break-all bg-black/30 p-1 rounded border border-neutral-800/50">${thresholds.replace(/&quot;/g, '"')}</div>
        </span>
      </span>`;
    });

    // 5. Handle [Object] links
    processed = processed.replace(/(<[^>]+>)|\[([^\]]+)\]/g, (match, htmlTag, ref) => {
      if (htmlTag) return htmlTag;
      return `<span class="text-yellow-400 hover:text-yellow-200 hover:underline cursor-pointer" data-ref="${ref}">${ref}</span>`;
    });

    return processed;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const refElement = target.closest('[data-ref]') as HTMLElement;
    if (refElement && refElement.dataset.ref) {
      onReferenceClick(refElement.dataset.ref);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono bg-black min-h-0" onClick={handleClick}>
      {history.length === 0 && (
        <div className="text-green-500 italic flex flex-col gap-2">
          <span>Initializing system connection...</span>
          <span>Enter world description to start adventure....</span>
        </div>
      )}

      {history.map((entry) => {
        const parsedHtml = parseText(entry.text);
        // If the entire entry is hidden (e.g., only contained a target() not meant for us), don't render an empty div
        if (!parsedHtml.trim() && entry.type !== 'user') return null;

        return (
          <div key={entry.id} className={`narrative-entry leading-relaxed ${entry.type === 'user' ? 'text-blue-400 font-bold border-l-2 border-blue-900 pl-2' :
            entry.type === 'system' ? 'text-green-500 italic' :
              'text-gray-300'
            }`}>
            {entry.type === 'user' && <span className="mr-2">&gt;</span>}
            <span dangerouslySetInnerHTML={{ __html: parsedHtml }} />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
};

export default NarrativeWindow;