import React, { useState, useEffect, useRef } from 'react';
import { UpdateItem } from '../types';
import { FileSystem } from '../services/fileSystem';
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Activity,
  Settings,
  RefreshCw,
  Users,
  LogOut,
  Play,
  Map as MapIcon,
  User,
  Zap,
  Bookmark,
  Share2,
  Crown
} from 'lucide-react';
import MapPanel, { MapPanelHandle } from './MapPanel';
import { actionQuotaService } from '../services/actionQuotaService';

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
  onOpenWelcome?: () => void;
  onOpenAuth?: (tab?: 'login' | 'signup' | 'guest') => void;
  onOpenPricing?: () => void;
  onOpenSavedAdventures?: () => void;
  onOpenCommunity?: () => void;
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
  mapPanelRef,
  onOpenWelcome,
  onOpenAuth,
  onOpenPricing,
  onOpenSavedAdventures,
  onOpenCommunity
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'map'>('files');
  const isHost = roomState?.hostUsername === username;
  const expandedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expandedFile) {
      setActiveTab('files');
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

    formatted = formatted.replace(/target\((.*?)\)\[(.*?)\]/gs, (match, targets, innerText) => {
      const targetList = targets.split(',').map((t: string) => t.trim());
      if (debugMode || targetList.includes(username)) {
        return `<span class="text-purple-300 bg-purple-900/20 px-1 border border-dashed border-purple-800 rounded" title="Target: ${targets}">${innerText}</span>`;
      }
      return '';
    });

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

  const visibleFiles = files.filter(filename => {
    if (debugMode) return true;
    if (filename.includes('hide[')) return false;

    const targetMatch = filename.match(/target\((.*?)\)/);
    if (targetMatch) {
      const targetList = targetMatch[1].split(',').map(t => t.trim().toLowerCase());
      if (!targetList.includes(username.toLowerCase())) return false;
    }

    return true;
  });

  return (
    <div className="w-full md:w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col h-[40vh] md:h-full text-xs md:text-sm font-mono overflow-hidden">
      {/* Aifinity Brand Header */}
      <div className="p-2.5 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
          <span className="font-bold tracking-wider text-sm bg-gradient-to-r from-blue-400 via-indigo-200 to-cyan-400 bg-clip-text text-transparent font-sans">
            Aifinity
          </span>
          <span className="text-[9px] text-neutral-500 border border-neutral-800 px-1 py-0.5 rounded font-mono">
            SANDBOX
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onOpenWelcome && (
            <button
              onClick={onOpenWelcome}
              className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-900/60 hover:border-blue-700 bg-blue-950/40 hover:bg-blue-900/60 px-2 py-0.5 rounded transition-all font-mono"
              title="Open Welcome & Guide"
            >
              Welcome
            </button>
          )}
        </div>
      </div>

      {/* Account / Identity Bar */}
      {onOpenAuth && (
        <div className="px-2.5 py-1.5 bg-neutral-950/80 border-b border-neutral-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            {actionQuotaService.isGoldenName() ? (
              <Crown size={12} className="text-amber-400 shrink-0 fill-amber-400/40" />
            ) : (
              <User
                size={12}
                className={
                  username.includes('(Guest)') || username.startsWith('guest') || username === 'Player'
                    ? 'text-amber-400 shrink-0'
                    : 'text-emerald-400 shrink-0'
                }
              />
            )}
            <span
              className={`truncate font-mono font-bold text-[11px] ${
                actionQuotaService.isGoldenName()
                  ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                  : 'text-white'
              }`}
              title={username}
            >
              {username}
            </span>
          {actionQuotaService.getQuotaState().profile?.role === 'admin' && (
            <span className="text-[9px] bg-indigo-950/80 border border-indigo-500 text-indigo-300 px-1 py-0.5 rounded font-mono flex items-center gap-1 shadow-[0_0_5px_rgba(99,102,241,0.5)]">
              <Sparkles size={8} className="text-cyan-300" /> Admin
            </span>
          )}
          {actionQuotaService.getQuotaState().profile?.role === 'mod' && (
            <span className="text-[9px] bg-amber-950/80 border border-amber-500 text-amber-300 px-1 py-0.5 rounded font-mono shadow-[0_0_5px_rgba(245,158,11,0.5)]">
              Mod
            </span>
          )}

          </div>
          <button
            onClick={() => onOpenAuth('login')}
            className="text-[10px] text-neutral-400 hover:text-white px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors shrink-0"
          >
            {username.includes('(Guest)') || username.startsWith('guest') || username === 'Player'
              ? 'Log In'
              : 'Account'}
          </button>
        </div>
      )}

      {/* Action Quota & Adventures Hub Quick Access Buttons */}
      <div className="grid grid-cols-3 gap-1 p-1.5 bg-black border-b border-neutral-800 text-[10px]">
        {onOpenPricing && (
          <button
            onClick={onOpenPricing}
            className="flex items-center justify-center gap-1 py-1.5 px-1 bg-neutral-900 hover:bg-neutral-800 text-amber-300 rounded border border-neutral-800 transition-colors"
            title="Aifinity Market: Action packs, subscriptions & free key"
          >
            <Zap size={11} className="text-amber-400" />
            <span className="truncate font-bold">Market</span>
          </button>
        )}
        {onOpenSavedAdventures && (
          <button
            onClick={onOpenSavedAdventures}
            className="flex items-center justify-center gap-1 py-1.5 px-1 bg-neutral-900 hover:bg-neutral-800 text-emerald-300 rounded border border-neutral-800 transition-colors"
            title="View or save multiple adventure campaigns"
          >
            <Bookmark size={11} className="text-emerald-400" />
            <span className="truncate">Saved</span>
          </button>
        )}
        {onOpenCommunity && (
          <button
            onClick={onOpenCommunity}
            className="flex items-center justify-center gap-1 py-1.5 px-1 bg-neutral-900 hover:bg-neutral-800 text-purple-300 rounded border border-neutral-800 transition-colors"
            title="Explore and share community adventures"
          >
            <Share2 size={11} className="text-purple-400" />
            <span className="truncate">Community</span>
          </button>
        )}
      </div>

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
