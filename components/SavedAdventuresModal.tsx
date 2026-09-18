import React, { useState, useEffect } from 'react';
import {
  Bookmark,
  Plus,
  Play,
  Trash2,
  Lock,
  Crown,
  Share2,
  Calendar,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import {
  actionQuotaService,
  SavedAdventure
} from '../services/actionQuotaService';

interface SavedAdventuresModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadAdventure: (adv: SavedAdventure) => void;
  onSaveCurrent: () => void;
  onOpenPricing: () => void;
  onOpenCommunity: () => void;
  hasCurrentActiveAdventure: boolean;
}

export default function SavedAdventuresModal({
  isOpen,
  onClose,
  onLoadAdventure,
  onSaveCurrent,
  onOpenPricing,
  onOpenCommunity,
  hasCurrentActiveAdventure
}: SavedAdventuresModalProps) {
  const [adventures, setAdventures] = useState<SavedAdventure[]>([]);
  const [quotaState, setQuotaState] = useState(actionQuotaService.getQuotaState());
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAdventures(actionQuotaService.getSavedAdventures());
      setQuotaState(actionQuotaService.getQuotaState());
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canSaveMultiple = actionQuotaService.canSaveMultipleAdventures();

  const handleDelete = (id: string) => {
    actionQuotaService.deleteSavedAdventure(id);
    setAdventures(actionQuotaService.getSavedAdventures());
  };

  const handleSaveClick = () => {
    setErrorMsg('');
    if (adventures.length >= 1 && !canSaveMultiple) {
      setErrorMsg('Saving multiple adventures is locked for free users! Upgrade to the Adventurer Pass ($9.99/mo) to unlock permanent multi-adventure saves.');
      return;
    }
    onSaveCurrent();
    setAdventures(actionQuotaService.getSavedAdventures());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl font-mono text-xs">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Bookmark size={16} />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Your Saved Adventures</h3>
              <p className="text-[11px] text-neutral-400 font-sans">
                {canSaveMultiple
                  ? 'Unlimited adventure slots (Subscriber Perk Active)'
                  : 'Free tier: 1 adventure slot • Multiple slots require Adventurer ($9.99/mo)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-lg">
            &times;
          </button>
        </div>

        {/* Notice for Free Users */}
        {!canSaveMultiple && (
          <div className="bg-amber-950/40 border-b border-amber-900/60 p-3 px-5 flex items-center justify-between gap-3 text-[11px] text-amber-300">
            <div className="flex items-center gap-2">
              <Lock size={14} className="shrink-0 text-amber-400" />
              <span>Saving multiple adventures is locked for free users.</span>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenPricing();
              }}
              className="text-white bg-amber-600 hover:bg-amber-500 px-2.5 py-1 rounded font-bold shrink-0 transition-colors shadow"
            >
              Unlock ($9.99/mo)
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="m-4 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-400" />
            <div className="space-y-1">
              <p>{errorMsg}</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenPricing();
                }}
                className="underline text-blue-300 hover:text-white font-bold block"
              >
                View Adventurer Pass & Pricing Plans →
              </button>
            </div>
          </div>
        )}

        {/* Content list */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3">
          {adventures.length === 0 ? (
            <div className="py-8 text-center text-neutral-500 space-y-2">
              <Bookmark size={32} className="mx-auto opacity-30" />
              <p>No saved adventures yet.</p>
              {hasCurrentActiveAdventure && (
                <p className="text-neutral-400 text-[11px]">
                  Click "Save Current Adventure" below to snapshot your active game.
                </p>
              )}
            </div>
          ) : (
            adventures.map((adv) => (
              <div
                key={adv.id}
                className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl flex flex-col justify-between gap-2.5 hover:border-neutral-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-white font-bold text-sm truncate">{adv.title}</h4>
                    <span className="text-[10px] text-neutral-500 shrink-0 flex items-center gap-1">
                      <Calendar size={10} />
                      {new Date(adv.savedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 line-clamp-2 font-sans">
                    {adv.scenarioPrompt}
                  </p>
                </div>

                <div className="pt-2 border-t border-neutral-900 flex items-center justify-between">
                  <button
                    onClick={() => handleDelete(adv.id)}
                    className="text-neutral-500 hover:text-red-400 flex items-center gap-1 text-[11px]"
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onLoadAdventure(adv);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 shadow"
                    >
                      <Play size={11} />
                      <span>Load</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-neutral-950 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2">
          {hasCurrentActiveAdventure && (
            <button
              onClick={handleSaveClick}
              className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded font-bold flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Save Current Adventure</span>
            </button>
          )}

          <button
            onClick={() => {
              onClose();
              onOpenCommunity();
            }}
            className="px-3.5 py-2 text-blue-400 hover:text-blue-300 flex items-center gap-1 ml-auto"
          >
            <Share2 size={13} />
            <span>Community Adventures Hub →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
