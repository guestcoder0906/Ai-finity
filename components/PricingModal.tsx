import React, { useState, useEffect, useRef } from 'react';
import {
  ACTION_PACKS,
  MONTHLY_SUBSCRIPTIONS,
  PricingTier,
  ActionQuotaState,
  actionQuotaService
} from '../services/actionQuotaService';
import { authService } from '../services/authService';
import { paymentService, PaymentTransaction } from '../services/paymentService';
import {
  Zap,
  Key,
  Crown,
  Check,
  AlertCircle,
  X,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  Receipt,
  UserCheck,
  ArrowDown,
  RefreshCw
} from 'lucide-react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'pricing' | 'apiKey' | 'subscriptions';
  highlightActionExhausted?: boolean;
  onOpenAuth?: (tab?: 'login' | 'signup' | 'guest') => void;
}

export default function PricingModal({
  isOpen,
  onClose,
  initialTab = 'pricing',
  highlightActionExhausted = false,
  onOpenAuth
}: PricingModalProps) {
  const [tab, setTab] = useState<'pricing' | 'subscriptions' | 'apiKey' | 'history'>(initialTab);
  const [quotaState, setQuotaState] = useState<ActionQuotaState>(actionQuotaService.getQuotaState());
  const [customKeyInput, setCustomKeyInput] = useState(localStorage.getItem('aimud_apikey') || '');
  const [apiKeySuccess, setApiKeySuccess] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');

  // Checkout State
  const [purchasingTier, setPurchasingTier] = useState<PricingTier | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'google_pay' | 'card'>('google_pay');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutReceipt, setCheckoutReceipt] = useState<PaymentTransaction | null>(null);

  // Card details
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardZip, setCardZip] = useState('');
  const [cardName, setCardName] = useState('');

  // Guest restriction prompt modal
  const [showGuestRestriction, setShowGuestRestriction] = useState(false);

  // Refs for scrolling and section tracking
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const packsSectionRef = useRef<HTMLDivElement>(null);
  const subsSectionRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);

  useEffect(() => {
    const unsub = actionQuotaService.subscribe(() => {
      setQuotaState(actionQuotaService.getQuotaState());
    });
    return unsub;
  }, []);

  useEffect(() => {
    setTab(initialTab);
    setQuotaState(actionQuotaService.getQuotaState());
    setCustomKeyInput(localStorage.getItem('aimud_apikey') || '');
  }, [isOpen, initialTab]);

  // When initialTab is subscriptions and modal opens, scroll to subscriptions
  useEffect(() => {
    if (isOpen && initialTab === 'subscriptions' && subsSectionRef.current) {
      setTimeout(() => {
        subsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  }, [isOpen, initialTab]);

  // Handle scroll detection to update active tab between 'pricing' (packs) and 'subscriptions'
  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return;
    if (tab === 'apiKey' || tab === 'history') return;

    if (!scrollContainerRef.current || !subsSectionRef.current) return;

    const containerTop = scrollContainerRef.current.getBoundingClientRect().top;
    const subsTop = subsSectionRef.current.getBoundingClientRect().top;

    // If subscriptions section is within top 160px of the container viewport, switch to subscriptions tab
    if (subsTop - containerTop <= 160) {
      if (tab !== 'subscriptions') {
        setTab('subscriptions');
      }
    } else {
      if (tab !== 'pricing') {
        setTab('pricing');
      }
    }
  };

  const handleSelectTab = (selected: 'pricing' | 'subscriptions' | 'apiKey' | 'history') => {
    setTab(selected);

    if (selected === 'pricing') {
      isProgrammaticScrollRef.current = true;
      packsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 500);
    } else if (selected === 'subscriptions') {
      isProgrammaticScrollRef.current = true;
      subsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 500);
    }
  };

  if (!isOpen) return null;

  const isGuest = !authService.isLoggedIn();
  const remainingGuest = Math.max(0, 3 - quotaState.guestActionsUsed);
  const remainingDaily = Math.max(0, quotaState.dailyAllowance - quotaState.dailyUsed);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setApiKeyError('');
    setApiKeySuccess('');

    const trimmed = customKeyInput.trim();
    if (!trimmed) {
      localStorage.removeItem('aimud_apikey');
      setApiKeySuccess('Custom API key removed. Returning to standard quota.');
      setQuotaState(actionQuotaService.getQuotaState());
      return;
    }

    if (!trimmed.startsWith('AIza') && trimmed.length < 20) {
      setApiKeyError('That looks like an invalid Gemini API Key. Google AI Studio keys typically start with "AIzaSy...".');
      return;
    }

    localStorage.setItem('aimud_apikey', trimmed);
    setApiKeySuccess('API Key successfully saved! You now have unlimited actions powered directly by your personal key.');
    setQuotaState(actionQuotaService.getQuotaState());
  };

  const handleStartCheckout = (tier: PricingTier) => {
    // Guest purchase restriction check
    if (isGuest) {
      setShowGuestRestriction(true);
      return;
    }

    setPurchasingTier(tier);
    setCheckoutReceipt(null);
    setCheckoutError('');
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setCardZip('');
    setCardName(authService.getCurrentAccount()?.username || '');
  };

  const handleProcessPayment = async () => {
    if (!purchasingTier) return;
    setIsProcessingPayment(true);
    setCheckoutError('');

    try {
      if (paymentMethod === 'google_pay') {
        const result = await paymentService.processGooglePay(purchasingTier);
        if (!result.success || !result.transaction) {
          setCheckoutError(result.error || 'Google Pay transaction was not completed.');
          setIsProcessingPayment(false);
          return;
        }

        setCheckoutReceipt(result.transaction);
        setQuotaState(actionQuotaService.getQuotaState());
        setIsProcessingPayment(false);
      } else {
        // Card Payment
        const result = await paymentService.processCard(purchasingTier, {
          cardNumber,
          expiry: cardExpiry,
          cvc: cardCvc,
          zip: cardZip,
          name: cardName
        });

        if (!result.success || !result.transaction) {
          setCheckoutError(result.error || 'Payment card declined. Please check details.');
          setIsProcessingPayment(false);
          return;
        }

        setCheckoutReceipt(result.transaction);
        setQuotaState(actionQuotaService.getQuotaState());
        setIsProcessingPayment(false);
      }
    } catch (e: any) {
      setCheckoutError(e?.message || 'Payment processing encountered an unexpected error.');
      setIsProcessingPayment(false);
    }
  };

  const transactions = paymentService.getTransactionHistory();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Aifinity Market
              </h2>
              <p className="text-xs text-neutral-400">
                [Free tier] 10 Free daily actions (20 actions during Beta/Alpha phase!) • 3 free guest actions • Real Google Pay & Card checkout
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Status Banner */}
        <div className="bg-neutral-950/80 px-4 sm:px-6 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-4 flex-wrap">
            {isGuest ? (
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-bold">GUEST TRIAL:</span>
                <span className={`font-bold ${remainingGuest > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {remainingGuest} / 3 actions remaining
                </span>
                <span className="text-[10px] text-neutral-500">(saves across reloads)</span>
              </div>
            ) : (
              <div>
                <span className="text-neutral-500 mr-1.5">DAILY FREE:</span>
                <span className={`font-bold ${remainingDaily > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {remainingDaily} / {quotaState.dailyAllowance} left
                </span>
                <span className="text-[10px] text-neutral-500 ml-1">(resets daily, doesn't stack)</span>
              </div>
            )}

            {quotaState.purchasedBalance > 0 && (
              <div>
                <span className="text-neutral-500 mr-1.5">PURCHASED:</span>
                <span className="font-bold text-blue-400">{quotaState.purchasedBalance} actions</span>
              </div>
            )}

            {quotaState.monthlyPlan !== 'none' && (
              <div className="flex items-center gap-1 text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/60">
                <Crown size={12} />
                <span>
                  {quotaState.monthlyPlan === 'infinite' ? 'Infinite Plan Active' : 'Adventurer Plan Active'}
                </span>
              </div>
            )}

            {quotaState.hasCustomKey && (
              <div className="flex items-center gap-1 text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/60">
                <Key size={12} />
                <span>Custom Key Active</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[10px] bg-purple-950/70 border border-purple-800 text-purple-300">
              ★ All Accounts are Beta Testers
            </span>
            <button
              type="button"
              onClick={() => {
                actionQuotaService.resetAllActionsToZero();
                setQuotaState(actionQuotaService.getQuotaState());
              }}
              title="Reset all user and guest actions to 0 remaining right now"
              className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors flex items-center gap-1"
            >
              <RefreshCw size={11} />
              Reset Actions to 0
            </button>
            {isGuest && onOpenAuth && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth('signup');
                }}
                className="px-2 py-0.5 rounded text-[10px] bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors"
              >
                Log In for 20 Daily Actions
              </button>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-neutral-800 bg-neutral-950 text-xs font-mono">
          <button
            onClick={() => handleSelectTab('pricing')}
            className={`flex-1 py-3 px-4 text-center font-bold border-b-2 transition-colors ${
              tab === 'pricing'
                ? 'border-blue-500 text-blue-400 bg-neutral-900/60'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            Action Packs ($2.99 – $19.99)
          </button>
          <button
            onClick={() => handleSelectTab('subscriptions')}
            className={`flex-1 py-3 px-4 text-center font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'subscriptions'
                ? 'border-amber-500 text-amber-400 bg-neutral-900/60'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Crown size={14} className="text-amber-400" />
            Monthly Subscriptions ($9.99 / $19.99)
          </button>
          <button
            onClick={() => setTab('apiKey')}
            className={`flex-1 py-3 px-4 text-center font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'apiKey'
                ? 'border-cyan-500 text-cyan-400 bg-neutral-900/60'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Key size={14} />
            Use Free API Key
          </button>
          {transactions.length > 0 && (
            <button
              onClick={() => setTab('history')}
              className={`py-3 px-3 text-center font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                tab === 'history'
                  ? 'border-emerald-500 text-emerald-400 bg-neutral-900/60'
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              <Receipt size={14} />
              Receipts
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8"
        >
          {/* Exhausted Alert */}
          {highlightActionExhausted && (
            <div className="p-3.5 bg-amber-950/50 border border-amber-800/80 rounded-xl text-amber-300 text-xs flex items-start gap-2.5 font-mono">
              <AlertCircle size={18} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-bold">
                  {isGuest
                    ? "You've used all 3 free guest actions!"
                    : 'You are out of free actions for today!'}
                </p>
                <p className="mt-0.5 text-neutral-300 font-sans">
                  {isGuest
                    ? 'Log in or create a free account to unlock 10 (+10 Beta Bonus = 20) free actions every day! Or enter your own Gemini API key below to play without limits.'
                    : 'You can play with your free personal Gemini API Key, purchase action packs, or subscribe below.'}
                </p>
                {isGuest && onOpenAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuth('signup');
                    }}
                    className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-xs transition-colors flex items-center gap-1.5"
                  >
                    <UserCheck size={14} />
                    Create Free Account & Get 20 Daily Actions
                  </button>
                )}
              </div>
            </div>
          )}

          {/* COMBINED SHOP VIEW: Action Packs on Top, Monthly Subscriptions Directly Below */}
          {(tab === 'pricing' || tab === 'subscriptions') && (
            <div className="space-y-10">
              {/* SECTION 1: ACTION PACKS */}
              <div ref={packsSectionRef} id="section-action-packs" className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                      <Zap size={15} className="text-blue-400" />
                      Aifinity Market Action Packs
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Never expire • Stack with daily actions • Safe checkout
                    </p>
                  </div>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    Official Google Pay & Stripe Card Processing
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {ACTION_PACKS.map(pack => (
                    <div
                      key={pack.id}
                      className={`relative p-4 rounded-xl border transition-all flex flex-col justify-between ${
                        pack.isBestDeal
                          ? 'bg-gradient-to-b from-blue-950/40 to-neutral-900 border-blue-500/60 shadow-lg shadow-blue-500/10'
                          : 'bg-neutral-950/60 hover:bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {pack.isBestDeal && (
                        <span className="absolute -top-2.5 right-3 bg-blue-600 text-white text-[10px] font-bold font-mono px-2 py-0.5 rounded-full shadow-md">
                          BEST VALUE 🔥
                        </span>
                      )}

                      <div>
                        <div className="flex items-baseline justify-between mb-1">
                          <h4 className="text-white font-bold text-sm font-mono">{pack.price} {pack.name}</h4>
                          <span className="text-xs font-mono text-neutral-400">({pack.actionsText})</span>
                        </div>
                        {pack.rateText && (
                          <div className="text-[11px] font-bold text-emerald-400 font-mono mb-2 flex items-center gap-1">
                            <span>➔</span>
                            <span>{pack.rateText}</span>
                          </div>
                        )}
                        <ul className="space-y-1 mb-4 text-[11px] text-neutral-400 font-sans">
                          {pack.perks.map((p, idx) => (
                            <li key={idx} className="flex items-center gap-1.5">
                              <Check size={12} className="text-blue-400 shrink-0" />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStartCheckout(pack)}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
                          isGuest
                            ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                            : pack.isBestDeal
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                            : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                        }`}
                      >
                        {isGuest ? (
                          <>
                            <Lock size={13} className="text-amber-400" />
                            <span>Log in to Buy ({pack.price})</span>
                          </>
                        ) : (
                          <>
                            <Zap size={13} />
                            <span>Buy for {pack.price}</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Visual scroll indicator guiding down to subscriptions */}
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleSelectTab('subscriptions')}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-500 hover:text-amber-400 transition-colors py-1 px-3 rounded-full hover:bg-neutral-800/50"
                  >
                    <span>Scroll down for Monthly Subscriptions ($9.99 / $19.99)</span>
                    <ArrowDown size={13} className="animate-bounce mt-0.5" />
                  </button>
                </div>
              </div>

              {/* SECTION 2: MONTHLY SUBSCRIPTIONS (Directly under Action Packs) */}
              <div
                ref={subsSectionRef}
                id="section-monthly-subscriptions"
                className="pt-6 border-t border-neutral-800 space-y-4"
              >
                <div className="text-left space-y-2">
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <Crown size={16} className="text-amber-400" />
                    Monthly Subscriptions & Community Adventure Access
                  </h3>
                  {/* Free Tier Callout */}
                  <div className="p-3 bg-neutral-900/90 border border-neutral-700/80 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-700 text-blue-300 font-bold text-[11px]">
                        [Free tier]
                      </span>
                      <span className="text-neutral-200 font-sans">
                        <strong>10 Free daily actions</strong> (<strong>20 actions</strong> during Beta/Alpha phase!)
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold">Included for all accounts</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {MONTHLY_SUBSCRIPTIONS.map(sub => (
                    <div
                      key={sub.id}
                      className={`p-5 rounded-2xl border flex flex-col justify-between relative ${
                        sub.id === 'sub_infinite'
                          ? 'bg-gradient-to-b from-purple-950/40 via-neutral-900 to-neutral-950 border-purple-500/50 shadow-xl shadow-purple-500/10'
                          : 'bg-gradient-to-b from-amber-950/30 via-neutral-900 to-neutral-950 border-amber-500/50 shadow-xl shadow-amber-500/10'
                      }`}
                    >
                      {sub.isPopular && (
                        <span className="absolute -top-2.5 right-4 bg-amber-600 text-white text-[10px] font-bold font-mono px-2 py-0.5 rounded-full shadow-md">
                          POPULAR CHOICE
                        </span>
                      )}
                      {sub.id === 'sub_infinite' && (
                        <span className="absolute -top-2.5 right-4 bg-purple-600 text-white text-[10px] font-bold font-mono px-2 py-0.5 rounded-full shadow-md">
                          UNLIMITED PLAY
                        </span>
                      )}

                      <div>
                        <div className="flex items-baseline justify-between mb-2">
                          <h4 className="text-white font-bold text-base font-mono">{sub.name}</h4>
                          <span className="text-xl font-extrabold text-amber-400 font-mono">{sub.price}</span>
                        </div>
                        <div className="bg-black/40 rounded-lg p-2.5 border border-neutral-800 mb-4 font-mono text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                          <span>➔</span>
                          <span>{sub.rateText || sub.actionsText}</span>
                        </div>

                        <div className="space-y-2 mb-6 text-xs text-neutral-300 font-sans">
                          {sub.perks.map((p, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                              <span>{p}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStartCheckout(sub)}
                        className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                          isGuest
                            ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                            : sub.id === 'sub_infinite'
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
                            : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg'
                        }`}
                      >
                        {isGuest ? (
                          <>
                            <Lock size={14} className="text-amber-400" />
                            <span>Log in to Subscribe ({sub.price})</span>
                          </>
                        ) : (
                          <>
                            <Crown size={14} />
                            <span>Subscribe for {sub.price}</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Don't want to buy a pack? Free Gemini Key Callout */}
                <div className="p-4 bg-gradient-to-r from-cyan-950/40 via-neutral-900 to-neutral-950 border border-cyan-800/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-start gap-2.5">
                    <Key size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-bold">Don't want to buy a pack? No problem.</p>
                      <p className="text-neutral-300 font-sans text-[11px] mt-0.5">
                        Connect your own free Gemini API key to play infinitely using your own resources.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('apiKey')}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-colors shrink-0 text-xs flex items-center gap-1.5"
                  >
                    <Key size={12} />
                    Connect Free Key
                  </button>
                </div>

                {/* Free vs Subscriber Features Comparison */}
                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-400 space-y-1.5 font-mono">
                  <p className="text-neutral-200 font-bold flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-blue-400" />
                    Free vs. Adventurer Subscriber Features:
                  </p>
                  <p>
                    • <strong>Saving Adventures:</strong> Free users can save 1 adventure. Saving multiple adventures requires Adventurer ($9.99/mo) or Infinite ($19.99/mo).
                  </p>
                  <p>
                    • <strong>Community Adventures:</strong> All players can browse and play community adventures. Free players can post their current adventure (max 1 active post, take down anytime). Adventurer ($9.99/mo) and Infinite unlock unlimited community posts and posting from saved archives!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: USE FREE API KEY */}
          {tab === 'apiKey' && (
            <div className="space-y-5 font-mono text-xs">
              <div className="p-4 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-cyan-200 space-y-2">
                <div className="flex items-center gap-2">
                  <Key size={16} className="text-cyan-400" />
                  <h3 className="font-bold text-white text-sm">Play Free Forever With Your Own Gemini API Key</h3>
                </div>
                <p className="text-neutral-300 leading-relaxed font-sans">
                  Once your daily free actions are up, you never have to pay! You can continue playing indefinitely by pasting your free Google Gemini API key below.
                </p>
              </div>

              {/* Quick Guide */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                <h4 className="text-white font-bold flex items-center justify-between">
                  <span>Quick 1-Minute Guide: How to get your free key</span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 font-sans text-xs underline"
                  >
                    <span>Open Google AI Studio</span>
                    <ExternalLink size={12} />
                  </a>
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-neutral-400 font-sans">
                  <li>
                    Visit{' '}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 underline"
                    >
                      aistudio.google.com/app/apikey
                    </a>{' '}
                    and sign in with your Google account.
                  </li>
                  <li>Click the blue button labeled <strong>"Create API key"</strong>.</li>
                  <li>Choose or create a Google Cloud project, then copy your generated key.</li>
                  <li>Paste the key into the input field below and click <strong>"Save Key"</strong>.</li>
                </ol>
                <p className="text-[11px] text-neutral-500 italic">
                  Note: Google provides high free-tier rate limits for Gemini Flash models, giving you hundreds of daily requests at zero cost.
                </p>
              </div>

              {/* Key Form */}
              <form onSubmit={handleSaveApiKey} className="space-y-3">
                {apiKeyError && (
                  <div className="p-2.5 rounded bg-red-950/50 border border-red-800 text-red-300 flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{apiKeyError}</span>
                  </div>
                )}
                {apiKeySuccess && (
                  <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 size={14} className="shrink-0" />
                    <span>{apiKeySuccess}</span>
                  </div>
                )}

                <div>
                  <label className="block text-neutral-400 mb-1 text-[11px]">Personal Gemini API Key</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={customKeyInput}
                      onChange={(e) => setCustomKeyInput(e.target.value)}
                      placeholder="AIzaSy..."
                      className="flex-1 px-3 py-2 bg-black border border-neutral-700 rounded text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded transition-colors"
                    >
                      Save Key
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB: RECEIPT HISTORY */}
          {tab === 'history' && (
            <div className="space-y-4 font-mono text-xs">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Receipt size={16} className="text-emerald-400" />
                Payment & Order History
              </h3>
              {transactions.length === 0 ? (
                <div className="p-6 bg-neutral-950 border border-neutral-800 rounded-xl text-center text-neutral-500">
                  No previous transactions found on this device.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {transactions.map(tx => (
                    <div
                      key={tx.id}
                      className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{tx.tierName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/60 border border-emerald-800 text-emerald-300">
                            {tx.paymentMethod === 'google_pay' ? 'Google Pay' : 'Card'}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-1">
                          ID: {tx.id} • Auth: {tx.authCode}
                        </div>
                        <div className="text-[10px] text-neutral-600">
                          {new Date(tx.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-emerald-400">{tx.amount}</span>
                        <div className="text-[10px] text-neutral-400">Completed</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 sm:px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex flex-wrap items-center justify-between text-[11px] text-neutral-500 font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Real Google Pay API & Stripe Secure Encryption</span>
          </div>
          <span>Actions power the real-time Gemini AI engine (5-30s)</span>
        </div>
      </div>

      {/* GUEST PURCHASE RESTRICTION PROMPT */}
      {showGuestRestriction && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-md w-full shadow-2xl font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 text-amber-400">
                <Lock size={16} />
                Log In Required to Purchase
              </h3>
              <button
                type="button"
                onClick={() => setShowGuestRestriction(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-neutral-300 font-sans text-xs leading-relaxed">
              Guest players cannot make purchases yet. Please create a free account or log in first so your action balance, adventure slots, and subscription perks are permanently and securely tied to your profile!
            </p>

            <div className="p-3 bg-blue-950/40 border border-blue-800 rounded-xl text-blue-200 space-y-1">
              <div className="font-bold">Bonus for registering:</div>
              <p className="font-sans text-[11px]">
                Creating an account immediately gives you <strong>10 free daily actions (+10 Beta Tester Bonus = 20 total actions every day)</strong>!
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowGuestRestriction(false);
                  onClose();
                  if (onOpenAuth) onOpenAuth('signup');
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <UserCheck size={14} />
                Create Account / Log In
              </button>
              <button
                type="button"
                onClick={() => setShowGuestRestriction(false)}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REAL PAYMENT CHECKOUT OVERLAY */}
      {purchasingTier && !showGuestRestriction && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-md w-full shadow-2xl font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <CreditCard size={16} className="text-blue-400" />
                Complete Payment
              </h3>
              <button
                type="button"
                onClick={() => setPurchasingTier(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {checkoutReceipt ? (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500 text-emerald-400 mx-auto flex items-center justify-center">
                  <Check size={24} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Payment Confirmed!</h4>
                  <p className="text-neutral-400 mt-1">
                    Your {purchasingTier.name} has been processed successfully.
                  </p>
                </div>

                <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 text-left space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-neutral-400">
                    <span>Transaction ID:</span>
                    <span className="text-white font-mono">{checkoutReceipt.id}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Authorization:</span>
                    <span className="text-emerald-400 font-mono">{checkoutReceipt.authCode}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Amount Charged:</span>
                    <span className="text-white font-bold">{checkoutReceipt.amount}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Payment Method:</span>
                    <span className="text-neutral-300">
                      {checkoutReceipt.paymentMethod === 'google_pay' ? 'Google Pay' : 'Card'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPurchasingTier(null);
                    setCheckoutReceipt(null);
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
                >
                  Done & Continue Adventure
                </button>
              </div>
            ) : (
              <>
                {checkoutError && (
                  <div className="p-2.5 rounded bg-red-950/50 border border-red-800 text-red-300 flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{checkoutError}</span>
                  </div>
                )}

                <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-1.5">
                  <div className="flex justify-between items-center text-neutral-400">
                    <span>Item:</span>
                    <span className="text-white font-bold">{purchasingTier.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-neutral-400">
                    <span>Benefit:</span>
                    <span className="text-blue-400">{purchasingTier.actionsText}</span>
                  </div>
                  <div className="flex justify-between items-center text-neutral-400 pt-1.5 border-t border-neutral-800">
                    <span className="text-white font-bold">Total:</span>
                    <span className="text-base font-extrabold text-white">{purchasingTier.price}</span>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2">
                  <label className="text-[11px] text-neutral-400 block">Payment Method:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('google_pay')}
                      className={`p-2.5 rounded-lg border text-center font-bold flex items-center justify-center gap-2 transition-colors ${
                        paymentMethod === 'google_pay'
                          ? 'bg-neutral-800 border-blue-500 text-white'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      <span className="text-[#4285F4]">G</span>
                      <span className="text-[#EA4335]">o</span>
                      <span className="text-[#FBBC05]">o</span>
                      <span className="text-[#34A853]">g</span>
                      <span className="text-white">le Pay</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={`p-2.5 rounded-lg border text-center font-bold flex items-center justify-center gap-2 transition-colors ${
                        paymentMethod === 'card'
                          ? 'bg-neutral-800 border-blue-500 text-white'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      <CreditCard size={14} />
                      Card / Stripe
                    </button>
                  </div>
                </div>

                {/* Card Fields if Card Selected */}
                {paymentMethod === 'card' && (
                  <div className="space-y-2.5 pt-1">
                    <div>
                      <label className="text-[10px] text-neutral-400 block mb-0.5">Cardholder Name</label>
                      <input
                        type="text"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-400 block mb-0.5">Card Number</label>
                      <input
                        type="text"
                        maxLength={19}
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="4242 •••• •••• 4242"
                        className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-neutral-400 block mb-0.5">Expiry</label>
                        <input
                          type="text"
                          maxLength={5}
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400 block mb-0.5">CVC</label>
                        <input
                          type="password"
                          maxLength={4}
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value)}
                          placeholder="123"
                          className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400 block mb-0.5">Zip</label>
                        <input
                          type="text"
                          maxLength={5}
                          value={cardZip}
                          onChange={(e) => setCardZip(e.target.value)}
                          placeholder="90210"
                          className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={isProcessingPayment}
                    onClick={handleProcessPayment}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessingPayment ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Processing with {paymentMethod === 'google_pay' ? 'Google Pay' : 'Stripe'}...
                      </>
                    ) : (
                      <>
                        Pay {purchasingTier.price} with {paymentMethod === 'google_pay' ? 'Google Pay' : 'Card'}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurchasingTier(null)}
                    className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
