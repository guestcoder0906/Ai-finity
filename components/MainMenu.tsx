import React, { useState, useEffect } from 'react';
import { Key, Lock, ExternalLink, HelpCircle, Users, UserPlus, LogIn, AlertCircle } from 'lucide-react';
import {
  UserProfile,
  isGuestNameActive,
  isGuestNameAvailable,
  reserveGuestName,
  validateUsernameFormat
} from '../services/authService';

interface MainMenuProps {
  onHostGame: (username: string) => void;
  onJoinGame: (roomId: string, username: string) => void;
  onCancel: () => void;
  initialMode: 'host' | 'join';
  initialRoomId?: string;
  defaultUsername?: string;
  currentUser?: UserProfile | null;
  guestName?: string | null;
  guestId?: string;
  onOpenMarket?: (tab?: 'packs' | 'subscriptions' | 'apikey') => void;
  onOpenAuth?: (tab?: 'login' | 'signup') => void;
}

export default function MainMenu({
  onHostGame,
  onJoinGame,
  onCancel,
  initialMode,
  initialRoomId,
  defaultUsername,
  currentUser,
  guestName,
  guestId,
  onOpenMarket,
  onOpenAuth
}: MainMenuProps) {
  const [mode, setMode] = useState<'host' | 'join'>(initialMode);
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState(initialRoomId || '');
  const [apiKey, setApiKey] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isLoggedIn = !!currentUser;

  useEffect(() => {
    if (initialRoomId) {
      setRoomId(initialRoomId);
    }
  }, [initialRoomId]);

  useEffect(() => {
    const savedApiKey = localStorage.getItem('aimud_apikey');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }

    if (isLoggedIn && currentUser) {
      // Logged-in users cannot manually edit name; it's strictly their username
      setUsername(currentUser.username);
    } else if (guestName) {
      setUsername(guestName);
    } else if (defaultUsername) {
      setUsername(defaultUsername);
    } else {
      const savedUsername = localStorage.getItem('aifinity_guest_name') || localStorage.getItem('aimud_username');
      if (savedUsername) {
        setUsername(savedUsername);
      } else {
        setUsername('Player' + Math.floor(Math.random() * 9000 + 1000));
      }
    }
  }, [defaultUsername, currentUser, guestName, isLoggedIn]);

  const handleHost = async () => {
    setErrorMsg(null);
    if (!isLoggedIn || !currentUser) {
      if (onOpenAuth) {
        onOpenAuth('signup');
      }
      return;
    }
    const finalName = currentUser.username;
    localStorage.setItem('aimud_username', finalName);
    onHostGame(finalName);
  };

  const handleJoin = async () => {
    setErrorMsg(null);
    if (!isLoggedIn || !currentUser) {
      if (onOpenAuth) {
        onOpenAuth('login');
      }
      return;
    }

    if (!roomId.trim()) {
      setErrorMsg('Please enter a room code.');
      return;
    }

    const finalName = currentUser.username;
    localStorage.setItem('aimud_username', finalName);
    onJoinGame(roomId.trim().toUpperCase(), finalName);
  };

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('aimud_apikey', apiKey.trim());
      window.location.reload();
    } else {
      localStorage.removeItem('aimud_apikey');
      window.location.reload();
    }
  };

  // If user is a guest: Multiplayer strictly requires an account. Display Login / Sign Up Gate.
  if (!isLoggedIn || !currentUser) {
    return (
      <div
        id="multiplayer-menu-modal"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto font-sans"
      >
        <div className="bg-neutral-900 border border-neutral-700 p-6 md:p-8 rounded-xl shadow-2xl w-[440px] max-w-full my-auto font-sans text-neutral-200 relative animate-in fade-in zoom-in-95 duration-150 text-center">
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 text-neutral-500 hover:text-white text-xl p-1 leading-none rounded cursor-pointer"
            title="Close"
          >
            &times;
          </button>

          <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center mx-auto mb-3.5 shadow-lg shadow-blue-500/20">
            <Users size={24} />
          </div>

          <h2 className="text-lg sm:text-xl font-black text-white font-mono tracking-wide mb-2">
            Multiplayer Requires An Account
          </h2>

          <p className="text-xs text-neutral-300 leading-relaxed mb-6">
            Guests cannot host or join multiplayer games. Create a free account or log in with your credentials to explore adventures together with other players!
          </p>

          <div className="space-y-2.5">
            <button
              onClick={() => {
                onCancel();
                if (onOpenAuth) onOpenAuth('signup');
              }}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 transition-all cursor-pointer"
            >
              <UserPlus size={16} />
              <span>Create Free Account (30 Free Actions Daily)</span>
            </button>

            <button
              onClick={() => {
                onCancel();
                if (onOpenAuth) onOpenAuth('login');
              }}
              className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer border border-neutral-700"
            >
              <LogIn size={15} />
              <span>Already have an account? Log In</span>
            </button>

            <button
              onClick={onCancel}
              className="w-full py-1 text-neutral-400 hover:text-white text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="multiplayer-menu-modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto font-sans"
    >
      <div className="bg-neutral-900 border border-neutral-700 p-6 md:p-8 rounded-xl shadow-2xl w-[440px] max-w-full my-auto font-sans text-neutral-200 relative animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-neutral-800">
          <div>
            <h1 className="text-xl font-black text-blue-400 font-mono tracking-wider">Aifinity Multiplayer</h1>
            <p className="text-xs text-neutral-400">Cooperative AI Dungeon Crawl</p>
          </div>
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-white text-xl p-1 leading-none rounded"
          >
            &times;
          </button>
        </div>

        {/* API Key Box with Direct Link */}
        <div className="flex flex-col gap-2 mb-6 bg-neutral-950 p-3.5 border border-neutral-800 rounded-lg">
          <div className="flex items-center justify-between">
            <label className="text-xs text-neutral-300 font-semibold flex items-center gap-1.5">
              <Key size={13} className="text-blue-400" />
              <span>Gemini API Key (Optional)</span>
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 underline font-mono"
            >
              Get Free Key <ExternalLink size={10} />
            </a>
          </div>

          <p className="text-[11px] text-neutral-400">
            Playing with your personal key bypasses daily free action limits completely.
          </p>

          <div className="flex gap-2">
            <input
              type="password"
              placeholder="AIzaSy... (leave blank for platform default)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 bg-black border border-neutral-700 p-2 text-xs text-white font-mono rounded"
            />
            <button
              onClick={handleSaveApiKey}
              className="bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 px-3 py-1.5 rounded font-mono transition-colors shrink-0"
            >
              Save
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-950/70 border border-red-800 text-red-300 text-xs p-2.5 rounded-lg mb-4">
            {errorMsg}
          </div>
        )}

        {/* HOST MODE */}
        {mode === 'host' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-bold text-center text-blue-300">Host Multiplayer Realm</h2>

            <div>
              <label className="text-xs text-neutral-400 block mb-1">
                Player Display Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  disabled={isLoggedIn}
                  readOnly={isLoggedIn}
                  placeholder="Enter unique guest name..."
                  value={isLoggedIn && currentUser ? currentUser.username : username}
                  onChange={(e) => !isLoggedIn && setUsername(e.target.value)}
                  className={`w-full bg-black border rounded-lg p-2.5 text-xs text-white font-mono ${
                    isLoggedIn ? 'border-neutral-800 text-neutral-400 bg-neutral-950 cursor-not-allowed pr-8 select-none' : 'border-neutral-700 focus:border-blue-500'
                  }`}
                />
                {isLoggedIn && (
                  <div className="absolute right-2.5 top-2.5 text-neutral-500" title="Account usernames are automatically locked">
                    <Lock size={14} />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                {isLoggedIn
                  ? '🔒 Locked: In multiplayer, your account username is used automatically.'
                  : 'Guests can choose a unique active guest name.'}
              </p>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleHost}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-lg font-bold text-xs transition-colors shadow"
              >
                Create Room & Host
              </button>
              <button
                onClick={() => setMode('join')}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 p-2.5 rounded-lg text-xs font-semibold transition-colors"
              >
                Switch to Join
              </button>
            </div>
          </div>
        )}

        {/* JOIN MODE */}
        {mode === 'join' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-bold text-center text-emerald-300">Join Multiplayer Realm</h2>

            <div>
              <label className="text-xs text-neutral-400 block mb-1">
                Player Display Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  disabled={isLoggedIn}
                  readOnly={isLoggedIn}
                  placeholder="Enter unique guest name..."
                  value={isLoggedIn && currentUser ? currentUser.username : username}
                  onChange={(e) => !isLoggedIn && setUsername(e.target.value)}
                  className={`w-full bg-black border rounded-lg p-2.5 text-xs text-white font-mono ${
                    isLoggedIn ? 'border-neutral-800 text-neutral-400 bg-neutral-950 cursor-not-allowed pr-8 select-none' : 'border-neutral-700 focus:border-emerald-500'
                  }`}
                />
                {isLoggedIn && (
                  <div className="absolute right-2.5 top-2.5 text-neutral-500" title="Account usernames are automatically locked">
                    <Lock size={14} />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                {isLoggedIn
                  ? '🔒 Locked: In multiplayer, your account username is used automatically.'
                  : 'Guests can choose a unique active guest name.'}
              </p>
            </div>

            <div>
              <label className="text-xs text-neutral-400 block mb-1">
                5-Character Room Code
              </label>
              <input
                type="text"
                placeholder="e.g. AB12C"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-xs text-white font-mono uppercase tracking-widest text-center"
                maxLength={5}
              />
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleJoin}
                disabled={!roomId.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-2.5 rounded-lg font-bold text-xs transition-colors shadow"
              >
                Join Realm
              </button>
              <button
                onClick={() => setMode('host')}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 p-2.5 rounded-lg text-xs font-semibold transition-colors"
              >
                Switch to Host
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
