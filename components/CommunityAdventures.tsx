import React, { useState, useEffect } from 'react';
import {
  Users,
  Sparkles,
  Share2,
  Lock,
  ArrowRight,
  Eye,
  Plus,
  Play,
  Heart,
  Crown,
  BookOpen,
  Filter,
  RefreshCw,
  Clock,
  Trash2,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import {
  communityService,
  CommunityAdventureRecord
} from '../services/communityService';
import {
  actionQuotaService,
  SavedAdventure
} from '../services/actionQuotaService';
import { authService } from '../services/authService';
import { auth } from '../services/firebase';
import { userService } from '../services/userService';

interface CommunityAdventuresProps {
  onLoadAdventure: (scenarioPrompt: string, fullState?: any) => void;
  onOpenPricing: () => void;
  onBackToGame: () => void;
  currentAdventure?: SavedAdventure | null;
}

export default function CommunityAdventures({
  onLoadAdventure,
  onOpenPricing,
  onBackToGame,
  currentAdventure
}: CommunityAdventuresProps) {
  const [adventures, setAdventures] = useState<CommunityAdventureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'full_adventure' | 'starting_prompt_only' | 'initial_ai_generation' | 'my_posts'>('all');
  const [selectedAdventure, setSelectedAdventure] = useState<CommunityAdventureRecord | null>(null);

  // Take down confirmation modal state
  const [adventureToTakeDown, setAdventureToTakeDown] = useState<CommunityAdventureRecord | null>(null);
  const [isTakingDown, setIsTakingDown] = useState(false);
  const [takeDownNotice, setTakeDownNotice] = useState('');

  // Limit reached modal for free users (1 post max)
  const [limitReachedModalOpen, setLimitReachedModalOpen] = useState(false);

  // Upgrade prompt modal state for free users trying to post saved archives
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Sharing modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [adventureSource, setAdventureSource] = useState<'current' | 'saved'>('current');
  const [savedList, setSavedList] = useState<SavedAdventure[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string>('');
  const [shareType, setShareType] = useState<'full_adventure' | 'starting_prompt_only' | 'initial_ai_generation'>('full_adventure');
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [isNsfw, setIsNsfw] = useState(false);
  const [showNsfwWarning, setShowNsfwWarning] = useState(false);
  const [viewNsfw, setViewNsfw] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityAdventureRecord | null>(null);
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const isUnlimitedSubscriber = actionQuotaService.isCommunityUnlimited();
  const session = authService.getSession();
  const authorName = authService.getSingleplayerName();
  const authorUid = auth.currentUser?.uid;
  const userProfile = userService.getProfile();
  const isAdminOrMod = userProfile?.role === 'admin' || userProfile?.role === 'mod';

  // Compute adventures active in community authored by current user
  const myActivePosts = communityService.getUserActivePosts(adventures, authorName, authorUid);

  const fetchAdventures = async () => {
    setLoading(true);
    try {
      const list = await communityService.getAdventures();
      setAdventures(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdventures();
    setSavedList(actionQuotaService.getSavedAdventures());
  }, []);

  const handleOpenShare = () => {
    // If free user already has 1 active post, show limit reached modal
    if (!isUnlimitedSubscriber && myActivePosts.length >= 1) {
      setLimitReachedModalOpen(true);
      return;
    }

    const saves = actionQuotaService.getSavedAdventures();
    setSavedList(saves);

    // Free users default to and use current active game
    if (!isUnlimitedSubscriber) {
      setAdventureSource('current');
      if (currentAdventure) {
        setCustomTitle(currentAdventure.title);
      } else {
        setCustomTitle('My Epic Adventure');
      }
    } else {
      if (currentAdventure) {
        setAdventureSource('current');
        setCustomTitle(currentAdventure.title);
      } else if (saves.length > 0) {
        setAdventureSource('saved');
        setSelectedSavedId(saves[0].id);
        setCustomTitle(saves[0].title);
      } else {
        setAdventureSource('current');
        setCustomTitle('My Epic Adventure');
      }
    }

    setIsShareModalOpen(true);
    setShareError('');
    setShareSuccess('');
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verify limit for free users
    if (!isUnlimitedSubscriber && myActivePosts.length >= 1) {
      setLimitReachedModalOpen(true);
      return;
    }

    if (!isUnlimitedSubscriber && adventureSource === 'saved') {
      setShowUpgradeModal(true);
      return;
    }

    let prompt = '';
    let initialGen = '';
    let fullNarrative = '';

    if (adventureSource === 'current') {
      if (!currentAdventure) {
        setShareError('No current active adventure in progress. Start playing or enter an action first to share your current game!');
        return;
      }
      prompt = currentAdventure.scenarioPrompt;
      initialGen = currentAdventure.initialGeneration || currentAdventure.narrative?.find(n => n.type === 'ai')?.text || '';
      fullNarrative = currentAdventure.narrative?.map((n: any) => `[${n.type?.toUpperCase()}]: ${n.text}`).join('\n\n') || '';
    } else {
      const targetSave = savedList.find(s => s.id === selectedSavedId) || savedList[0];
      if (!targetSave && !currentAdventure) {
        setShareError('No adventure available to share. Save an adventure or start playing first!');
        return;
      }
      prompt = targetSave ? targetSave.scenarioPrompt : (currentAdventure?.scenarioPrompt || 'An adventurous hero in Aifinity.');
      initialGen = targetSave?.initialGeneration || targetSave?.narrative?.find((n: any) => n.type === 'ai')?.text || 'The journey begins in a quiet crossroads taverna...';
      fullNarrative = targetSave?.narrative?.map((n: any) => `[${n.type?.toUpperCase()}]: ${n.text}`).join('\n\n') || '';
    }


    const isAutoNsfw = ["gore","sex","blood","rape","murder","erotic","nsfw","porn"].some(kw => prompt.toLowerCase().includes(kw) || initialGen.toLowerCase().includes(kw) || fullNarrative.toLowerCase().includes(kw) || customTitle.toLowerCase().includes(kw) || customDescription.toLowerCase().includes(kw));
    const finalNsfw = isNsfw || isAutoNsfw;

    setIsPosting(true);
    const result = await communityService.postAdventure({
      title: customTitle.trim() || (adventureSource === 'current' ? currentAdventure?.title : 'Community Adventure') || 'Community Adventure',
      authorName,
      description: customDescription.trim(),
      isNsfw: finalNsfw,
      authorUid,
      shareType,
      startingPrompt: prompt,
      initialGeneration: shareType !== 'starting_prompt_only' ? initialGen : undefined,
      fullNarrativeText: shareType === 'full_adventure' ? fullNarrative : undefined
    });
    setIsPosting(false);

    if (result.success) {
      setShareSuccess('Adventure successfully published to the Community!');
      fetchAdventures();
      setTimeout(() => {
        setIsShareModalOpen(false);
      }, 1200);
    } else {
      setShareError(result.error || 'Failed to post.');
    }
  };

  const handleConfirmTakeDown = async () => {
    if (!adventureToTakeDown) return;
    setIsTakingDown(true);
    const res = await communityService.deleteAdventure(adventureToTakeDown.id);
    setIsTakingDown(false);

    if (res.success) {
      if (selectedAdventure?.id === adventureToTakeDown.id) {
        setSelectedAdventure(null);
      }
      const removedTitle = adventureToTakeDown.title;
      setAdventureToTakeDown(null);
      setTakeDownNotice(`Adventure "${removedTitle}" was taken down from the community.`);
      fetchAdventures();
      setTimeout(() => setTakeDownNotice(''), 4000);
    } else {
      alert(res.error || 'Failed to take down adventure.');
    }
  };

  const filteredAdventures = adventures.filter(a => {
    if (filterType === 'my_posts') {
      return communityService.isUserAuthor(a, authorName,
      
      authorUid);
    }
    if (filterType === 'all') return true;
    return a.shareType === filterType;
  });

  return (
    <div className="fixed inset-0 z-40 bg-black text-gray-200 overflow-y-auto font-sans flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToGame}
            className="text-xs font-mono text-neutral-400 hover:text-white px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 transition-colors"
          >
            ← Return to Sandbox
          </button>
          <div className="h-4 w-[1px] bg-neutral-800" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center text-white font-bold text-xs">
              ∞
            </div>
            <h1 className="text-sm sm:text-base font-bold text-white font-mono tracking-wide">
              Community Adventures
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Post Quota status indicator */}
          {!isUnlimitedSubscriber ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-[11px] font-mono">
              <span className="text-neutral-500">Post Slot:</span>
              <span className={myActivePosts.length >= 1 ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                {myActivePosts.length}/1 (Free Tier)
              </span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-900 border border-amber-900/60 text-[11px] font-mono text-amber-300">
              <Crown size={11} />
              <span>Unlimited Posts (Subscriber)</span>
            </div>
          )}

          <button
            onClick={handleOpenShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all shadow-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white"
          >
            <Share2 size={13} />
            <span>Post Adventure</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 space-y-6">
        {/* Banner Notice when adventure is taken down */}
        {takeDownNotice && (
          <div className="bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-xs font-mono shadow-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>{takeDownNotice}</span>
            </div>
            <button onClick={() => setTakeDownNotice('')} className="text-emerald-400 hover:text-white">
              &times;
            </button>
          </div>
        )}

        {/* Hero Hub Banner */}
        <div className="relative p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-neutral-950 via-neutral-900 to-indigo-950/40 border border-neutral-800 overflow-hidden">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono text-blue-400 bg-blue-950/60 px-2.5 py-0.5 rounded-full border border-blue-800/50">
              <Sparkles size={12} />
              <span>DISCOVER & PLAY COMMUNITY SCENARIOS</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Community Adventures Hub
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed font-sans">
              Play other players' exact adventures, start from their unique prompts, or branch from their AI's initial world-generation.
              Free players can share their current adventure (max 1 active post) and take it down anytime. $9.99+ monthly Adventurers get unlimited posts and multi-saves!
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-neutral-400">
            <div className="flex items-center gap-2 text-neutral-300">
              <Sparkles size={14} className="text-blue-400" />
              <span>
                {!isUnlimitedSubscriber
                  ? `Your Community Status: Free Tier (${myActivePosts.length}/1 post slot used).`
                  : 'Your Community Status: Adventurer Subscriber (Unlimited community posts).'}
              </span>
            </div>
            {!isUnlimitedSubscriber && (
              <button
                onClick={onOpenPricing}
                className="text-blue-400 hover:text-blue-300 underline font-semibold flex items-center gap-1"
              >
                <Crown size={12} className="text-amber-400" />
                <span>Upgrade for Unlimited Community Posts ($9.99/mo) →</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-neutral-800 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={13} className="text-neutral-500" />
            <span className="text-neutral-500 uppercase tracking-wider text-[11px]">Filter:</span>
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('full_adventure')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterType === 'full_adventure'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              Exact Full Adventure
            </button>
            <button
              onClick={() => setFilterType('initial_ai_generation')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterType === 'initial_ai_generation'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              Initial AI World Generation
            </button>
            <button
              onClick={() => setFilterType('starting_prompt_only')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterType === 'starting_prompt_only'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              Starting Prompt Only
            </button>
            <button
              onClick={() => setFilterType('my_posts')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                filterType === 'my_posts'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              <span>My Posts</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filterType === 'my_posts' ? 'bg-emerald-800 text-white' : 'bg-neutral-800 text-emerald-400'
              }`}>
                {myActivePosts.length}
              </span>
            </button>
          </div>

          <button
            onClick={fetchAdventures}
            className="flex items-center gap-1 text-neutral-400 hover:text-white p-1 text-xs"
            title="Refresh adventures"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* NSFW Toggle */}
<div className="flex items-center gap-2 pb-2 text-xs font-mono">
  <label className="flex items-center gap-2 cursor-pointer text-red-400 hover:text-red-300">
    <input type="checkbox" checked={viewNsfw} onChange={(e) => setViewNsfw(e.target.checked)} className="accent-red-500 rounded" />
    <span>View NSFW Content</span>
  </label>
  {viewNsfw && <span className="text-[10px] text-red-500 bg-red-950/30 px-2 py-0.5 rounded">Warning: Contains adult content</span>}
</div>

        {/* Empty state for my_posts filter */}
        {filterType === 'my_posts' && myActivePosts.length === 0 && (
          <div className="text-center py-12 px-4 border border-dashed border-neutral-800 rounded-2xl space-y-3 font-mono">
            <p className="text-sm text-neutral-400">You haven't posted any adventures to the community yet.</p>
            <p className="text-xs text-neutral-500">
              {currentAdventure
                ? 'You have an active adventure in progress that you can share with 1 click!'
                : 'Start an adventure scenario in the sandbox, then share it here!'}
            </p>
            <button
              onClick={handleOpenShare}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
            >
              <Share2 size={13} />
              <span>Post Your Adventure Now</span>
            </button>
          </div>
        )}

        {/* Adventures Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAdventures.map(adv => {
            const isMine = communityService.isUserAuthor(adv, authorName, authorUid);
            const canDelete = isMine || isAdminOrMod;
            if (adv.isNsfw && !viewNsfw && !isMine && !isAdminOrMod) return null;
            return (
              <div
                key={adv.id}
                className={`border rounded-xl p-5 flex flex-col justify-between transition-all group hover:shadow-xl ${
                  isMine
                    ? 'border-emerald-700/60 bg-gradient-to-b from-neutral-900/90 to-emerald-950/20 hover:border-emerald-500'
                    : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 hover:shadow-blue-900/10'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${
                          adv.shareType === 'full_adventure'
                            ? 'bg-blue-950/60 border-blue-800 text-blue-300'
                            : adv.shareType === 'initial_ai_generation'
                            ? 'bg-purple-950/60 border-purple-800 text-purple-300'
                            : 'bg-amber-950/60 border-amber-800 text-amber-300'
                        }`}
                      >
                        {adv.shareType === 'full_adventure'
                          ? 'Full Adventure'
                          : adv.shareType === 'initial_ai_generation'
                          ? 'Initial AI Gen'
                          : 'Starting Prompt'}
                      </span>
                      {isMine && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-600 text-emerald-300 font-bold">
                          ★ My Post
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-neutral-500">
                      by {adv.authorName}
                    </span>
                  </div>

                                    <h3 className="text-base font-bold text-white group-hover:text-blue-300 transition-colors line-clamp-2 mb-2 flex items-center gap-2">
                    <span>{adv.title}</span>
                    {adv.isNsfw && (
                      <span className="text-[10px] bg-red-950/60 border border-red-800 text-red-300 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                        NSFW
                      </span>
                    )}
                  </h3>

                  {adv.description && (
                    <p className="text-[11px] text-neutral-300 italic mb-2">
                      {adv.description}
                    </p>
                  )}
                  <p className="text-xs text-neutral-400 leading-relaxed font-sans line-clamp-3 mb-4">
                    {adv.shareType === 'initial_ai_generation' && adv.initialGeneration
                      ? adv.initialGeneration
                      : adv.startingPrompt}
                  </p>

                  {adv.tags && (
                    <div className="text-[10px] font-mono text-neutral-500 mb-4">
                      Tags: {adv.tags}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedAdventure(adv)}
                      className="text-xs font-mono text-neutral-400 hover:text-white flex items-center gap-1"
                    >
                      <Eye size={12} />
                      <span>Preview</span>
                    </button>

                    {/* Take Down button on user's own adventures */}
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdventureToTakeDown(adv);
                        }}
                        className="text-xs font-mono text-red-400 hover:text-red-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-950/50 border border-transparent hover:border-red-800/60 transition-colors"
                        title="Take down this adventure from the community"
                      >
                        <Trash2 size={11} />
                        <span>{isMine ? 'Take Down' : 'Moderate (Delete)'}</span>
                      </button>
                    )}
                    {isMine && (
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           setEditingPost(adv);
                           setCustomTitle(adv.title || '');
                           setCustomDescription(adv.description || '');
                           setIsNsfw(adv.isNsfw || false);
                         }}
                         className="text-xs font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-blue-950/50 border border-transparent hover:border-blue-800/60 transition-colors"
                       >
                         Edit
                       </button>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      onLoadAdventure(adv.startingPrompt);
                      onBackToGame();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold transition-colors shadow-sm"
                  >
                    <Play size={12} />
                    <span>Play This</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      
      {/* EDIT POST MODAL */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-lg p-5 sm:p-6 flex flex-col font-mono shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Edit Adventure Post</h3>
              <button
                onClick={() => setEditingPost(null)}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-neutral-400 text-xs mb-1">Adventure Name</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-neutral-400 text-xs mb-1">Description (Optional)</label>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Tell the community what to expect..."
                />
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer mt-2 text-sm text-neutral-300 hover:text-white">
                <input 
                  type="checkbox" 
                  checked={isNsfw} 
                  onChange={(e) => setIsNsfw(e.target.checked)} 
                  className="accent-red-500 rounded" 
                />
                <span className="text-red-400 font-bold">Mark as NSFW (Adult Content)</span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingPost(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsPosting(true);
                  const nsfwKeywords = ['gore', 'sex', 'blood', 'rape', 'murder', 'erotic', 'nsfw', 'porn'];
                  const prompt = editingPost.startingPrompt;
                  const initialGen = editingPost.initialGeneration || '';
                  const fullNarrative = editingPost.fullNarrativeText || '';
                  const isAutoNsfw = nsfwKeywords.some(kw => prompt.toLowerCase().includes(kw) || initialGen.toLowerCase().includes(kw) || fullNarrative.toLowerCase().includes(kw) || customTitle.toLowerCase().includes(kw) || customDescription.toLowerCase().includes(kw));
                  const finalNsfw = isNsfw || isAutoNsfw;
                  
                  await communityService.updateAdventure(editingPost.id, {
                    title: customTitle.trim() || 'Community Adventure',
                    description: customDescription.trim(),
                    isNsfw: finalNsfw
                  });
                  setIsPosting(false);
                  setEditingPost(null);
                  fetchAdventures();
                }}
                disabled={isPosting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
              >
                {isPosting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL PREVIEW MODAL */}
      {selectedAdventure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400">
                  {selectedAdventure.shareType.replace(/_/g, ' ')}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>{selectedAdventure.title}</span>
                  {selectedAdventure.isNsfw && (
                    <span className="text-[10px] bg-red-950/60 border border-red-800 text-red-300 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                      NSFW
                    </span>
                  )}
                  {communityService.isUserAuthor(selectedAdventure, authorName, authorUid) && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-600 text-emerald-300 font-bold">
                      ★ Your Post
                    </span>
                  )}
                </h3>
                <p className="text-xs text-neutral-400 font-mono">
                  Created by {selectedAdventure.authorName}
                </p>
              </div>
              <button
                onClick={() => setSelectedAdventure(null)}
                className="text-neutral-400 hover:text-white text-lg p-1"
              >
                &times;
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs text-neutral-300 flex-1">
              {selectedAdventure.description && (
                <div className="mb-4">
                  <h4 className="text-neutral-400 font-bold mb-1 uppercase text-[11px]">Description:</h4>
                  <div className="p-3 bg-black rounded-lg border border-neutral-800 text-neutral-200">
                    {selectedAdventure.description}
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-neutral-400 font-bold mb-1 uppercase text-[11px]">Starting Scenario Prompt:</h4>
                <div className="p-3 bg-black rounded-lg border border-neutral-800 text-neutral-200">
                  {selectedAdventure.startingPrompt}
                </div>
              </div>

              {selectedAdventure.initialGeneration && (
                <div>
                  <h4 className="text-neutral-400 font-bold mb-1 uppercase text-[11px]">Initial World Generation:</h4>
                  <div className="p-3 bg-black rounded-lg border border-neutral-800 text-neutral-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {selectedAdventure.initialGeneration}
                  </div>
                </div>
              )}

              {selectedAdventure.fullNarrativeText && (
                <div>
                  <h4 className="text-neutral-400 font-bold mb-1 uppercase text-[11px]">Full Adventure Narrative:</h4>
                  <div className="p-3 bg-black rounded-lg border border-neutral-800 text-neutral-200 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                    {selectedAdventure.fullNarrativeText}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-2">
              <div>
                {/* Take down button inside detail preview if author */}
                {communityService.isUserAuthor(selectedAdventure, authorName, authorUid) && (
                  <button
                    onClick={() => {
                      setAdventureToTakeDown(selectedAdventure);
                    }}
                    className="px-3 py-2 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/80 font-bold rounded text-xs font-mono flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 size={12} />
                    <span>Take Down Adventure</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedAdventure(null)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs font-mono"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    onLoadAdventure(selectedAdventure.startingPrompt);
                    setSelectedAdventure(null);
                    onBackToGame();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs font-mono flex items-center gap-1.5 shadow-md"
                >
                  <Play size={12} />
                  <span>Launch Adventure</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHARE ADVENTURE MODAL */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl font-mono text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Share2 size={16} className="text-blue-400" />
                <h3 className="text-sm font-bold text-white">Post to Community Adventures</h3>
              </div>
              <button onClick={() => setIsShareModalOpen(false)} className="text-neutral-400 hover:text-white text-base">
                &times;
              </button>
            </div>

            {/* Quota & tier notice */}
            {!isUnlimitedSubscriber ? (
              <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/60 text-neutral-300 space-y-1 font-sans text-xs">
                <div className="flex items-center gap-1.5 text-blue-300 font-bold font-mono">
                  <Sparkles size={13} />
                  <span>Free Account Community Access</span>
                </div>
                <p>
                  You can post your <strong>current active adventure</strong> to the Community (maximum 1 active post). You can take down your post at any time to share a new one!
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-neutral-300 space-y-1 font-sans text-xs">
                <div className="flex items-center gap-1.5 text-amber-300 font-bold font-mono">
                  <Crown size={13} />
                  <span>Adventurer Tier Active: Unlimited Community Posts</span>
                </div>
                <p>
                  You have full unlimited posting privileges from both your current game and saved adventures!
                </p>
              </div>
            )}

            {shareError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded text-red-300 font-sans">
                {shareError}
              </div>
            )}

            {shareSuccess && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded text-emerald-300 font-sans flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{shareSuccess}</span>
              </div>
            )}

            <form onSubmit={handlePostSubmit} className="space-y-4">
              <div>
                <label className="block text-neutral-400 mb-1">Adventure Title</label>
                <input
                  type="text"
                  required
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. The Chronicles of Eldoria"
                  className="w-full px-3 py-2 bg-black border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Adventure Description (Optional)</label>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-black border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="A short summary of this adventure..."
                />
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-300 hover:text-white">
                <input 
                  type="checkbox" 
                  checked={isNsfw} 
                  onChange={(e) => setIsNsfw(e.target.checked)} 
                  className="accent-red-500 rounded" 
                />
                <span className="text-red-400 font-bold">Mark as NSFW (Adult Content)</span>
              </label>


              {/* Select adventure source: Current active adventure vs saved adventure */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-neutral-400">Adventure Source</label>
                  {!isUnlimitedSubscriber && (
                    <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                      <span>Free Tier: Current Game (Max 1)</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdventureSource('current');
                      if (currentAdventure) setCustomTitle(currentAdventure.title);
                    }}
                    disabled={!currentAdventure}
                    className={`p-2 rounded border text-left flex flex-col justify-between transition-colors ${
                      adventureSource === 'current'
                        ? 'bg-blue-950/60 border-blue-500 text-white font-bold'
                        : 'bg-black border-neutral-800 text-neutral-400 hover:border-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    <span className="text-[11px] flex items-center gap-1">
                      <Sparkles size={12} className="text-amber-400" />
                      Current Game
                    </span>
                    <span className="text-[10px] truncate text-neutral-400 font-sans">
                      {currentAdventure ? currentAdventure.title : 'No active game in progress'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!isUnlimitedSubscriber) {
                        setShowUpgradeModal(true);
                        return;
                      }
                      setAdventureSource('saved');
                      const s = savedList.find(x => x.id === selectedSavedId) || savedList[0];
                      if (s) setCustomTitle(s.title);
                    }}
                    disabled={!isUnlimitedSubscriber && savedList.length === 0}
                    className={`p-2 rounded border text-left flex flex-col justify-between transition-colors ${
                      adventureSource === 'saved'
                        ? 'bg-blue-950/60 border-blue-500 text-white font-bold'
                        : 'bg-black border-neutral-800 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <span className="text-[11px] flex items-center justify-between gap-1">
                      <span className="flex items-center gap-1">
                        <BookOpen size={12} className="text-blue-400" />
                        Saved Adventures ({savedList.length})
                      </span>
                      {!isUnlimitedSubscriber && (
                        <Crown size={11} className="text-amber-400" title="Adventurer Perk" />
                      )}
                    </span>
                    <span className="text-[10px] truncate text-neutral-400 font-sans">
                      {!isUnlimitedSubscriber
                        ? 'Requires Adventurer ($9.99/mo)'
                        : savedList.length > 0
                        ? 'Choose from saved list'
                        : 'None saved yet'}
                    </span>
                  </button>
                </div>

                {adventureSource === 'saved' && isUnlimitedSubscriber && savedList.length > 0 && (
                  <div>
                    <label className="block text-neutral-400 mb-1">Choose Saved Adventure</label>
                    <select
                      value={selectedSavedId}
                      onChange={(e) => {
                        setSelectedSavedId(e.target.value);
                        const s = savedList.find(x => x.id === e.target.value);
                        if (s) setCustomTitle(s.title);
                      }}
                      className="w-full px-3 py-2 bg-black border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                    >
                      {savedList.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({new Date(s.savedAt).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Share Format Options */}
              <div>
                <label className="block text-neutral-400 mb-1">Choose What to Share to Community</label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-neutral-800 bg-neutral-950 cursor-pointer hover:border-neutral-700">
                    <input
                      type="radio"
                      name="shareType"
                      checked={shareType === 'full_adventure'}
                      onChange={() => setShareType('full_adventure')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="text-white font-bold block">1. Exact Full Adventure</span>
                      <span className="text-[11px] text-neutral-400 font-sans">
                        Posts your entire adventure log, actions, and story narrative so other players can explore and read your complete playthrough.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-neutral-800 bg-neutral-950 cursor-pointer hover:border-neutral-700">
                    <input
                      type="radio"
                      name="shareType"
                      checked={shareType === 'starting_prompt_only'}
                      onChange={() => setShareType('starting_prompt_only')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="text-white font-bold block">2. Starting Prompt Only</span>
                      <span className="text-[11px] text-neutral-400 font-sans">
                        Shares only your creative concept/prompt so players can launch their own playthrough from your seed.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-neutral-800 bg-neutral-950 cursor-pointer hover:border-neutral-700">
                    <input
                      type="radio"
                      name="shareType"
                      checked={shareType === 'initial_ai_generation'}
                      onChange={() => setShareType('initial_ai_generation')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="text-white font-bold block">3. Initial AI Generation Only</span>
                      <span className="text-[11px] text-neutral-400 font-sans">
                        Posts what the AI has initially exactly fully generated from the starting prompt with zero actions done yet, letting others jump in at the exact starting scene.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={isPosting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Share2 size={13} />
                  <span>{isPosting ? 'Publishing to Community...' : 'Publish to Community'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAKE DOWN CONFIRMATION MODAL */}
      {adventureToTakeDown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-red-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
                <Trash2 size={16} />
                Take Down Community Adventure
              </h3>
              <button onClick={() => setAdventureToTakeDown(null)} className="text-neutral-400 hover:text-white text-base">
                &times;
              </button>
            </div>

            <div className="space-y-3 font-sans text-neutral-300">
              <p>
                Are you sure you want to take down <strong>"{adventureToTakeDown.title}"</strong> from Community Adventures?
              </p>
              <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 text-xs space-y-1.5 font-mono text-red-200">
                <p>• The adventure will be removed from the community feed immediately.</p>
                <p>• Other players will no longer see or launch it.</p>
                {!isUnlimitedSubscriber && (
                  <p className="text-amber-300 font-bold">
                    • This will free up your 1 community post slot so you can post a new adventure!
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={isTakingDown}
                onClick={handleConfirmTakeDown}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                <Trash2 size={14} />
                <span>{isTakingDown ? 'Taking Down...' : 'Confirm Take Down'}</span>
              </button>
              <button
                type="button"
                onClick={() => setAdventureToTakeDown(null)}
                className="py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIMIT REACHED MODAL FOR FREE USERS (1 POST MAX) */}
      {limitReachedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-amber-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <AlertTriangle size={16} />
                Community Post Limit Reached (1/1)
              </h3>
              <button onClick={() => setLimitReachedModalOpen(false)} className="text-neutral-400 hover:text-white text-base">
                &times;
              </button>
            </div>

            <div className="space-y-3 font-sans text-neutral-300">
              <p>
                Free accounts have a limit of <strong>1 active adventure</strong> published in Community Adventures at a time.
              </p>
              {myActivePosts.length > 0 && (
                <div className="bg-black/60 border border-neutral-800 rounded-lg p-3 font-mono text-xs">
                  <span className="text-neutral-400 block text-[10px] uppercase">Currently Published:</span>
                  <span className="text-white font-bold block truncate">{myActivePosts[0].title}</span>
                  <span className="text-[11px] text-neutral-500">
                    Posted on {new Date(myActivePosts[0].createdAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              <p className="text-xs text-neutral-400">
                You can take down your previous post to free up your slot and share your current game, or upgrade to <strong>Adventurer ($9.99/mo)</strong> for unlimited community posts!
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              {myActivePosts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLimitReachedModalOpen(false);
                    setAdventureToTakeDown(myActivePosts[0]);
                  }}
                  className="w-full py-2.5 px-4 bg-red-950/60 hover:bg-red-900/80 border border-red-800 text-red-200 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} />
                  <span>Take Down Previous Post to Free Slot</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setLimitReachedModalOpen(false);
                  onOpenPricing();
                }}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                <Crown size={14} />
                <span>Upgrade to Adventurer for Unlimited Posts ($9.99/mo)</span>
              </button>
              <button
                type="button"
                onClick={() => setLimitReachedModalOpen(false)}
                className="w-full py-2 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPGRADE PROMPT MODAL FOR FREE USERS ACCESSING SAVED ARCHIVES */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-amber-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <Crown size={16} />
                Adventurer Tier Required for Saved Archives
              </h3>
              <button onClick={() => setShowUpgradeModal(false)} className="text-neutral-400 hover:text-white text-base">
                &times;
              </button>
            </div>

            <div className="space-y-3 font-sans text-neutral-300">
              <p>
                Posting adventures from your <strong>Saved Adventures archive</strong> to Community Adventures is an exclusive perk of the <strong>Adventurer ($9.99/mo)</strong> and <strong>Legendary ($19.99/mo)</strong> tiers.
              </p>
              <div className="bg-black/50 border border-neutral-800 rounded-lg p-3 text-xs space-y-1.5 font-mono text-neutral-300">
                <p className="text-amber-300 font-bold">What you get with Adventurer ($9.99/mo):</p>
                <p>• Unlimited Community Adventure posts</p>
                <p>• Post directly from any Saved Adventure archive</p>
                <p>• Permanent access to multiple saved adventure slots</p>
                <p>• 10 Free daily actions + 200 monthly actions</p>
              </div>
              <p className="text-xs text-neutral-400">
                Free players can freely post their <strong>current active adventure</strong> (max 1 active post) at any time without upgrading!
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowUpgradeModal(false);
                  onOpenPricing();
                }}
                className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                <Crown size={14} />
                <span>Unlock Adventurer ($9.99/mo)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
