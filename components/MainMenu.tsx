import React, { useState, useEffect } from 'react';
import { authService, AuthSession } from '../services/authService';
import { User, LogIn, Key, Sparkles } from 'lucide-react';

interface MainMenuProps {
  onHostGame: (username: string) => void;
  onJoinGame: (roomId: string, username: string) => void;
  onCancel: () => void;
  initialMode: 'host' | 'join';
  onOpenAuth?: (tab?: 'login' | 'signup' | 'guest') => void;
}

export default function MainMenu({ onHostGame, onJoinGame, onCancel, initialMode, onOpenAuth }: MainMenuProps) {
  const [mode, setMode] = useState<'host' | 'join'>(initialMode);
  const [session, setSession] = useState<AuthSession>(authService.getSession());
  const [roomId, setRoomId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKeyField, setShowKeyField] = useState(false);

  useEffect(() => {
    const unsub = authService.subscribe(() => {
      setSession(authService.getSession());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const savedApiKey = localStorage.getItem('aimud_apikey');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  const effectiveMultiplayerUsername = authService.getMultiplayerName();

  const handleHost = () => {
    onHostGame(effectiveMultiplayerUsername);
  };

  const handleJoin = () => {
    if (!roomId.trim()) return;
    onJoinGame(roomId.trim().toUpperCase(), effectiveMultiplayerUsername);
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('aimud_apikey', apiKey);
    window.location.reload();
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-700 p-6 sm:p-8 rounded-xl shadow-2xl w-[440px] max-w-full font-mono">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
            <h1 className="text-xl font-bold text-white tracking-widest font-mono">
              Aifinity <span className="text-xs text-blue-400 font-normal">MULTIPLAYER</span>
            </h1>
          </div>
          <button onClick={onCancel} className="text-neutral-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Player Identity Card */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3.5 mb-5 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-neutral-400 text-[11px] uppercase tracking-wider">Multiplayer Identity</span>
            {session.type === 'registered' ? (
              <span className="text-[10px] bg-emerald-950 border border-emerald-800 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                ACCOUNT
              </span>
            ) : (
              <span className="text-[10px] bg-amber-950 border border-amber-800 text-amber-400 px-1.5 py-0.5 rounded font-mono">
                GUEST
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User size={15} className={session.type === 'registered' ? 'text-blue-400' : 'text-amber-400'} />
              <span className="text-white font-bold text-sm tracking-wide">
                {effectiveMultiplayerUsername}
              </span>
            </div>
            {onOpenAuth && (
              <button
                type="button"
                onClick={() => onOpenAuth(session.type === 'registered' ? 'login' : 'guest')}
                className="text-[11px] text-blue-400 hover:text-blue-300 underline font-sans"
              >
                {session.type === 'registered' ? 'Switch Account' : 'Change / Log In'}
              </button>
            )}
          </div>
          {session.type !== 'registered' && !session.guestName && (
            <p className="text-[10px] text-neutral-500 mt-1">
              Playing as auto-assigned unique guest tag. You can set a custom guest name or log in anytime.
            </p>
          )}
        </div>

        {/* Host Mode */}
        {mode === 'host' && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-base font-bold text-blue-300">Host New Session</h2>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Generates a 5-letter room code for others to join.
              </p>
            </div>

            <div className="flex gap-2 mt-1">
              <button
                onClick={handleHost}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Create Room & Host
              </button>
              <button
                onClick={() => setMode('join')}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2.5 rounded text-xs transition-colors"
              >
                Switch to Join
              </button>
            </div>
          </div>
        )}

        {/* Join Mode */}
        {mode === 'join' && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-base font-bold text-emerald-300">Join Existing Session</h2>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Enter the 5-letter room code shared by the host.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-neutral-400 block mb-1">Room Code</label>
              <input
                type="text"
                placeholder="e.g. ABCDE"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                className="w-full bg-neutral-950 border border-neutral-700 p-2.5 text-white font-mono uppercase text-center text-lg tracking-widest rounded focus:outline-none focus:border-emerald-500"
                maxLength={5}
              />
            </div>

            <div className="flex gap-2 mt-1">
              <button
                onClick={handleJoin}
                disabled={roomId.trim().length < 4}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white p-2.5 rounded text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Join Adventure
              </button>
              <button
                onClick={() => setMode('host')}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2.5 rounded text-xs transition-colors"
              >
                Switch to Host
              </button>
            </div>
          </div>
        )}

        {/* API Key Toggle Section */}
        <div className="mt-5 pt-3 border-t border-neutral-800/80">
          <button
            type="button"
            onClick={() => setShowKeyField(!showKeyField)}
            className="text-[10px] text-neutral-500 hover:text-neutral-300 flex items-center gap-1.5 transition-colors"
          >
            <Key size={11} />
            <span>{showKeyField ? 'Hide API Key Settings' : 'Advanced: Custom Gemini API Key'}</span>
          </button>

          {showKeyField && (
            <div className="flex flex-col gap-2 mt-2 bg-black/50 p-3 border border-neutral-800 rounded text-xs">
              <label className="text-gray-400 text-[11px]">
                Gemini API Key {process.env.API_KEY ? '(Environment Key Detected)' : '(Localhost Override)'}
              </label>
              <input
                type="password"
                placeholder={process.env.API_KEY ? "Using Server Environment Key..." : "AIzaSy..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-black border border-neutral-700 p-1.5 text-white text-xs font-mono rounded"
              />
              <button
                onClick={handleSaveApiKey}
                className="bg-neutral-800 hover:bg-neutral-700 text-[10px] text-gray-300 py-1.5 px-2 rounded font-mono transition-colors"
              >
                Save & Reload Engine
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
