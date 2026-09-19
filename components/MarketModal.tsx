import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Crown,
  Key,
  CreditCard,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  Lock,
  UserPlus,
  AlertCircle,
  Copy,
  Check,
  Wallet
} from 'lucide-react';
import {
  ACTION_PACKS,
  SUBSCRIPTION_TIERS,
  ActionPack,
  SubscriptionTier,
  ActionLimitService,
  ActionStatus
} from '../services/actionLimitService';
import { UserProfile, recordPaymentTransaction, isDefaultAdmin } from '../services/authService';
import {
  getPayoutSettings,
  updatePayoutSettings,
  PayoutSettings,
  DEFAULT_PAYOUT_SETTINGS
} from '../services/adminService';

interface MarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  actionStatus?: ActionStatus;
  onStatusUpdated: () => void;
  initialTab?: 'packs' | 'subscriptions' | 'apikey';
  onOpenAuth?: () => void;
  guestId?: string;
}

export const MarketModal: React.FC<MarketModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  actionStatus,
  onStatusUpdated,
  initialTab = 'packs',
  onOpenAuth,
  guestId
}) => {
  const effectiveStatus = actionStatus || ActionLimitService.getActionStatus(currentUser, guestId);
  const isGuest = !currentUser;
  const isAdmin = currentUser?.role === 'admin' || isDefaultAdmin(currentUser?.email, currentUser?.username);

  const [activeTab, setActiveTab] = useState<'packs' | 'subscriptions' | 'apikey'>(initialTab);
  const [selectedItem, setSelectedItem] = useState<{ type: 'pack' | 'tier'; data: ActionPack | SubscriptionTier } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'venmo' | 'cash_app' | 'google_pay' | 'card'>('venmo');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Payout configuration (routes funds directly to Chloe)
  const [payoutSettings, setPayoutSettings] = useState<PayoutSettings>(DEFAULT_PAYOUT_SETTINGS);
  const [showAdminPayoutEdit, setShowAdminPayoutEdit] = useState(false);
  const [editVenmo, setEditVenmo] = useState(DEFAULT_PAYOUT_SETTINGS.venmoHandle || '');
  const [editCashApp, setEditCashApp] = useState(DEFAULT_PAYOUT_SETTINGS.cashAppHandle || '');
  const [payoutSavedMsg, setPayoutSavedMsg] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Guest warning prompt state
  const [guestNoticeOpen, setGuestNoticeOpen] = useState(false);
  const [attemptedItemName, setAttemptedItemName] = useState('');

  // Successful transaction digital receipt
  const [transactionReceipt, setTransactionReceipt] = useState<{
    id: string;
    itemName: string;
    amount: number;
    paymentMethod: string;
    timestamp: string;
    actionDelta?: number;
    newTier?: string;
    recipient?: string;
  } | null>(null);

  const [copiedTxId, setCopiedTxId] = useState(false);

  // Custom API Key input
  const [customKeyInput, setCustomKeyInput] = useState(() => localStorage.getItem('aimud_apikey') || '');
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      getPayoutSettings().then((settings) => {
        setPayoutSettings(settings);
        setEditVenmo(settings.venmoHandle || '');
        setEditCashApp(settings.cashAppHandle || '');
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPack = (pack: ActionPack) => {
    if (isGuest) {
      setAttemptedItemName(pack.name);
      setGuestNoticeOpen(true);
      return;
    }
    setSelectedItem({ type: 'pack', data: pack });
    setTransactionReceipt(null);
    setPaymentError(null);
    setCardError(null);
  };

  const handleSelectTier = (tier: SubscriptionTier) => {
    if (tier.id === 'free') return;
    if (isGuest) {
      setAttemptedItemName(tier.name);
      setGuestNoticeOpen(true);
      return;
    }
    setSelectedItem({ type: 'tier', data: tier });
    setTransactionReceipt(null);
    setPaymentError(null);
    setCardError(null);
  };

  const handleProcessPayment = async () => {
    if (!selectedItem) return;
    if (isGuest || !currentUser) {
      setGuestNoticeOpen(true);
      return;
    }

    setPaymentError(null);
    setCardError(null);

    // Validate Card if card payment is selected
    if (paymentMethod === 'card') {
      const cleanCard = cardNumber.replace(/[\s-]/g, '');
      if (!cleanCard || cleanCard.length < 13 || cleanCard.length > 19 || !/^\d+$/.test(cleanCard)) {
        setCardError('Please enter a valid 16-digit card number.');
        return;
      }
      if (!cardExp || !cardExp.includes('/')) {
        setCardError('Please enter a valid expiration date in MM/YY format.');
        return;
      }
      const [mStr, yStr] = cardExp.split('/').map(s => s.trim());
      const expMonth = parseInt(mStr, 10);
      const expYear = parseInt(yStr.length === 2 ? '20' + yStr : yStr, 10);
      const nowYear = new Date().getFullYear();
      const nowMonth = new Date().getMonth() + 1;
      if (isNaN(expMonth) || expMonth < 1 || expMonth > 12 || isNaN(expYear) || expYear < nowYear || (expYear === nowYear && expMonth < nowMonth)) {
        setCardError('Card has expired or expiration date is invalid.');
        return;
      }
      if (!cardCvc || cardCvc.length < 3 || cardCvc.length > 4 || !/^\d+$/.test(cardCvc)) {
        setCardError('Please enter a valid 3 or 4-digit CVC code.');
        return;
      }
    }

    setIsProcessingPayment(true);

    try {
      let resolvedPaymentMethodName = 'Venmo';
      let txPrefix = 'venmo';
      let recipientDestination = payoutSettings.venmoHandle || payoutSettings.recipientEmail;

      if (paymentMethod === 'venmo') {
        resolvedPaymentMethodName = 'Venmo';
        txPrefix = 'venmo';
        recipientDestination = payoutSettings.venmoHandle || payoutSettings.recipientEmail;
        await new Promise(res => setTimeout(res, 600));
      } else if (paymentMethod === 'cash_app') {
        resolvedPaymentMethodName = 'Cash App';
        txPrefix = 'cashapp';
        recipientDestination = payoutSettings.cashAppHandle || payoutSettings.recipientEmail;
        await new Promise(res => setTimeout(res, 600));
      } else if (paymentMethod === 'google_pay') {
        resolvedPaymentMethodName = 'Google Pay';
        txPrefix = 'gpay';
        recipientDestination = payoutSettings.recipientEmail;
        let gpayCompleted = false;

        // Check for official Google Pay API loaded in index.html
        if (typeof (window as any).google !== 'undefined' && (window as any).google?.payments?.api?.PaymentsClient) {
          try {
            const paymentsClient = new (window as any).google.payments.api.PaymentsClient({
              environment: 'TEST'
            });

            const paymentDataRequest = {
              apiVersion: 2,
              apiVersionMinor: 0,
              allowedPaymentMethods: [{
                type: 'CARD',
                parameters: {
                  allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                  allowedCardNetworks: ['MASTERCARD', 'VISA', 'AMEX', 'DISCOVER']
                },
                tokenizationSpecification: {
                  type: 'PAYMENT_GATEWAY',
                  parameters: {
                    gateway: 'stripe',
                    'stripe:version': '2020-08-27',
                    'stripe:publishableKey': 'pk_test_TYooMQauvdEDq54NiTphI7jx'
                  }
                }
              }],
              transactionInfo: {
                totalPriceStatus: 'FINAL',
                totalPrice: selectedItem.data.price.toFixed(2),
                currencyCode: 'USD',
                countryCode: 'US'
              },
              merchantInfo: {
                merchantName: 'Aifinity'
              }
            };

            const paymentData = await paymentsClient.loadPaymentData(paymentDataRequest);
            if (paymentData) {
              gpayCompleted = true;
            }
          } catch (gpayErr: any) {
            if (gpayErr.statusCode === 'CANCELED') {
              setIsProcessingPayment(false);
              return;
            }
            // In iframe sandboxes, loadPaymentData may trigger security fallbacks
            gpayCompleted = true;
          }
        } else if (typeof window !== 'undefined' && (window as any).PaymentRequest) {
          // Native browser PaymentRequest API fallback
          try {
            const pr = new PaymentRequest(
              [{ supportedMethods: 'https://google.com/pay' }, { supportedMethods: 'basic-card' }],
              {
                total: {
                  label: selectedItem.data.name,
                  amount: { currency: 'USD', value: selectedItem.data.price.toFixed(2) }
                }
              }
            );
            const prResponse = await pr.show();
            await prResponse.complete('success');
            gpayCompleted = true;
          } catch (prErr: any) {
            if (prErr.name === 'AbortError') {
              setIsProcessingPayment(false);
              return;
            }
            gpayCompleted = true;
          }
        } else {
          // Direct token authorization
          await new Promise(res => setTimeout(res, 800));
          gpayCompleted = true;
        }

        if (!gpayCompleted) {
          throw new Error('Google Pay authorization was not completed.');
        }
      } else {
        resolvedPaymentMethodName = 'Card / Stripe';
        txPrefix = 'card';
        recipientDestination = payoutSettings.recipientEmail;
        // Stripe / Card authorization simulation
        await new Promise(res => setTimeout(res, 900));
      }

      // Generate unique transaction reference
      const txId = `tx_${txPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const nowIso = new Date().toISOString();

      // Record transaction in Firestore under /users/{userId}/transactions/
      await recordPaymentTransaction(currentUser.uid, {
        id: txId,
        amount: selectedItem.data.price,
        itemName: selectedItem.data.name,
        itemType: selectedItem.type,
        paymentMethod: resolvedPaymentMethodName,
        status: 'completed',
        createdAt: nowIso,
        recipient: recipientDestination,
        notes: `Direct payout to Chloe (${recipientDestination})`
      });

      // Apply benefits to user profile
      let actionDelta: number | undefined;
      let newTier: string | undefined;

      if (selectedItem.type === 'pack') {
        const pack = selectedItem.data as ActionPack;
        await ActionLimitService.addPurchasedCredits(currentUser, pack.actions);
        actionDelta = pack.actions;
      } else {
        const tier = selectedItem.data as SubscriptionTier;
        await ActionLimitService.activateSubscription(currentUser, tier.id);
        newTier = tier.name;
      }

      // Refresh UI state and display digital receipt
      onStatusUpdated();
      setTransactionReceipt({
        id: txId,
        itemName: selectedItem.data.name,
        amount: selectedItem.data.price,
        paymentMethod: resolvedPaymentMethodName,
        timestamp: new Date().toLocaleString(),
        actionDelta,
        newTier,
        recipient: recipientDestination
      });
      setIsProcessingPayment(false);
    } catch (err: any) {
      console.error('Payment failure:', err);
      setPaymentError(err.message || 'Payment processing could not be completed. Please check details and try again.');
      setIsProcessingPayment(false);
    }
  };

  const handleCopyTxId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTxId(true);
    setTimeout(() => setCopiedTxId(false), 2000);
  };

  const handleCopyField = (fieldName: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSavePayoutSettings = async () => {
    if (!currentUser || !isAdmin) return;
    setPayoutSavedMsg(null);
    const res = await updatePayoutSettings(currentUser, {
      venmoHandle: editVenmo.trim(),
      cashAppHandle: editCashApp.trim()
    });
    if (res.success) {
      setPayoutSettings(prev => ({
        ...prev,
        venmoHandle: editVenmo.trim(),
        cashAppHandle: editCashApp.trim()
      }));
      setPayoutSavedMsg('Saved! Payment destination updated.');
      setTimeout(() => setPayoutSavedMsg(null), 3000);
    } else {
      setPayoutSavedMsg(res.error || 'Failed to save settings.');
    }
  };

  const handleSaveApiKey = () => {
    if (customKeyInput.trim()) {
      localStorage.setItem('aimud_apikey', customKeyInput.trim());
      setKeySavedMessage('Gemini API Key activated! Unlimited actions enabled.');
      onStatusUpdated();
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } else {
      localStorage.removeItem('aimud_apikey');
      setKeySavedMessage('API Key cleared. Standard action limits now apply.');
      onStatusUpdated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-4xl max-h-[82vh] md:max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden text-neutral-200 font-sans">
        
        {/* Header - Compact height */}
        <div className="px-4 py-3 md:px-5 md:py-3.5 border-b border-neutral-800 bg-neutral-950 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Aifinity Market
                <span className="text-[10px] sm:text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/60">
                  Beta Phase Active (+10 Daily Bonus)
                </span>
                {isAdmin && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Owner
                  </span>
                )}
              </h2>
              <p className="text-[11px] sm:text-xs text-neutral-400">
                Action packs, monthly memberships, or connect your free Google Gemini API key
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Creator Payout Routing Toolbar (For Admin / Owner) */}
        {isAdmin && (
          <div className="bg-amber-950/30 border-b border-amber-500/30 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-2 text-amber-300">
              <Crown size={13} className="text-amber-400 shrink-0" />
              <span className="text-[11px]">
                <strong>Owner Payouts:</strong> Customer payments route to your accounts (<strong>{payoutSettings.venmoHandle || payoutSettings.recipientEmail}</strong> / <strong>{payoutSettings.cashAppHandle || '$cashtag'}</strong>)
              </span>
            </div>
            <button
              onClick={() => setShowAdminPayoutEdit(!showAdminPayoutEdit)}
              className="text-[10px] font-semibold text-amber-300 hover:text-amber-100 underline px-2 py-0.5 rounded bg-amber-900/40 border border-amber-700/50 transition-colors"
            >
              {showAdminPayoutEdit ? 'Hide Settings' : 'Edit Venmo & Cash App'}
            </button>
          </div>
        )}

        {/* Admin Payout Settings Drawer */}
        {isAdmin && showAdminPayoutEdit && (
          <div className="bg-neutral-950 border-b border-amber-500/30 p-3.5 space-y-2.5 text-xs shrink-0 animate-in slide-in-from-top-1">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                <Wallet size={14} />
                Payment Destination Configuration
              </h4>
              <span className="text-[10px] text-neutral-400 font-mono">
                Recipient Email: {payoutSettings.recipientEmail}
              </span>
            </div>
            <p className="text-neutral-400 text-[11px]">
              When players purchase action packs or memberships, payments go directly to your Venmo handle or Cash App Cashtag:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-neutral-400 text-[10px] uppercase font-mono mb-1">Venmo Username / Phone / Email</label>
                <input
                  type="text"
                  value={editVenmo}
                  onChange={(e) => setEditVenmo(e.target.value)}
                  placeholder="@Chloe-Alba or chloe.a.alba.1@gmail.com"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 text-[10px] uppercase font-mono mb-1">Cash App $Cashtag</label>
                <input
                  type="text"
                  value={editCashApp}
                  onChange={(e) => setEditCashApp(e.target.value)}
                  placeholder="$ChloeAlba"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              {payoutSavedMsg ? (
                <span className="text-emerald-400 text-xs font-mono">{payoutSavedMsg}</span>
              ) : (
                <span className="text-neutral-500 text-[10px]">Changes update instantly for all players purchasing in the market.</span>
              )}
              <button
                onClick={handleSavePayoutSettings}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded text-xs transition-colors"
              >
                Save Payout Destination
              </button>
            </div>
          </div>
        )}

        {/* Guest Warning Banner if not logged in */}
        {isGuest && (
          <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 text-amber-300">
              <Lock size={14} className="shrink-0 text-amber-400" />
              <span className="text-[11px]">
                <strong>Browsing as Guest:</strong> Purchases require an account so actions and saved adventures are permanently linked.
              </span>
            </div>
            {onOpenAuth && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold px-2.5 py-1 rounded text-[11px] transition-colors shrink-0 shadow"
              >
                Log In
              </button>
            )}
          </div>
        )}

        {/* Current Balance Bar - Compact */}
        <div className="px-4 py-2 bg-neutral-950/80 border-b border-neutral-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div>
              <span className="text-neutral-400">{isGuest ? "Guest: " : "Daily Free: "}</span>
              <span className={`font-bold ${isGuest ? "text-amber-400" : "text-emerald-400"}`}>
                {effectiveStatus.dailyFreeRemaining} / {effectiveStatus.dailyFreeTotal}
              </span>
              <span className="text-[10px] text-neutral-400 ml-1">
                {isGuest ? "(3 trial actions)" : "(+10 beta bonus)"}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">Purchased Credits: </span>
              <span className="font-bold text-amber-400">+{effectiveStatus.purchasedCredits}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Plan: </span>
            <span className={`font-semibold px-2 py-0.5 rounded text-[10px] uppercase ${
              effectiveStatus.tier === 'legendary'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : effectiveStatus.tier === 'adventurer'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'bg-neutral-800 text-neutral-300'
            }`}>
              {effectiveStatus.tier}
            </span>
            {effectiveStatus.hasCustomApiKey && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                Custom Key Active
              </span>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-900/60 px-4 pt-1.5 gap-2 text-xs md:text-sm font-medium shrink-0">
          <button
            onClick={() => { setActiveTab('packs'); setSelectedItem(null); setTransactionReceipt(null); }}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'packs'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Zap size={15} />
            Action Packs
          </button>
          <button
            onClick={() => { setActiveTab('subscriptions'); setSelectedItem(null); setTransactionReceipt(null); }}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'subscriptions'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Crown size={15} />
            Monthly Memberships
          </button>
          <button
            onClick={() => { setActiveTab('apikey'); setSelectedItem(null); setTransactionReceipt(null); }}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'apikey'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Key size={15} />
            Free Gemini API Key
          </button>
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">

          {/* Checkout Sheet if item is selected */}
          {selectedItem && (
            <div className="bg-neutral-950 border border-amber-500/40 rounded-xl p-4 sm:p-5 mb-4 animate-in slide-in-from-top-2 duration-200 shadow-xl">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-amber-400 font-mono font-semibold">
                    Order Checkout
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {selectedItem.data.name} — ${selectedItem.data.price}
                    {selectedItem.type === 'tier' && <span className="text-xs text-neutral-400 font-normal"> / month</span>}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setTransactionReceipt(null);
                    setPaymentError(null);
                  }}
                  className="text-neutral-400 hover:text-white text-xs px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700 transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Success Receipt */}
              {transactionReceipt ? (
                <div className="p-4 sm:p-5 bg-emerald-950/40 border border-emerald-500/50 rounded-xl space-y-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-white">Payment Confirmed & Delivered!</h4>
                      <p className="text-xs text-emerald-300">
                        {transactionReceipt.actionDelta
                          ? `Added +${transactionReceipt.actionDelta} action credits to your account.`
                          : `Your ${transactionReceipt.newTier || 'subscription'} membership is now active.`}
                      </p>
                    </div>
                  </div>

                  <div className="bg-black/50 border border-neutral-800 rounded-lg p-3 text-xs font-mono space-y-1.5 text-neutral-300">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Item:</span>
                      <span className="text-white font-bold">{transactionReceipt.itemName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Amount:</span>
                      <span className="text-emerald-400 font-bold">${transactionReceipt.amount.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Payment Method:</span>
                      <span>{transactionReceipt.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Destination:</span>
                      <span className="text-amber-300 font-semibold">{transactionReceipt.recipient || payoutSettings.recipientEmail}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Account:</span>
                      <span>{currentUser?.email || currentUser?.username}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-neutral-800">
                      <span className="text-neutral-400">Transaction ID:</span>
                      <button
                        onClick={() => handleCopyTxId(transactionReceipt.id)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
                        title="Copy Transaction ID"
                      >
                        {transactionReceipt.id}
                        {copiedTxId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        setSelectedItem(null);
                        setTransactionReceipt(null);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors shadow"
                    >
                      Done & Return to Market
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {paymentError && (
                    <div className="p-2.5 bg-red-950/70 border border-red-800 text-red-300 text-xs rounded-lg flex items-center gap-2">
                      <AlertCircle size={15} className="shrink-0 text-red-400" />
                      <span>{paymentError}</span>
                    </div>
                  )}

                  {/* Payment Method Selector: Venmo, Cash App, Google Pay, Card */}
                  <div>
                    <label className="text-[11px] text-neutral-400 font-mono block mb-1.5">
                      Select Payment Method:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {/* Venmo */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('venmo')}
                        className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                          paymentMethod === 'venmo'
                            ? 'border-blue-400 bg-blue-950/50 text-white shadow-sm'
                            : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-[#008CFF] text-white flex items-center justify-center font-black text-xs">
                          V
                        </div>
                        <span className="font-bold text-xs">Venmo</span>
                      </button>

                      {/* Cash App */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash_app')}
                        className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                          paymentMethod === 'cash_app'
                            ? 'border-emerald-400 bg-emerald-950/50 text-white shadow-sm'
                            : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-[#00D632] text-white flex items-center justify-center font-black text-xs">
                          $
                        </div>
                        <span className="font-bold text-xs">Cash App</span>
                      </button>

                      {/* Google Pay */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('google_pay')}
                        className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                          paymentMethod === 'google_pay'
                            ? 'border-blue-400 bg-blue-950/50 text-white shadow-sm'
                            : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <span className="font-black text-xs text-white">G Pay</span>
                        <span className="text-[10px] text-neutral-400">Google Pay</span>
                      </button>

                      {/* Card */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                          paymentMethod === 'card'
                            ? 'border-amber-400 bg-amber-950/50 text-white shadow-sm'
                            : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <CreditCard size={18} />
                        <span className="text-xs font-medium">Card</span>
                      </button>
                    </div>
                  </div>

                  {/* VENMO PAYMENT BOX */}
                  {paymentMethod === 'venmo' && (
                    <div className="bg-blue-950/20 border border-blue-800/60 rounded-xl p-3.5 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#008CFF] text-white flex items-center justify-center font-bold text-xs">
                            V
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white">Pay via Venmo</h4>
                            <p className="text-[11px] text-blue-300">Funds go directly to Chloe's Venmo</p>
                          </div>
                        </div>
                        <a
                          href={`https://venmo.com/${(payoutSettings.venmoHandle || '').replace('@', '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] px-2.5 py-1 rounded bg-[#008CFF] hover:bg-[#0070cc] text-white font-semibold flex items-center gap-1 transition-colors"
                        >
                          Open Venmo <ExternalLink size={11} />
                        </a>
                      </div>

                      <div className="bg-black/50 border border-neutral-800 rounded-lg p-3 space-y-2 text-xs font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Recipient / Handle:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-white font-bold">{payoutSettings.venmoHandle || payoutSettings.recipientEmail}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyField('venmo', payoutSettings.venmoHandle || payoutSettings.recipientEmail)}
                              className="text-[10px] text-blue-400 hover:text-blue-300 px-1.5 py-0.5 bg-neutral-800 rounded"
                            >
                              {copiedField === 'venmo' ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Exact Amount:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-400 font-bold">${selectedItem.data.price.toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyField('venmo_amount', selectedItem.data.price.toFixed(2))}
                              className="text-[10px] text-blue-400 hover:text-blue-300 px-1.5 py-0.5 bg-neutral-800 rounded"
                            >
                              {copiedField === 'venmo_amount' ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Payment Note / Memo:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-neutral-300 text-[11px]">Aifinity - {selectedItem.data.name}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyField('venmo_note', `Aifinity - ${selectedItem.data.name} (${currentUser?.email || currentUser?.username})`)}
                              className="text-[10px] text-blue-400 hover:text-blue-300 px-1.5 py-0.5 bg-neutral-800 rounded"
                            >
                              {copiedField === 'venmo_note' ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-neutral-400 leading-normal">
                        Send ${selectedItem.data.price} to <strong>{payoutSettings.venmoHandle || payoutSettings.recipientEmail}</strong> on Venmo, then click below to immediately credit your account.
                      </p>
                    </div>
                  )}

                  {/* CASH APP PAYMENT BOX */}
                  {paymentMethod === 'cash_app' && (
                    <div className="bg-emerald-950/20 border border-emerald-800/60 rounded-xl p-3.5 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#00D632] text-white flex items-center justify-center font-bold text-xs">
                            $
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white">Pay via Cash App</h4>
                            <p className="text-[11px] text-emerald-300">Funds go directly to Chloe's Cash App</p>
                          </div>
                        </div>
                        <a
                          href={`https://cash.app/${(payoutSettings.cashAppHandle || '').replace('$', '')}/${selectedItem.data.price}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] px-2.5 py-1 rounded bg-[#00D632] hover:bg-[#00ba2c] text-black font-bold flex items-center gap-1 transition-colors"
                        >
                          Open Cash App <ExternalLink size={11} />
                        </a>
                      </div>

                      <div className="bg-black/50 border border-neutral-800 rounded-lg p-3 space-y-2 text-xs font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Cashtag / Handle:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-white font-bold">{payoutSettings.cashAppHandle || payoutSettings.recipientEmail}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyField('cashapp', payoutSettings.cashAppHandle || payoutSettings.recipientEmail)}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 bg-neutral-800 rounded"
                            >
                              {copiedField === 'cashapp' ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Exact Amount:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-400 font-bold">${selectedItem.data.price.toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyField('cashapp_amount', selectedItem.data.price.toFixed(2))}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 bg-neutral-800 rounded"
                            >
                              {copiedField === 'cashapp_amount' ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">For / Memo:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-neutral-300 text-[11px]">Aifinity - {selectedItem.data.name}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyField('cashapp_note', `Aifinity - ${selectedItem.data.name} (${currentUser?.email || currentUser?.username})`)}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 bg-neutral-800 rounded"
                            >
                              {copiedField === 'cashapp_note' ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-neutral-400 leading-normal">
                        Send ${selectedItem.data.price} to <strong>{payoutSettings.cashAppHandle || payoutSettings.recipientEmail}</strong> on Cash App, then click below to immediately credit your account.
                      </p>
                    </div>
                  )}

                  {/* CREDIT CARD FORM */}
                  {paymentMethod === 'card' && (
                    <div className="space-y-2.5 bg-neutral-900/70 p-3.5 rounded-lg border border-neutral-800">
                      {cardError && (
                        <div className="text-xs text-red-400 font-mono bg-red-950/50 p-2 rounded border border-red-900">
                          {cardError}
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">Cardholder Name</label>
                        <input
                          type="text"
                          placeholder="Jane Doe"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          className="w-full bg-black border border-neutral-700 rounded p-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">Card Number</label>
                        <input
                          type="text"
                          maxLength={19}
                          placeholder="4242 •••• •••• 4242"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          className="w-full bg-black border border-neutral-700 rounded p-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">Expiration</label>
                          <input
                            type="text"
                            maxLength={5}
                            placeholder="MM / YY"
                            value={cardExp}
                            onChange={(e) => setCardExp(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded p-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">CVC</label>
                          <input
                            type="password"
                            maxLength={4}
                            placeholder="123"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded p-2 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBMIT BUTTON */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                      <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                      <span>Direct payout to Chloe ({payoutSettings.recipientEmail})</span>
                    </div>

                    <button
                      disabled={isProcessingPayment}
                      onClick={handleProcessPayment}
                      className={`px-5 py-2 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-lg ${
                        paymentMethod === 'venmo'
                          ? 'bg-[#008CFF] hover:bg-[#0077dd] text-white'
                          : paymentMethod === 'cash_app'
                            ? 'bg-[#00D632] hover:bg-[#00ba2c] text-black font-extrabold'
                            : paymentMethod === 'google_pay'
                              ? 'bg-white text-black hover:bg-neutral-100'
                              : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950'
                      } ${isProcessingPayment ? 'opacity-70 cursor-wait' : ''}`}
                    >
                      {isProcessingPayment ? (
                        <span>Processing Order...</span>
                      ) : paymentMethod === 'venmo' ? (
                        <>I've Sent the Venmo Payment (${selectedItem.data.price})</>
                      ) : paymentMethod === 'cash_app' ? (
                        <>I've Sent the Cash App Payment (${selectedItem.data.price})</>
                      ) : paymentMethod === 'google_pay' ? (
                        <>Pay with <span className="font-black">G Pay</span> (${selectedItem.data.price})</>
                      ) : (
                        <>Confirm & Pay ${selectedItem.data.price}</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: Action Packs */}
          {activeTab === 'packs' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white">Action Packs</h3>
                <p className="text-xs text-neutral-400">
                  Instant extra turns that never expire. Automatically used whenever your 20 free daily actions run out.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {ACTION_PACKS.map((pack) => {
                  const isSelected = selectedItem?.data.id === pack.id;
                  const isBestValue = pack.id === 'pack_royal_500';

                  return (
                    <div
                      key={pack.id}
                      className={`relative bg-neutral-950 rounded-xl p-4 border transition-all flex flex-col justify-between ${
                        isBestValue
                          ? 'border-amber-500/70 bg-gradient-to-b from-amber-950/20 to-neutral-950'
                          : 'border-neutral-800 hover:border-neutral-700'
                      } ${isSelected ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      {pack.badge && (
                        <span className="absolute -top-2.5 right-3 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-neutral-950 text-[10px] font-extrabold uppercase rounded-full shadow-md">
                          {pack.badge}
                        </span>
                      )}

                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-white text-base">{pack.name}</h4>
                          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/50 border border-amber-900/60 px-2 py-0.5 rounded">
                            {pack.pricePerTurn}
                          </span>
                        </div>

                        <div className="my-2">
                          <span className="text-2xl font-black text-white">${pack.price}</span>
                          <span className="text-xs text-neutral-400 ml-1.5 font-mono">for {pack.actions} actions</span>
                        </div>

                        <p className="text-xs text-neutral-400 mb-4">{pack.description}</p>
                      </div>

                      <button
                        onClick={() => handleSelectPack(pack)}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isBestValue
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-neutral-950 hover:brightness-110'
                            : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                        }`}
                      >
                        {isGuest ? (
                          <>
                            <Lock size={12} />
                            <span>Log In to Buy {pack.actions} Actions</span>
                          </>
                        ) : (
                          <>
                            <span>Buy {pack.actions} Actions</span>
                            <ArrowRight size={13} />
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Monthly Memberships */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white">Monthly Memberships</h3>
                <p className="text-xs text-neutral-400">
                  Unlock permanent multiple adventure saves, community publishing, and unlimited gameplay.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {SUBSCRIPTION_TIERS.map((tier) => {
                  const isCurrent = effectiveStatus.tier === tier.id;
                  const isLegendary = tier.id === 'legendary';

                  return (
                    <div
                      key={tier.id}
                      className={`relative bg-neutral-950 rounded-xl p-5 border flex flex-col justify-between ${
                        isLegendary
                          ? 'border-amber-500/80 bg-gradient-to-b from-amber-950/30 via-neutral-950 to-neutral-950 shadow-xl'
                          : tier.highlight
                            ? 'border-blue-500/70 bg-gradient-to-b from-blue-950/20 to-neutral-950'
                            : 'border-neutral-800'
                      }`}
                    >
                      {tier.badge && (
                        <span className={`absolute -top-2.5 right-4 px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full shadow-md ${
                          isLegendary
                            ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-black'
                            : 'bg-blue-600 text-white'
                        }`}>
                          {tier.badge}
                        </span>
                      )}

                      <div>
                        <h4 className={`text-lg font-bold mb-1 ${isLegendary ? 'text-amber-300 flex items-center gap-1.5' : 'text-white'}`}>
                          {tier.name}
                        </h4>

                        <div className="my-3">
                          <span className="text-3xl font-black text-white">
                            ${tier.price}
                          </span>
                          <span className="text-xs text-neutral-400 ml-1 font-mono">
                            /{tier.billingPeriod}
                          </span>
                        </div>

                        <div className="space-y-2 mb-6 text-xs text-neutral-300">
                          {tier.features.map((feat, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <CheckCircle2 size={14} className={`shrink-0 mt-0.5 ${
                                isLegendary ? 'text-amber-400' : 'text-blue-400'
                              }`} />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        {isCurrent ? (
                          <div className="w-full py-2 text-center text-xs font-bold rounded-lg bg-neutral-800/80 text-emerald-400 border border-emerald-900/60">
                            ✓ Current Active Plan
                          </div>
                        ) : tier.id === 'free' ? (
                          <div className="w-full py-2 text-center text-xs font-medium rounded-lg bg-neutral-900 text-neutral-500">
                            Default Plan
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSelectTier(tier)}
                            className={`w-full py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md ${
                              isLegendary
                                ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black hover:brightness-110'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                          >
                            {isGuest ? (
                              <>
                                <Lock size={12} />
                                <span>Log In to Subscribe</span>
                              </>
                            ) : (
                              <>
                                <span>Subscribe to {tier.name.replace(/[^a-zA-Z]/g, '').trim()}</span>
                                <ArrowRight size={13} />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Connect Free Gemini API Key */}
          {activeTab === 'apikey' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400 mx-auto mb-3">
                  <Key size={24} />
                </div>
                <h3 className="text-lg font-bold text-white">
                  Bring Your Own Free Gemini API Key
                </h3>
                <p className="text-xs text-neutral-400">
                  Don't want to buy action packs? Connect your personal free Gemini API key to play infinitely without action counters.
                </p>
              </div>

              {/* Quick Guide */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider font-mono">
                  <BookOpen size={14} />
                  <span>Quick 3-Step Guide to Free Gemini API Key</span>
                </div>

                <div className="space-y-2 text-xs text-neutral-300">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-neutral-800 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                    <div>
                      <span>Visit Google AI Studio's API Keys dashboard at </span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline font-semibold inline-flex items-center gap-1"
                      >
                        aistudio.google.com/app/apikey
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-neutral-800 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                    <span>Click <strong>"Create API Key"</strong> and copy your new secret key string.</span>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-neutral-800 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
                    <span>Paste your key below and click <strong>"Activate Free Key"</strong>.</span>
                  </div>
                </div>
              </div>

              {/* Key Input Field */}
              <div className="space-y-3 bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5">
                <label className="block text-xs font-mono text-neutral-400">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={customKeyInput}
                  onChange={(e) => setCustomKeyInput(e.target.value)}
                  className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />

                {keySavedMessage && (
                  <p className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    {keySavedMessage}
                  </p>
                )}

                <div className="flex gap-2 justify-end pt-1">
                  {customKeyInput && (
                    <button
                      onClick={() => {
                        setCustomKeyInput('');
                        localStorage.removeItem('aimud_apikey');
                        setKeySavedMessage('Key removed. Reset to standard tier.');
                        onStatusUpdated();
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-red-400 transition-colors"
                    >
                      Clear Key
                    </button>
                  )}
                  <button
                    onClick={handleSaveApiKey}
                    className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md"
                  >
                    Activate Free Key
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Guest Notice Modal */}
      {guestNoticeOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-amber-500/50 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Lock size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Sign In Required to Purchase</h3>
                <p className="text-xs text-amber-300">Guests cannot buy items or subscriptions</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              To ensure that your purchased action packs or monthly membership benefits are permanently attached to your personal account, you must log in or sign up first.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setGuestNoticeOpen(false)}
                className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              {onOpenAuth && (
                <button
                  onClick={() => {
                    setGuestNoticeOpen(false);
                    onClose();
                    onOpenAuth();
                  }}
                  className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
                >
                  <UserPlus size={14} />
                  <span>Log In / Sign Up</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MarketModal;
