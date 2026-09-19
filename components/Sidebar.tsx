import React, { useState, useEffect, useRef } from 'react';
import { UpdateItem } from '../types';
import { FileSystem } from '../services/fileSystem';
import { FileText, ChevronRight, ChevronDown, Activity, Settings, RefreshCw, Users, LogOut, Play, Map as MapIcon, User, Compass, ShoppingCart, Bookmark, Globe, Zap, Scale, Package, AlertTriangle, ShieldCheck, Gauge } from 'lucide-react';
import MapPanel, { MapPanelHandle } from './MapPanel';
import GoldenName from './GoldenName';
import { ActionStatus } from '../services/actionLimitService';
import { WeightInventoryEngine, CharacterPhysicalStats } from '../services/weightInventoryEngine';

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
  currentUser?: any;
  guestName?: string | null;
  onOpenAuth?: () => void;
  onOpenGuestName?: () => void;
  onLogout?: () => void;
  onNavigateWelcome?: () => void;
  onOpenAccount?: () => void;
  actionStatus?: ActionStatus;
  onOpenMarket?: (tab?: 'packs' | 'subscriptions' | 'apikey') => void;
  onOpenAdventures?: () => void;
  onOpenCommunity?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  files = [],
  fileSystem,
  updates = [],
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
  currentUser,
  guestName,
  onOpenAuth,
  onOpenGuestName,
  onLogout,
  onNavigateWelcome,
  onOpenAccount,
  actionStatus,
  onOpenMarket,
  onOpenAdventures,
  onOpenCommunity
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

      {/* Account / Guest Status Header */}
      <div className="p-2.5 bg-neutral-950 border-b border-neutral-800 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className={`w-2 h-2 rounded-full shrink-0 ${currentUser ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <div className="truncate flex items-center gap-1">
              {currentUser ? (
                <GoldenName
                  name={currentUser.username}
                  role={currentUser.role}
                  showGlowingName={currentUser.showGlowingName}
                  isGolden={currentUser.tier === 'legendary'}
                  className="font-bold text-gray-200 truncate"
                />
              ) : (
                <span className="font-bold text-gray-200 truncate">
                  {guestName ? `${guestName} (Guest)` : 'Player (Guest)'}
                </span>
              )}
              <span className={`text-[9px] px-1.5 py-0.2 rounded uppercase ml-1 ${
                currentUser?.tier === 'legendary'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : currentUser?.tier === 'adventurer'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'text-neutral-500'
              }`}>
                {currentUser ? (currentUser.tier || 'Account') : 'Guest'}
              </span>
            </div>
          </div>
          {onNavigateWelcome && (
            <button
              onClick={onNavigateWelcome}
              className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 border border-blue-900/60 bg-blue-950/40 px-2 py-0.5 rounded transition-colors shrink-0"
              title="View Welcome Page"
            >
              <Compass size={11} />
              <span>Welcome</span>
            </button>
          )}
        </div>

        {/* Action Status Bar */}
        {actionStatus && (
          <div className="p-1.5 bg-neutral-900/90 border border-neutral-800 rounded flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-neutral-300 truncate">
              <Zap size={11} className={actionStatus.isUnlimited ? "text-amber-400" : "text-emerald-400"} />
              {actionStatus.isUnlimited ? (
                <span className="font-bold text-amber-300">Unlimited Actions</span>
              ) : actionStatus.isGuest ? (
                <span>
                  <strong className="text-amber-400">{(actionStatus.guestActionsRemaining ?? actionStatus.dailyFreeRemaining ?? 0)}/{actionStatus.guestActionsTotal ?? 3}</strong> Guest Actions
                </span>
              ) : (
                <span>
                  <strong className="text-emerald-400">{(actionStatus.dailyFreeRemaining ?? 0)}/{(actionStatus.dailyFreeTotal ?? 20)}</strong> Free
                  {(actionStatus.purchasedCredits ?? 0) > 0 && (
                    <span className="text-amber-400 font-bold ml-1">+{actionStatus.purchasedCredits} Cr</span>
                  )}
                </span>
              )}
            </div>
            {onOpenMarket && (
              <button
                onClick={() => onOpenMarket('packs')}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-sans font-semibold text-[10px] transition-colors flex items-center gap-1 shrink-0"
                title="Open Market"
              >
                <span>Market</span>
                <span className="text-[9px] font-bold">+</span>
              </button>
            )}
          </div>
        )}

        {/* Action Quick Links: Adventures, Community, Market */}
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          {onOpenAdventures && (
            <button
              onClick={onOpenAdventures}
              className="bg-neutral-900 hover:bg-neutral-800 text-blue-300 border border-neutral-800 py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors"
              title="Saved Adventures"
            >
              <Bookmark size={11} />
              <span className="truncate">Adventures</span>
            </button>
          )}
          {onOpenCommunity && (
            <button
              onClick={onOpenCommunity}
              className="bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border border-neutral-800 py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors"
              title="Community Adventures"
            >
              <Globe size={11} />
              <span className="truncate">Community</span>
            </button>
          )}
          {onOpenMarket && (
            <button
              onClick={() => onOpenMarket('packs')}
              className="bg-neutral-900 hover:bg-neutral-800 text-amber-300 border border-neutral-800 py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors"
              title="Aifinity Market"
            >
              <ShoppingCart size={11} />
              <span className="truncate">Market</span>
            </button>
          )}
        </div>

        <div className="flex gap-1.5 text-[10px]">
          {currentUser ? (
            <div className="flex gap-1.5 w-full">
              <button
                id="sidebar-account-btn"
                onClick={onOpenAccount}
                className={`flex-1 py-1 px-2 rounded border font-semibold flex items-center justify-center gap-1 transition-colors truncate ${
                  currentUser.role === 'admin'
                    ? 'bg-sky-950/80 hover:bg-sky-900 border-cyan-400/70 text-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.25)]'
                    : currentUser.role === 'mod'
                    ? 'bg-amber-950/80 hover:bg-amber-900 border-amber-400/70 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-blue-300'
                }`}
                title="Account Settings & Permissions"
              >
                <User size={11} />
                <span className="truncate">{currentUser.role === 'admin' ? 'Account (Admin)' : currentUser.role === 'mod' ? 'Account (Mod)' : 'Account'}</span>
              </button>
              <button
                onClick={onLogout}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white py-1 px-2 rounded border border-neutral-700 transition-colors shrink-0"
                title="Log Out (Switch to Guest)"
              >
                Log Out
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onOpenGuestName}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-amber-300 py-1 px-2 rounded border border-neutral-700 transition-colors truncate"
              >
                {guestName ? 'Edit Guest Name' : 'Set Guest Name'}
              </button>
              <button
                onClick={onOpenAuth}
                className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white font-semibold py-1 px-2 rounded transition-colors truncate"
              >
                Log In / Sign Up
              </button>
            </>
          )}
        </div>
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
            {(roomState.players || []).map((p: any) => (
              <div key={p.username} className="flex justify-between items-center bg-neutral-800/50 px-2 py-1 rounded">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-600'}`}></span>
                  <span className={p.username === username ? 'text-blue-300 font-bold' : 'text-gray-300'}>
                    <GoldenName
                      name={p.username}
                      role={p.role}
                      showGlowingName={p.showGlowingName}
                      isGolden={p.tier === 'legendary'}
                    /> {p.username === roomState.hostUsername && '(Host)'}
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
                      <div className="border-t border-neutral-700 bg-black">
                        {(() => {
                          const isEntity = content.includes('[NAME & DESCRIPTION]') || content.includes('[STATS & MODIFIERS]') || content.includes('[CONTAINERS') || content.includes('[INVENTORY');
                          if (!isEntity) return null;

                          const pStats = WeightInventoryEngine.parseCharacterStatsAndInventory(content);
                          if (!pStats || (!pStats.dimensionsApply && pStats.bodyWeight === 0 && pStats.containers.length === 0)) return null;

                          const isOverLift = pStats.totalCarriedWeight > pStats.maxLiftStrength;
                          const ratio = pStats.encumbranceRatio;
                          let barColor = 'bg-emerald-500';
                          if (isOverLift) barColor = 'bg-red-600 animate-pulse';
                          else if (ratio > 50) barColor = 'bg-amber-500';
                          else if (ratio > 20) barColor = 'bg-yellow-500';

                          const meterWidth = Math.min(100, Math.max(2, (pStats.totalCarriedWeight / Math.max(1, pStats.maxLiftStrength)) * 100));

                          return (
                            <div className="p-2.5 bg-neutral-900/90 border-b border-neutral-800 text-[11px] font-sans space-y-2">
                              {/* Character Physical Dimensions & Body Weight */}
                              <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-neutral-800">
                                <div className="flex items-center gap-1.5 text-gray-200 font-semibold">
                                  <Scale size={13} className="text-cyan-400" />
                                  <span>Physical Profile</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-gray-300 border border-neutral-700">
                                    Weight: <strong className="text-white">{pStats.bodyWeight} lbs</strong>
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-gray-300 border border-neutral-700">
                                    Dims: <strong className="text-white">{pStats.dimensionsApply ? (pStats.dimensionsRaw || `${pStats.height || '?'} x ${pStats.width || '?'}`) : 'Incorporeal'}</strong>
                                  </span>
                                </div>
                              </div>

                              {/* Encumbrance Meter & Status */}
                              <div>
                                <div className="flex justify-between items-center text-[10px] mb-1">
                                  <span className="text-gray-400 flex items-center gap-1">
                                    <Package size={11} className="text-gray-400" />
                                    Carried: <strong className="text-white">{pStats.totalCarriedWeight} lbs</strong> / {pStats.bodyWeight} lbs ({ratio}%)
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide ${
                                    isOverLift
                                      ? 'bg-red-950 text-red-400 border border-red-800'
                                      : !pStats.encumbranceApplies
                                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                                        : pStats.isEncumbered
                                          ? 'bg-yellow-950 text-yellow-300 border border-yellow-800'
                                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  }`}>
                                    {isOverLift
                                      ? 'Overburdened (Cannot Lift)'
                                      : !pStats.encumbranceApplies
                                        ? 'Immune to Encumbrance'
                                        : pStats.isEncumbered
                                          ? `Encumbered (>${pStats.encumbranceThreshold}% Slower Speed)`
                                          : `Unencumbered (Good <=${pStats.encumbranceThreshold}%)`}
                                  </span>
                                </div>

                                {/* Visual Progress Bar */}
                                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800 relative">
                                  {pStats.encumbranceApplies && (
                                    <div
                                      className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/60 z-10"
                                      style={{ left: `${Math.min(100, (pStats.encumbranceThreshold / 100) * (pStats.bodyWeight / Math.max(1, pStats.maxLiftStrength)) * 100)}%` }}
                                      title={`${pStats.encumbranceThreshold}% Encumbrance Threshold`}
                                    />
                                  )}
                                  <div className={`h-full ${!pStats.encumbranceApplies ? 'bg-indigo-500' : barColor} transition-all duration-300`} style={{ width: `${meterWidth}%` }} />
                                </div>

                                <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                                  <span>0 lbs</span>
                                  {pStats.encumbranceApplies ? (
                                    <span className="text-yellow-500">{pStats.encumbranceThreshold}% Threshold ({Math.round(pStats.bodyWeight * (pStats.encumbranceThreshold / 100))} lbs)</span>
                                  ) : (
                                    <span className="text-indigo-400 italic">{pStats.encumbranceImmunityReason || 'Dynamic Biology: Immune'}</span>
                                  )}
                                  <span>Max Lift: {pStats.maxLiftStrength} lbs</span>
                                </div>
                              </div>

                              {/* Speed & Mobility */}
                              <div className="flex items-center justify-between text-[10px] bg-neutral-950/60 p-1.5 rounded border border-neutral-800/80">
                                <span className="text-gray-400 flex items-center gap-1">
                                  <Gauge size={11} className="text-cyan-400" />
                                  Effective Speed:
                                </span>
                                <div className="flex gap-2">
                                  <span className={pStats.isEncumbered ? 'text-yellow-400 font-mono font-medium' : 'text-emerald-400 font-mono'}>
                                    Walk: {pStats.currentWalkingSpeed} m/s
                                  </span>
                                  <span className={pStats.isEncumbered ? 'text-yellow-400 font-mono font-medium' : 'text-emerald-400 font-mono'}>
                                    Run: {pStats.currentRunningSpeed} m/s
                                  </span>
                                  {pStats.isEncumbered && (
                                    <span className="text-[9px] text-yellow-500 font-semibold">(Penalty Active)</span>
                                  )}
                                </div>
                              </div>

                              {/* Containers & Overflow Detection */}
                              {pStats.containers.length > 0 && (
                                <div className="space-y-1 pt-1 border-t border-neutral-800">
                                  <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                                    <Package size={11} className="text-blue-400" />
                                    Equipped Containers ({pStats.containers.length}):
                                  </div>
                                  {pStats.containers.map((cont, ci) => (
                                    <div key={ci} className="bg-neutral-950/80 p-1.5 rounded border border-neutral-800 text-[10px]">
                                      <div className="flex justify-between items-center">
                                        <span className="text-blue-300 font-medium">{cont.name}</span>
                                        <span className="text-gray-400 font-mono text-[9px]">
                                          Max Space: {cont.maxDimensions.raw || '18x12"'} | Weight: {cont.totalWeight} lbs
                                        </span>
                                      </div>
                                      {cont.hasOverflow && (
                                        <div className="mt-1 flex items-center gap-1 text-[9px] text-amber-400 bg-amber-950/50 p-1 rounded border border-amber-800/60">
                                          <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                                          <span>Container Overflow: item exceeds dimensions and risks dropping during story!</span>
                                        </div>
                                      )}
                                      {cont.items.length > 0 && (
                                        <div className="mt-1 text-[9px] text-gray-400 pl-1 border-l border-neutral-800 space-y-0.5">
                                          {cont.items.map((it, ii) => (
                                            <div key={ii} className="flex justify-between items-center">
                                              <span className={it.isOverflow ? 'text-amber-300 font-semibold' : 'text-gray-300'}>
                                                • {it.name} {it.isOverflow && '⚠️ (Overflow: Risks Dropping)'}
                                              </span>
                                              <span className="font-mono text-gray-500">{it.weight} lbs ({it.dimensions.raw || 'No dim'})</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Stored Items (Not on Person) */}
                              {pStats.storedItems.length > 0 && (
                                <div className="text-[9px] text-gray-500 italic bg-neutral-950 p-1 rounded border border-neutral-800/60 flex items-center justify-between">
                                  <span>📦 {pStats.storedItems.length} items owned & stored off-person</span>
                                  <span className="text-gray-600">(Excluded from carried weight)</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div
                          className="p-2 text-gray-400 whitespace-pre-wrap text-[10px] md:text-xs leading-relaxed"
                          onClick={handleContentClick}
                        >
                          <span dangerouslySetInnerHTML={{ __html: parseLinks(formatContent(content)) }} />
                        </div>
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
                {(updates || []).length === 0 && <span className="text-gray-700 italic">No updates...</span>}
                {(updates || []).map((u, i) => (
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