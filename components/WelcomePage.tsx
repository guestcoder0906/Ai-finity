import React, { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Play, Compass, Shield, BookOpen, Clock, Users, Pause, RotateCcw, User, LogIn } from 'lucide-react';
import { authService, AuthSession } from '../services/authService';

interface WelcomePageProps {
  onEnterGame: (scenarioPrompt?: string) => void;
  onOpenAuth?: (tab?: 'login' | 'signup' | 'guest') => void;
}

const PRESET_SCENARIOS = [
  {
    id: 'cyberpunk',
    title: 'Cyberpunk Neo-Tokyo',
    era: 'Year 2076',
    prompt: 'A street-level mercenary in the rain-slicked neon alleys of Neo-Tokyo, investigating a stolen corporate prototype cyberdeck.',
    tag: 'Sci-Fi / Noir'
  },
  {
    id: 'fantasy',
    title: 'Sunken Citadel of Eldoria',
    era: 'Year 1024',
    prompt: 'An arcane scholar traversing the overgrown subterranean chambers of the Sunken Citadel, hunting for forgotten primordial runes.',
    tag: 'Dark Fantasy'
  },
  {
    id: 'derelict',
    title: 'Derelict Ship 7',
    era: 'Deep Orbit 2341',
    prompt: 'A lone salvage engineer boarding a silent, adrift deep-space hauler whose automated distress beacon suddenly initiated quarantine.',
    tag: 'Survival Horror'
  },
  {
    id: 'apocalypse',
    title: 'Dust & Radiation',
    era: 'Post-Collapse 2108',
    prompt: 'A hardened scavenger navigating the toxic ruins of an old-world metro line with a faulty geiger counter and a dwindling canteen of water.',
    tag: 'Post-Apocalyptic'
  }
];

