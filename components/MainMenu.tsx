import React, { useState, useEffect } from 'react';
import { Key, Lock, ExternalLink, HelpCircle } from 'lucide-react';
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
  defaultUsername?: string;
  currentUser?: UserProfile | null;
  guestName?: string | null;
  guestId?: string;
  onOpenMarket?: (tab?: 'packs' | 'subscriptions' | 'apikey') => void;
}

export default function MainMenu({
  onHostGame,
  onJoinGame,
  onCancel,
  initialMode,
  defaultUsername,
  currentUser,
  guestName,
  guestId,
  onOpenMarket
}: MainMenuProps) {
  const [mode, setMode] = useState<'host' | 'join'>(initialMode);
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isLoggedIn = !!currentUser;

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
    let finalName = '';

    if (isLoggedIn && currentUser) {
      // User is logged in: their name is their username automatically
      finalName = currentUser.username;
    } else {
      // Guest: can set their unique active guest name
      finalName = username.trim();
      if (!finalName) {
        setErrorMsg('Please enter a unique guest name.');
        return;
      }

      const validation = validateUsernameFormat(finalName);
      if (!validation.valid) {
        setErrorMsg(validation.error || 'Invalid guest name format (2-20 alphanumeric characters or underscores).');
        return;
      }

      const available = await isGuestNameAvailable(finalName, guestId || '');
      if (!available) {
        setErrorMsg(`The guest name "${finalName}" is already taken by another active guest or user. Please choose a unique guest name.`);
        return;
      }

      if (guestId) {
        await reserveGuestName(finalName, guestId);
      }
      localStorage.setItem('aifinity_guest_name', finalName);
    }

    localStorage.setItem('aimud_username', finalName);
    onHostGame(finalName);
  };

  const handleJoin = async () => {
    setErrorMsg(null);
    let finalName = '';

    if (isLoggedIn && currentUser) {
      // User is logged in: their name is their username automatically
      finalName = currentUser.username;
    } else {
      // Guest: can set their unique active guest name
      finalName = username.trim();
      if (!finalName) {
        setErrorMsg('Please enter a unique guest name.');
        return;
      }

      const validation = validateUsernameFormat(finalName);
      if (!validation.valid) {
        setErrorMsg(validation.error || 'Invalid guest name format (2-20 alphanumeric characters or underscores).');
        return;
      }

      const available = await isGuestNameAvailable(finalName, guestId || '');
      if (!available) {
        setErrorMsg(`The guest name "${finalName}" is already taken by another active guest or user. Please choose a unique guest name.`);
        return;
      }

      if (guestId) {
        await reserveGuestName(finalName, guestId);
      }
      localStorage.setItem('aifinity_guest_name', finalName);
    }

    if (!roomId.trim()) {
      setErrorMsg('Please enter a room code.');
      return;
    }

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

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/85 backdrop-blur-sm z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-700 p-6 md:p-8 rounded-xl shadow-2xl w-[440px] max-w-full font-sans text-neutral-200">
        
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
