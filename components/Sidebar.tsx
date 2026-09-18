import React, { useState, useEffect, useRef } from 'react';
import { UpdateItem } from '../types';
import { FileSystem } from '../services/fileSystem';
import { FileText, ChevronRight, ChevronDown, Activity, Settings, RefreshCw, Users, LogOut, Play, Map as MapIcon } from 'lucide-react';
import MapPanel, { MapPanelHandle } from './MapPanel';

interface SidebarProps {
  files: string[];
  fileSystem: FileSystem;
  updates: UpdateItem[];
  debugMode: boolean;
  onToggleDebug: () => void;
  onReset: () => void;
  expandedFile: string | null;
  setExpandedFile: (filename: string | null) => void;
  gameMode: 'menu' | 'singleplayer' | 'multiplayer';
  roomState: any;
  username: string;
  onKickPlayer: (user: string) => void;
  onLeaveGame: () => void;
  onForceTurn: () => void;
  onReferenceClick: (ref: string) => void;
  autoRecommendationsEnabled: boolean;
  onToggleAutoRecommendations: () => void;
  onHostClick: () => void;
  onJoinClick: () => void;
  syncCount: number;
  mapPanelRef: React.RefObject<MapPanelHandle | null>;
}

const Sidebar: React.FC<SidebarProps> = ({
  files,
  fileSystem,
  updates,
  debugMode,
  onToggleDebug,
  onReset,
  expandedFile,
  setExpandedFile,
  gameMode,
  roomState,
  username,
  onKickPlayer,
  onLeaveGame,
  onForceTurn,
  onReferenceClick,
  autoRecommendationsEnabled,
  onToggleAutoRecommendations,
  onHostClick,
  onJoinClick,
  syncCount,
  mapPanelRef
}) => {

  const [activeTab, setActiveTab] = useState<'files' | 'map'>('files');
  const isHost = roomState?.hostUsername === username;
  const expandedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expandedFile) {
      setActiveTab('files');
      // Use setTimeout to allow the DOM to update after switching tabs
      setTimeout(() => {
        if (expandedRef.current) {
          expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }, [expandedFile]);

  const formatContent = (content: string) => {
    if (!content) return '';
    let formatted = content;

    // Handle target(...) syntax
    formatted = formatted.replace(/target\((.*?)\)\[(.*?)\]/gs, (match, targets, innerText) => {
      const targetList = targets.split(',').map((t: string) => t.trim());
      if (debugMode || targetList.includes(username)) {
        return `<span class="text-purple-300 bg-purple-900/20 px-1 border border-dashed border-purple-800 rounded" title="Target: ${targets}">${innerText}</span>`;
      }
      return ''; // Hide completely for non-targets
    });

    // Handle hide[] syntax
    if (debugMode) {
      formatted = formatted.replace(/hide\[(.*?)\]/gs, '<span class="text-yellow-300 bg-yellow-900/20 px-1 border border-dashed border-yellow-800 rounded">$1</span>');
    } else {
      formatted = formatted.replace(/hide\[.*?\]/gs, '<span class="text-gray-600 italic font-mono">&#91;hidden&#93;</span>');
    }

    return formatted;
  };

  const parseLinks = (html: string) => {
    return html.replace(/(<[^>]+>)|\[([^\]]+)\]/g, (match, htmlTag, ref) => {
      if (htmlTag) return htmlTag;
      return `<span class="text-yellow-400 hover:text-yellow-200 hover:underline cursor-pointer" data-ref="${ref}">${ref}</span>`;
    });
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const refElement = target.closest('[data-ref]') as HTMLElement;
    if (refElement && refElement.dataset.ref) {
      onReferenceClick(refElement.dataset.ref);
    }
  };

  // Filter files based on hide[] and target()
  const visibleFiles = files.filter(filename => {
    if (debugMode) return true;

    // Check if filename has hide[]
    if (filename.includes('hide[')) return false;

    // Check if filename has target()
    const targetMatch = filename.match(/target\((.*?)\)/);
    if (targetMatch) {
      const targetList = targetMatch[1].split(',').map(t => t.trim().toLowerCase());
      if (!targetList.includes(username.toLowerCase())) return false;
    }

    // Check content for hide[] or target() that might hide the whole file
    // For simplicity, we just check if the file is a character file of another player
    if (filename.includes('-') && filename.endsWith('.txt') && !filename.endsWith(`-${username}.txt`) && !isHost) {
      // Let's rely on the filename containing hide[] or target() for hiding the whole file instead of trying to guess character files.
    }

    return true;
  });

  return (
    <div className="w-full md:w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col h-[40vh] md:h-full text-xs md:text-sm font-mono overflow-hidden">

      {gameMode === 'multiplayer' && roomState && (
        <div className="flex flex-col border-b border-neutral-800">
          <div className="p-2 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center text-gray-400 font-bold uppercase tracking-wider text-[10px]">
            <span className="flex items-center gap-1"><Users size={12} /> Players</span>
            <div className="flex items-center gap-2">
              {isHost && (
                <button onClick={onForceTurn} className="hover:text-blue-400 transition-colors flex items-center gap-1" title="Force Turn">
                  <Play size={12} /> Force
                </button>
              )}
              <button onClick={onLeaveGame} className="hover:text-red-400 transition-colors" title="Leave Game">
                <LogOut size={12} />
              </button>
            </div>
          </div>
          <div className="p-2 space-y-1 max-h-32 overflow-y-auto">
            {roomState.players.map((p: any) => (
              <div key={p.username} className="flex justify-between items-center bg-neutral-800/50 px-2 py-1 rounded">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-600'}`}></span>
                  <span className={p.username === username ? 'text-blue-300 font-bold' : 'text-gray-300'}>
                    {p.username} {p.username === roomState.hostUsername && '(Host)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === 'active' && p.hasCharacter && (
                    <span className={`text-[10px] ${p.isReady ? 'text-emerald-400' : 'text-yellow-400'}`}>
                      {p.isReady ? 'Ready' : 'Waiting'}
                    </span>
                  )}
                  {isHost && p.username !== username && (
                    <button onClick={() => {
                      if (confirm(`Kick ${p.username}?`)) onKickPlayer(p.username);
                    }} className="text-red-500 hover:text-red-400 text-[10px]">Kick</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!roomState || gameMode === 'singleplayer') && (
        <div className="flex flex-col border-b border-neutral-800 p-2 gap-2 bg-neutral-950">
          <button onClick={onHostClick} className="w-full bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800/50 p-1.5 rounded text-xs transition-colors">
            Host Multiplayer
          </button>
          <button onClick={onJoinClick} className="w-full bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-800/50 p-1.5 rounded text-xs transition-colors">
            Join Multiplayer
          </button>
        </div>
      )}

      {/* Files/Map Section */}
      <div className="flex-1 flex flex-col min-h-0 border-b border-neutral-800">
        <div className="p-2 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center text-gray-400 font-bold uppercase tracking-wider text-[10px]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-1 hover:text-white transition-colors ${activeTab === 'files' ? 'text-blue-400' : ''}`}
            >
              <FileText size={12} /> World Files
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`flex items-center gap-1 hover:text-white transition-colors ${activeTab === 'map' ? 'text-blue-400' : ''}`}
            >
              <MapIcon size={12} /> Map
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors" title="Toggle Auto Recommendations">
              <input type="checkbox" checked={autoRecommendationsEnabled} onChange={onToggleAutoRecommendations} className="hidden" />
              <span className={autoRecommendationsEnabled ? "text-blue-400" : ""}>AUTO</span>
            </label>
            {gameMode === 'singleplayer' && (
              <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
                <input type="checkbox" checked={debugMode} onChange={onToggleDebug} className="hidden" />
                <Settings size={12} className={debugMode ? "text-yellow-400" : ""} />
                <span className={debugMode ? "text-yellow-400" : ""}>DEBUG</span>
              </label>
            )}
            {gameMode === 'singleplayer' && (
              <button onClick={onReset} className="hover:text-red-400 transition-colors" title="Delete Adventure">
                <RefreshCw size={12} />
              </button>
            )}
          </div>
        </div>

        {activeTab === 'files' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {visibleFiles.map(filename => {
                const isExpanded = expandedFile === filename;
                const content = fileSystem.read(filename) || '';
                const displayName = fileSystem.getDisplayName(filename);

                return (
                  <div key={filename} ref={isExpanded ? expandedRef : null} className="bg-neutral-800/50 rounded overflow-hidden">
                    <div
                      className={`px-2 py-1.5 cursor-pointer hover:bg-neutral-800 flex items-center gap-2 ${isExpanded ? 'bg-neutral-800' : ''}`}
                      onClick={() => setExpandedFile(isExpanded ? null : filename)}
                    >
                      {isExpanded ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
                      <span className="text-blue-400 font-semibold truncate">{displayName}</span>
                    </div>
                    {isExpanded && (
                      <div
                        className="p-2 border-t border-neutral-700 bg-black text-gray-400 whitespace-pre-wrap text-[10px] md:text-xs leading-relaxed"
                        onClick={handleContentClick}
                      >
                        <span dangerouslySetInnerHTML={{ __html: parseLinks(formatContent(content)) }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Status Section inside Files Tab */}
            <div className="h-1/3 min-h-[120px] border-t border-neutral-800 flex flex-col bg-neutral-950">
              <div className="p-2 border-b border-neutral-800 bg-neutral-900 text-gray-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                <Activity size={12} /> Live Status Updates
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] md:text-xs">
                {updates.length === 0 && <span className="text-gray-700 italic">No updates...</span>}
                {updates.map((u, i) => (
                  <div key={i} className="mb-1 animate-in fade-in slide-in-from-left-2 duration-300">
                    <span className={
                      u.value < 0 ? 'text-red-400' :
                        u.value > 0 ? 'text-green-400' :
                          'text-yellow-400'
                    }>
                      {u.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden relative">
            <MapPanel ref={mapPanelRef} fileSystem={fileSystem} files={files} username={username} debugMode={debugMode} syncCount={syncCount} />
          </div>
        )}
      </div>

    </div>
  );
};

export default Sidebar;