export default function WelcomePage({ onEnterGame, onOpenAuth }: WelcomePageProps) {
  const [countdown, setCountdown] = useState(15);
  const [isPaused, setIsPaused] = useState(false);
  const [session, setSession] = useState<AuthSession>(authService.getSession());

  useEffect(() => {
    const unsub = authService.subscribe(() => {
      setSession(authService.getSession());
    });
    return unsub;
  }, []);

  // Automatic countdown timer to redirect to game
  useEffect(() => {
    if (isPaused) return;

    if (countdown <= 0) {
      onEnterGame();
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, isPaused, onEnterGame]);

  const currentDisplayName = authService.getSingleplayerName();

  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-black text-gray-200 font-sans flex flex-col selection:bg-blue-600 selection:text-white z-40">
      {/* Subtle Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-blue-900/15 via-indigo-950/10 to-transparent pointer-events-none blur-3xl"></div>
      <div className="absolute -top-24 right-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-48 left-10 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top Banner / Navigation */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-neutral-950/85 border-b border-neutral-800/80 px-4 py-3 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center font-black text-black shadow-lg shadow-blue-500/20">
              ∞
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-300 bg-clip-text text-transparent">
                Aifinity
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded border border-neutral-800 text-neutral-400 font-mono">
                SANDBOX
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Account Status Badge */}
            {onOpenAuth && (
              <button
                onClick={() => onOpenAuth(session.type === 'registered' ? 'login' : 'login')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-800 hover:border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 text-xs font-mono transition-colors"
                title="Account and Identity Settings"
              >
                <User size={13} className={session.type === 'registered' ? 'text-emerald-400' : 'text-amber-400'} />
                <span className="text-neutral-300 max-w-[120px] truncate">{currentDisplayName}</span>
                {session.type !== 'registered' && (
                  <span className="text-[10px] text-blue-400 bg-blue-950/60 px-1 py-0.5 rounded ml-1">
                    Log In
                  </span>
                )}
              </button>
            )}

            <div className="hidden md:flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full text-xs font-mono">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
              </span>
              {isPaused ? (
                <span className="text-neutral-400">Auto-redirect paused</span>
              ) : (
                <span className="text-neutral-300">
                  Entering game in <span className="text-blue-400 font-bold">{countdown}s</span>
                </span>
              )}
              <button 
                onClick={() => setIsPaused(!isPaused)} 
                className="text-neutral-400 hover:text-white transition-colors ml-1 p-0.5"
                title={isPaused ? "Resume auto-redirect" : "Pause auto-redirect"}
              >
                {isPaused ? <RotateCcw size={13} /> : <Pause size={13} />}
              </button>
            </div>

            <button
              onClick={() => onEnterGame()}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-md shadow-md shadow-blue-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Play Now</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 flex flex-col gap-12 z-10">
        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-400 text-xs font-medium font-mono">
            <Sparkles size={13} className="text-blue-400" />
            <span>INFINITE AI RPG SANDBOX ENGINE</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Welcome to <span className="bg-gradient-to-r from-blue-400 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">Aifinity</span>
          </h1>

          <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-5 sm:p-7 shadow-xl space-y-4">
            <blockquote className="text-base sm:text-xl font-medium text-neutral-100 italic leading-relaxed">
              “Aifinity is an infinite AI RPG sandbox game that keeps track and sets up everything under seconds! Easy to play, in the most accurate way!”
            </blockquote>
            <div className="h-px bg-neutral-800 w-24 mx-auto"></div>
            <p className="text-sm sm:text-base text-blue-300/90 font-medium">
              “Setting up and doing actions is as easy as sending a text.”
            </p>
          </div>

          {/* Quick CTA Actions */}
          <div className="flex flex-wrap justify-center items-center gap-4 pt-2">
            <button
              onClick={() => onEnterGame()}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-blue-500/25 transition-all text-sm transform hover:scale-[1.02]"
            >
              <Play size={16} fill="currentColor" />
              <span>Launch Sandbox Game</span>
            </button>
            <button
              onClick={() => {
                setIsPaused(true);
                const el = document.getElementById('scenarios');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium px-5 py-3 rounded-lg border border-neutral-700 transition-colors text-sm"
            >
              <BookOpen size={16} />
              <span>Choose a Scenario</span>
            </button>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition-colors space-y-3">
            <div className="w-10 h-10 rounded-lg bg-blue-950 border border-blue-800/60 flex items-center justify-center text-blue-400">
              <Sparkles size={20} />
            </div>
            <h3 className="font-bold text-white text-base">Perception-Based Expansion</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Locations, NPCs, and items are generated dynamically as real text files only as your character explores, expanding infinitely without artificial boundaries.
            </p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition-colors space-y-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
              <Clock size={20} />
            </div>
            <h3 className="font-bold text-white text-base">Mathematical Physics & Time</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Every action calculates real-world time elapsed, biological stamina, and probability checks. Supports seamless temporal displacement and time-travel epochs.
            </p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition-colors space-y-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Users size={20} />
            </div>
            <h3 className="font-bold text-white text-base">Instant Multiplayer Synchronization</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Jump in solo as a Guest or registered account, or share a 5-letter room code to embark with companions in a fully synchronized cooperative world.
            </p>
          </div>
        </section>

        {/* Pre-configured Starter Scenarios */}
        <section id="scenarios" className="space-y-6 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
            <div>
              <h2 className="text-xl font-bold text-white">Instant-Launch Scenarios</h2>
              <p className="text-xs text-neutral-400">Select any world to initialize the adventure with one click:</p>
            </div>
            <span className="text-xs font-mono text-blue-400">Click any card to start</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRESET_SCENARIOS.map((scenario) => (
              <div
                key={scenario.id}
                onClick={() => onEnterGame(scenario.prompt)}
                className="group relative bg-neutral-900/50 hover:bg-neutral-800/80 border border-neutral-800 hover:border-blue-500/60 rounded-xl p-5 cursor-pointer transition-all duration-200 flex flex-col justify-between gap-4 hover:shadow-lg hover:shadow-blue-950/30"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-blue-400 font-semibold">{scenario.era}</span>
                    <span className="bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded border border-neutral-700 text-[10px]">
                      {scenario.tag}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-blue-300 transition-colors">
                    {scenario.title}
                  </h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    {scenario.prompt}
                  </p>
                </div>
                <div className="flex items-center text-xs font-mono text-blue-400 group-hover:text-blue-300 gap-1 mt-1">
                  <span>Initialize this World</span>
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Game Modes & How To Play */}
        <section className="bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 font-mono flex items-center gap-2">
            <Clock size={15} />
            <span>How Aifinity Operates</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-neutral-300">
            <div className="space-y-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                Singleplayer Mode
              </span>
              <p className="text-neutral-400 leading-relaxed pl-3">
                Experience infinite branching storylines tailored specifically to your character's choices, inventory, and skills with automatic intelligent suggestions.
              </p>
            </div>
            <div className="space-y-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Multiplayer Mode
              </span>
              <p className="text-neutral-400 leading-relaxed pl-3">
                Host a room code to embark with friends! Each player creates their custom character file, submits actions, and co-exists in a shared synchronized world state.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom Redirect Action */}
        <div className="text-center py-4 space-y-3">
          <button
            onClick={() => onEnterGame()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-lg shadow-xl shadow-blue-600/30 transition-all transform hover:scale-[1.02] text-sm"
          >
            <span>Proceed to Aifinity Game Sandbox</span>
            <ArrowRight size={16} />
          </button>
          <div>
            <span className="text-xs text-neutral-500 font-mono">
              Ready to explore? You can return to this page anytime via the Welcome button in the game.
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-6 px-4 text-center text-xs text-neutral-500 font-mono">
        <span>Aifinity © 2026 • Infinite AI RPG Sandbox Engine</span>
      </footer>
    </div>
  );
}
