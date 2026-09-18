import React, { useState, useEffect } from 'react';
import { authService, AuthSession } from '../services/authService';
import { signInWithGooglePopup } from '../services/firebase';
import { userService, UserProfile } from '../services/userService';
import {
  User,
  LogIn,
  UserPlus,
  Sparkles,
  X,
  Check,
  AlertCircle,
  LogOut,
  RefreshCw,
  Mail,
  KeyRound,
  ArrowLeft,
  ShieldCheck,
  Copy,
  ChevronRight,
  Loader2,
  ExternalLink
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'signup' | 'guest';
  onResetData?: () => void;
}

export default function AuthModal({ isOpen, onClose, initialTab = 'login', onResetData }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'signup' | 'guest' | 'recovery' | 'google-signup'>(initialTab);
  const [session, setSession] = useState<AuthSession>(authService.getSession());
  const [userProfileData, setUserProfileData] = useState<UserProfile | null>(userService.getProfile());
  const [adminTargetUser, setAdminTargetUser] = useState('');
  const [adminGrantAmount, setAdminGrantAmount] = useState(100);
  const [adminActionError, setAdminActionError] = useState('');
  const [adminActionSuccess, setAdminActionSuccess] = useState('');
  const [profile, setProfile] = useState(authService.getProfileInfo());
  const [unauthorizedDomainInfo, setUnauthorizedDomainInfo] = useState<{ host: string; consoleUrl: string; error: string } | null>(null);

  // Login Form
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');

  // Signup Form
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState('');

  // Google Login / Signup
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleSignupEmail, setGoogleSignupEmail] = useState('');
  const [googleSignupUsername, setGoogleSignupUsername] = useState('');
  const [googleSignupPassword, setGoogleSignupPassword] = useState('');
  const [googleSignupConfirm, setGoogleSignupConfirm] = useState('');
  const [googleSignupError, setGoogleSignupError] = useState('');
  const [googleSignupSuccess, setGoogleSignupSuccess] = useState('');

  // Password Recovery / Reset Form
  const [recoveryStage, setRecoveryStage] = useState<'request' | 'reset'>('request');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');
  const [generatedCodeNotice, setGeneratedCodeNotice] = useState<{ code: string; email: string; username: string } | null>(null);

  // Profile Email Attachment
  const [showAttachEmailForm, setShowAttachEmailForm] = useState(false);
  const [profileEmailInput, setProfileEmailInput] = useState('');
  const [profileEmailError, setProfileEmailError] = useState('');
  const [profileEmailSuccess, setProfileEmailSuccess] = useState('');

  // Guest Form
  const [guestInput, setGuestInput] = useState(session.guestName || '');
  const [guestError, setGuestError] = useState('');
  const [guestSuccess, setGuestSuccess] = useState('');

  useEffect(() => {
    const unsub = authService.subscribe(() => {
      const s = authService.getSession();
      setSession(s);
      setProfile(authService.getProfileInfo());
      if (s.guestName) {
        setGuestInput(s.guestName);
      }
    });
    const unsubUser = userService.subscribe(() => {
      setUserProfileData(userService.getProfile());
    });
    return () => { unsub(); unsubUser(); };
  }, []);

  useEffect(() => {
    setTab(initialTab);
    setProfile(authService.getProfileInfo());
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  // Real-time validations
  const usernameCheck = signupUsername.trim() ? authService.validateUsername(signupUsername) : null;
  const emailCheck = signupEmail.trim() ? authService.validateEmail(signupEmail) : null;
  const emailTakenCheck = signupEmail.trim() ? authService.isEmailTaken(signupEmail) : false;

  const googleUsernameCheck = googleSignupUsername.trim() ? authService.validateUsername(googleSignupUsername) : null;
  const guestCheck = guestInput.trim() ? authService.validateGuestName(guestInput) : null;

  const handleAutofillRandom = () => {
    const randomName = authService.generateUniqueUsername();
    setSignupUsername(randomName);
    setSignupError('');
  };

  const handleAutofillGoogleRandom = () => {
    const randomName = authService.generateUniqueUsername();
    setGoogleSignupUsername(randomName);
    setGoogleSignupError('');
  };

  // Regular login (supports username or attached email)
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginSuccess('');

    const res = authService.login(loginIdentifier, loginPassword);
    if (!res.success) {
      setLoginError(res.error || 'Login failed');
    } else {
      setLoginSuccess(`Logged in successfully!`);
      setTimeout(() => {
        onClose();
      }, 500);
    }
  };

  // Regular signup (with optional email)
  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    setSignupSuccess('');

    if (signupPassword !== signupConfirm) {
      setSignupError('Passwords do not match.');
      return;
    }

    if (signupEmail.trim() && !emailCheck?.valid) {
      setSignupError(emailCheck?.error || 'Invalid email address.');
      return;
    }

    if (signupEmail.trim() && emailTakenCheck) {
      setSignupError('This email is already attached to another account.');
      return;
    }

    const res = authService.register(signupUsername, signupPassword, signupEmail);
    if (!res.success) {
      setSignupError(res.error || 'Registration failed');
    } else {
      setSignupSuccess(`Account created! Logged in as ${signupUsername}.`);
      setTimeout(() => {
        onClose();
      }, 600);
    }
  };

  // Real Firebase Google Login Trigger (opens standard Google sign-in window)
  const handleTriggerGoogleAuth = async () => {
    setLoginError('');
    setSignupError('');
    setGoogleLoading(true);

    try {
      const result = await signInWithGooglePopup();
      if (!result.success || !result.user) {
        if ((result as any).isUnauthorizedDomain) {
          setUnauthorizedDomainInfo({
            host: (result as any).unauthorizedHost || (typeof window !== 'undefined' ? window.location.hostname : 'www.aifinity-rpg.com'),
            consoleUrl: (result as any).consoleSettingsUrl || 'https://console.firebase.google.com/project/gen-lang-client-0320558179/authentication/settings',
            error: result.error || 'Domain unauthorized in Firebase.'
          });
        } else if (result.error && !result.error.includes('closed-by-user') && !result.error.includes('popup-closed-by-user')) {
          setLoginError(result.error || 'Google Sign-In failed.');
          setSignupError(result.error || 'Google Sign-In failed.');
        }
        setGoogleLoading(false);
        return;
      }

      const userEmail = result.user.email || '';
      if (!userEmail) {
        setLoginError('Could not retrieve email from Google.');
        setSignupError('Could not retrieve email from Google.');
        setGoogleLoading(false);
        return;
      }

      const res = authService.loginWithGoogle(userEmail);
      if (res.success) {
        // Existing Google account: Log in automatically!
        setLoginSuccess(`Logged in automatically with Google as ${res.username}!`);
        setTimeout(() => {
          onClose();
        }, 600);
      } else if (res.isNewUser) {
        // New user signing up with Google: prompt to set up username & password manually!
        setGoogleSignupEmail(userEmail);
        // Derive a clean suggested username from Google displayName or email
        const rawName = result.user.displayName || userEmail.split('@')[0];
        const cleanName = rawName.replace(/[^a-zA-Z0-9]/g, '');
        const suggested = cleanName.length >= 2 ? cleanName.slice(0, 15) : 'User';
        const uniqueSuggested = authService.validateUsername(suggested).valid
          ? suggested
          : authService.generateUniqueUsername();

        setGoogleSignupUsername(uniqueSuggested);
        setGoogleSignupPassword('');
        setGoogleSignupConfirm('');
        setGoogleSignupError('');
        setGoogleSignupSuccess('');
        setTab('google-signup');
      } else {
        setLoginError(res.error || 'Failed to authenticate with Google.');
      }
    } catch (err: any) {
      console.error('Firebase Auth error:', err);
      setLoginError('Unable to open Google login page. Please check popups.');
      setSignupError('Unable to open Google login page. Please check popups.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Link Google Account from profile via Firebase Google popup
  const handleLinkGoogleFromProfile = async () => {
    setProfileEmailError('');
    setProfileEmailSuccess('');
    setGoogleLoading(true);

    try {
      const result = await signInWithGooglePopup();
      if (!result.success || !result.user?.email) {
        if (result.error && !result.error.includes('closed-by-user') && !result.error.includes('popup-closed-by-user')) {
          setProfileEmailError(result.error || 'Google link failed.');
        }
        setGoogleLoading(false);
        return;
      }

      const linkRes = authService.linkGoogleAccount(result.user.email);
      if (!linkRes.success) {
        setProfileEmailError(linkRes.error || 'Failed to link Google account.');
      } else {
        setProfileEmailSuccess(`Google account (${result.user.email}) linked successfully!`);
      }
    } catch (err: any) {
      setProfileEmailError('Google login error.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // New Google User completes signup by setting password manually
  const handleGoogleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleSignupError('');
    setGoogleSignupSuccess('');

    if (googleSignupPassword !== googleSignupConfirm) {
      setGoogleSignupError('Passwords do not match.');
      return;
    }

    if (googleSignupPassword.length < 4) {
      setGoogleSignupError('Password must be at least 4 characters long.');
      return;
    }

    const res = authService.register(
      googleSignupUsername,
      googleSignupPassword,
      googleSignupEmail,
      googleSignupEmail
    );

    if (!res.success) {
      setGoogleSignupError(res.error || 'Failed to complete registration.');
    } else {
      setGoogleSignupSuccess(
        `Welcome ${googleSignupUsername}! Your account has been created with your manual password and verified Google email.`
      );
      setTimeout(() => {
        onClose();
      }, 800);
    }
  };

  // Password Recovery: Step 1 (Request code)
  const handleRequestRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoverySuccess('');
    setGeneratedCodeNotice(null);

    const res = authService.requestPasswordRecovery(recoveryIdentifier);
    if (!res.success) {
      setRecoveryError(res.error || 'Unable to initiate recovery.');
    } else {
      setGeneratedCodeNotice({
        code: res.code || '',
        email: res.obfuscatedEmail || '',
        username: res.username || ''
      });
      setRecoverySuccess(`A 6-digit recovery code has been dispatched to ${res.obfuscatedEmail}.`);
      setRecoveryStage('reset');
      setRecoveryCodeInput(res.code || '');
    }
  };

  // Password Recovery: Step 2 (Reset password)
  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoverySuccess('');

    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryError('New passwords do not match.');
      return;
    }

    if (recoveryNewPassword.length < 4) {
      setRecoveryError('Password must be at least 4 characters long.');
      return;
    }

    const usernameOrEmail = generatedCodeNotice?.username || recoveryIdentifier;
    const res = authService.resetPasswordWithCode(usernameOrEmail, recoveryCodeInput, recoveryNewPassword);

    if (!res.success) {
      setRecoveryError(res.error || 'Password reset failed.');
    } else {
      setRecoverySuccess('Password reset successfully! You can now log in.');
      setLoginIdentifier(generatedCodeNotice?.username || recoveryIdentifier);
      setLoginPassword('');
      setTimeout(() => {
        setTab('login');
        setRecoveryStage('request');
        setGeneratedCodeNotice(null);
        setLoginSuccess('Password reset! Please enter your new password to log in.');
      }, 1000);
    }
  };

  // Profile Email Management
  const handleSaveProfileEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileEmailError('');
    setProfileEmailSuccess('');

    const res = authService.attachEmail(profileEmailInput);
    if (!res.success) {
      setProfileEmailError(res.error || 'Failed to attach email.');
    } else {
      setProfileEmailSuccess('Recovery email successfully attached!');
      setShowAttachEmailForm(false);
      setProfileEmailInput('');
      setProfile(authService.getProfileInfo());
    }
  };

  const handleRemoveProfileEmail = () => {
    authService.removeAttachedEmail();
    setProfile(authService.getProfileInfo());
    setProfileEmailSuccess('Attached email removed.');
  };

  // Guest Name Management
  const handleSaveGuestName = (e: React.FormEvent) => {
    e.preventDefault();
    setGuestError('');
    setGuestSuccess('');

    const res = authService.setGuestName(guestInput);
    if (!res.success) {
      setGuestError(res.error || 'Failed to update guest name');
    } else {
      setGuestSuccess(`Guest name set to ${guestInput.trim()} (Guest)!`);
      setTimeout(() => {
        onClose();
      }, 500);
    }
  };

  const handleClearGuestName = () => {
    authService.clearGuestName();
    setGuestInput('');
    setGuestSuccess('Guest name reset to default.');
  };

  const handleLogout = () => {
    authService.logout();
    setTab('login');
  };

  const singleName = authService.getSingleplayerName();
  const multiName = authService.getMultiplayerName();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col font-sans max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <User size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide font-mono">
                {session.type === 'registered' ? 'Account Profile' : 'Player Identity'}
              </h2>
              <p className="text-[11px] text-neutral-400">
                {session.type === 'registered'
                  ? `Logged in as ${session.username}`
                  : 'Playing as Guest by default'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto">

          {/* LOGGED IN STATE VIEW */}
          {session.type === 'registered' && (
            <div className="p-5 space-y-4">
              <div className="bg-blue-950/30 border border-blue-800/40 p-4 rounded-lg flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-400 flex items-center justify-center text-blue-300 font-bold font-mono text-lg">
                  {session.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base truncate font-mono">{session.username}</span>
                    <span className="text-[10px] bg-emerald-950 border border-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                      VERIFIED ACCOUNT
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                    Singleplayer & Multiplayer identity: <span className="text-cyan-300 font-bold">{session.username}</span>
                  </p>
                </div>
              </div>

              {/* Account Recovery / Attached Email Section */}
              <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800 space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                    <Mail size={13} className="text-blue-400" />
                    <span>Recovery Email</span>
                  </div>
                  {profile.email ? (
                    <span className="text-[10px] bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ShieldCheck size={11} /> Attached
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-950/80 border border-amber-800 text-amber-300 px-1.5 py-0.5 rounded">
                      Not attached
                    </span>
                  )}
                </div>

                {profile.email ? (
                  <div className="flex items-center justify-between bg-neutral-900/90 px-3 py-2 rounded border border-neutral-800 text-neutral-200">
                    <span className="truncate">{profile.email}</span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileEmailInput(profile.email || '');
                          setShowAttachEmailForm(true);
                        }}
                        className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        Change
                      </button>
                      <span className="text-neutral-600">|</span>
                      <button
                        type="button"
                        onClick={handleRemoveProfileEmail}
                        className="text-[11px] text-red-400 hover:text-red-300 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Attach an email to enable password recovery and account reset in case you forget your password.
                    </p>
                    {!showAttachEmailForm ? (
                      <button
                        type="button"
                        onClick={() => setShowAttachEmailForm(true)}
                        className="mt-2 text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 hover:underline"
                      >
                        + Attach an Email Now
                      </button>
                    ) : null}
                  </div>
                )}

                {/* Inline form to attach / update email */}
                {showAttachEmailForm && (
                  <form onSubmit={handleSaveProfileEmail} className="pt-2 border-t border-neutral-800/80 space-y-2">
                    {profileEmailError && (
                      <div className="p-2 rounded bg-red-950/50 border border-red-800 text-red-300 text-[11px] flex items-center gap-1.5">
                        <AlertCircle size={12} className="shrink-0" />
                        <span>{profileEmailError}</span>
                      </div>
                    )}
                    <input
                      type="email"
                      required
                      value={profileEmailInput}
                      onChange={(e) => setProfileEmailInput(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
                      >
                        Save Email
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttachEmailForm(false);
                          setProfileEmailError('');
                        }}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {profileEmailSuccess && (
                  <p className="text-[11px] text-emerald-400">{profileEmailSuccess}</p>
                )}
              </div>

              {/* Google Connection Status */}
              <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Google Sign-In</span>
                  </div>
                  {profile.isGoogleLinked ? (
                    <span className="text-[10px] bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded">
                      Linked
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={googleLoading}
                      onClick={handleLinkGoogleFromProfile}
                      className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      {googleLoading && <Loader2 size={11} className="animate-spin" />}
                      Link Account
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">
                  {profile.isGoogleLinked
                    ? 'Your Google account is linked. You can log in automatically anytime using "Sign in with Google".'
                    : 'Link your Google account for one-click automatic login.'}
                </p>
              </div>
              {/* ADMIN / MOD PANEL */}
              {(userProfileData?.role === 'admin' || userProfileData?.role === 'mod') && (
                <div className="bg-amber-950/20 p-3.5 rounded-lg border border-amber-900/50 space-y-3 font-mono text-xs mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                      <Crown size={14} />
                      <span>{userProfileData.role === 'admin' ? 'Admin Panel' : 'Moderator Panel'}</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-[10px] text-neutral-400">Hide Glow</span>
                      <input 
                        type="checkbox" 
                        checked={userProfileData.adminGlowHidden || false}
                        onChange={(e) => userService.toggleAdminGlow(e.target.checked)}
                        className="accent-amber-500 rounded bg-neutral-900 border-neutral-700"
                      />
                    </label>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-[10px] text-neutral-400">Grant actions to a player by username:</p>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Username"
                        value={adminTargetUser}
                        onChange={(e) => setAdminTargetUser(e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-amber-500"
                      />
                      <input 
                        type="number"
                        placeholder="Amount"
                        value={adminGrantAmount}
                        onChange={(e) => setAdminGrantAmount(parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={async () => {
                          setAdminActionError('');
                          setAdminActionSuccess('');
                          if (!adminTargetUser) return setAdminActionError('Enter username');
                          try {
                            const target = await userService.findUserByUsername(adminTargetUser.trim());
                            if (!target) return setAdminActionError('User not found');
                            
                            if (userProfileData.role === 'admin') {
                              await userService.adminGrantActions(target.uid, adminGrantAmount);
                            } else {
                              await userService.modGrantActions(target.uid, adminGrantAmount);
                            }
                            setAdminActionSuccess(`Granted ${adminGrantAmount} actions to ${target.username}`);
                          } catch(e: any) {
                            setAdminActionError(e.message);
                          }
                        }}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold"
                      >
                        Grant
                      </button>
                    </div>
                    {userProfileData.role === 'admin' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={async () => {
                            setAdminActionError('');
                            setAdminActionSuccess('');
                            if (!adminTargetUser) return setAdminActionError('Enter username');
                            try {
                              const target = await userService.findUserByUsername(adminTargetUser.trim());
                              if (!target) return setAdminActionError('User not found');
                              await userService.adminGrantActions(target.uid, 0, true);
                              setAdminActionSuccess(`Granted INFINITE actions to ${target.username}`);
                            } catch(e: any) {
                              setAdminActionError(e.message);
                            }
                          }}
                          className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold"
                        >
                          Grant Infinite
                        </button>
                        <button
                          onClick={async () => {
                            setAdminActionError('');
                            setAdminActionSuccess('');
                            if (!adminTargetUser) return setAdminActionError('Enter username');
                            try {
                              const target = await userService.findUserByUsername(adminTargetUser.trim());
                              if (!target) return setAdminActionError('User not found');
                              await userService.adminRevokeInfinite(target.uid);
                              setAdminActionSuccess(`Revoked INFINITE actions from ${target.username}`);
                            } catch(e: any) {
                              setAdminActionError(e.message);
                            }
                          }}
                          className="flex-1 px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 rounded text-[10px] font-bold"
                        >
                          Revoke Infinite
                        </button>
                      </div>
                    )}
                    
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={async () => {
                          setAdminActionError('');
                          setAdminActionSuccess('');
                          if (!adminTargetUser) return setAdminActionError('Enter username');
                          try {
                            const target = await userService.findUserByUsername(adminTargetUser.trim());
                            if (!target) return setAdminActionError('User not found');
                            await userService.grantPermanentPerks(target.uid, true, true);
                            setAdminActionSuccess(`Granted Community & Saves perks to ${target.username}`);
                          } catch(e: any) {
                            setAdminActionError(e.message);
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-800 rounded text-[10px] font-bold"
                      >
                        Grant Perks (Saves + Community)
                      </button>
                    </div>
                    
                    {userProfileData.role === 'admin' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={async () => {
                            setAdminActionError('');
                            setAdminActionSuccess('');
                            if (!adminTargetUser) return setAdminActionError('Enter username');
                            try {
                              const target = await userService.findUserByUsername(adminTargetUser.trim());
                              if (!target) return setAdminActionError('User not found');
                              await userService.adminSetRole(target.uid, 'mod');
                              setAdminActionSuccess(`Made ${target.username} a Mod`);
                            } catch(e: any) {
                              setAdminActionError(e.message);
                            }
                          }}
                          className="flex-1 px-3 py-1.5 bg-amber-900/50 hover:bg-amber-800 text-amber-200 border border-amber-800 rounded text-[10px] font-bold"
                        >
                          Make Mod
                        </button>
                        <button
                          onClick={async () => {
                            setAdminActionError('');
                            setAdminActionSuccess('');
                            if (!adminTargetUser) return setAdminActionError('Enter username');
                            try {
                              const target = await userService.findUserByUsername(adminTargetUser.trim());
                              if (!target) return setAdminActionError('User not found');
                              await userService.adminSetRole(target.uid, 'user');
                              setAdminActionSuccess(`Demoted ${target.username} to User`);
                            } catch(e: any) {
                              setAdminActionError(e.message);
                            }
                          }}
                          className="flex-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 rounded text-[10px]"
                        >
                          Demote
                        </button>
                      </div>
                    )}
                    
                    {adminActionError && <p className="text-[10px] text-red-400">{adminActionError}</p>}
                    {adminActionSuccess && <p className="text-[10px] text-emerald-400">{adminActionSuccess}</p>}
                  </div>
                </div>
              )}


              <div className="flex flex-col gap-2.5 pt-2">
                {onResetData && (
                  <button
                    type="button"
                    onClick={onResetData}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded font-mono transition-colors border border-neutral-700"
                  >
                    <RefreshCw size={14} />
                    Reset Adventure Data
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs rounded font-mono transition-colors border border-red-800/50"
                >
                  <LogOut size={14} />
                  Log Out (Switch to Guest)
                </button>
              </div>
            </div>
          )}

          {/* GUEST / NON-LOGGED IN TABS */}
          {session.type !== 'registered' && (
            <div>
              {/* Navigation Tabs */}
              {tab !== 'recovery' && tab !== 'google-signup' && (
                <div className="flex border-b border-neutral-800 bg-neutral-950/80 text-xs font-mono">
                  <button
                    onClick={() => setTab('login')}
                    className={`flex-1 py-2.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                      tab === 'login'
                        ? 'border-blue-500 text-blue-400 bg-neutral-900 font-semibold'
                        : 'border-transparent text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <LogIn size={13} />
                    Log In
                  </button>
                  <button
                    onClick={() => setTab('signup')}
                    className={`flex-1 py-2.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                      tab === 'signup'
                        ? 'border-blue-500 text-blue-400 bg-neutral-900 font-semibold'
                        : 'border-transparent text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <UserPlus size={13} />
                    Sign Up
                  </button>
                  <button
                    onClick={() => setTab('guest')}
                    className={`flex-1 py-2.5 px-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                      tab === 'guest'
                        ? 'border-blue-500 text-blue-400 bg-neutral-900 font-semibold'
                        : 'border-transparent text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <User size={13} />
                    Guest Profile
                  </button>
                </div>
              )}

              {/* TAB: LOGIN */}
              {tab === 'login' && (
                <div className="p-5 space-y-4 font-mono text-xs">
                  {loginError && (
                    <div className="p-2.5 rounded bg-red-950/50 border border-red-800 text-red-300 flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}
                  {loginSuccess && (
                    <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 flex items-center gap-2">
                      <Check size={14} className="shrink-0" />
                      <span>{loginSuccess}</span>
                    </div>
                  )}

                  {unauthorizedDomainInfo && (
                    <div className="p-3.5 bg-amber-950/50 border border-amber-800 rounded-xl text-amber-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-amber-300 font-bold">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>Firebase Domain Authorization Needed</span>
                      </div>
                      <p className="text-neutral-300 font-sans text-[11px] leading-relaxed">
                        To enable Google Sign-In on <strong>https://www.aifinity-rpg.com/</strong>, add <strong>www.aifinity-rpg.com</strong> and <strong>aifinity-rpg.com</strong> to Authorized Domains in your Firebase project (<code>gen-lang-client-0320558179</code>).
                      </p>
                      <div className="pt-1">
                        <a
                          href={unauthorizedDomainInfo.consoleUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-[11px] inline-flex items-center gap-1.5 transition-colors font-sans"
                        >
                          <span>Open Firebase Console Settings</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                      <p className="text-[10px] text-neutral-400 font-sans">
                        You can also create an account with a Username &amp; Password below right now!
                      </p>
                    </div>
                  )}

                  {/* Google Login One-Click Button via Firebase */}
                  <button
                    type="button"
                    disabled={googleLoading}
                    onClick={handleTriggerGoogleAuth}
                    className="w-full py-2.5 px-3 bg-neutral-950 hover:bg-neutral-800 disabled:opacity-60 border border-neutral-700 hover:border-neutral-600 rounded text-white font-sans font-medium flex items-center justify-center gap-2.5 transition-colors shadow-sm text-xs"
                  >
                    {googleLoading ? (
                      <Loader2 size={16} className="animate-spin text-blue-400" />
                    ) : (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                    )}
                    <span>{googleLoading ? 'Opening Google Sign-In...' : 'Sign in with Google'}</span>
                  </button>

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-neutral-800" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase">
                      <span className="bg-neutral-900 px-2 text-neutral-500 font-mono">or log in with password</span>
                    </div>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-neutral-400 mb-1">Username or Attached Email</label>
                      <input
                        type="text"
                        required
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        placeholder="Enter username or attached email"
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-neutral-400">Password</label>
                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryIdentifier(loginIdentifier);
                            setRecoveryError('');
                            setRecoverySuccess('');
                            setTab('recovery');
                          }}
                          className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors flex items-center justify-center gap-2 text-xs"
                    >
                      <LogIn size={14} />
                      Log In to Account
                    </button>
                  </form>

                  <div className="pt-2 text-center text-[11px] text-neutral-400">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setTab('signup')}
                      className="text-blue-400 hover:underline font-semibold"
                    >
                      Sign Up here
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: SIGN UP */}
              {tab === 'signup' && (
                <div className="p-5 space-y-4 font-mono text-xs">
                  {signupError && (
                    <div className="p-2.5 rounded bg-red-950/50 border border-red-800 text-red-300 flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{signupError}</span>
                    </div>
                  )}
                  {signupSuccess && (
                    <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 flex items-center gap-2">
                      <Check size={14} className="shrink-0" />
                      <span>{signupSuccess}</span>
                    </div>
                  )}

                  {unauthorizedDomainInfo && (
                    <div className="p-3.5 bg-amber-950/50 border border-amber-800 rounded-xl text-amber-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-amber-300 font-bold">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>Firebase Domain Authorization Needed</span>
                      </div>
                      <p className="text-neutral-300 font-sans text-[11px] leading-relaxed">
                        To enable Google Sign-In on <strong>https://www.aifinity-rpg.com/</strong>, add <strong>www.aifinity-rpg.com</strong> and <strong>aifinity-rpg.com</strong> to Authorized Domains in your Firebase project (<code>gen-lang-client-0320558179</code>).
                      </p>
                      <div className="pt-1">
                        <a
                          href={unauthorizedDomainInfo.consoleUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-[11px] inline-flex items-center gap-1.5 transition-colors font-sans"
                        >
                          <span>Open Firebase Console Settings</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                      <p className="text-[10px] text-neutral-400 font-sans">
                        Or choose your username &amp; password below to create an account immediately!
                      </p>
                    </div>
                  )}

                  {/* Sign up with Google via Firebase */}
                  <button
                    type="button"
                    disabled={googleLoading}
                    onClick={handleTriggerGoogleAuth}
                    className="w-full py-2.5 px-3 bg-neutral-950 hover:bg-neutral-800 disabled:opacity-60 border border-neutral-700 hover:border-neutral-600 rounded text-white font-sans font-medium flex items-center justify-center gap-2.5 transition-colors shadow-sm text-xs"
                  >
                    {googleLoading ? (
                      <Loader2 size={16} className="animate-spin text-blue-400" />
                    ) : (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                    )}
                    <span>{googleLoading ? 'Opening Google Sign-In...' : 'Sign up with Google'}</span>
                  </button>

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-neutral-800" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase">
                      <span className="bg-neutral-900 px-2 text-neutral-500 font-mono">or choose username</span>
                    </div>
                  </div>

                  <form onSubmit={handleSignup} className="space-y-3.5">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-neutral-400">Choose Username</label>
                        <button
                          type="button"
                          onClick={handleAutofillRandom}
                          className="text-blue-400 hover:text-blue-300 text-[11px] flex items-center gap-1 hover:underline"
                          title="Autofill a random unique username"
                        >
                          <Sparkles size={11} className="text-amber-400" />
                          Autofill Random
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={signupUsername}
                        onChange={(e) => setSignupUsername(e.target.value)}
                        placeholder="e.g. GoldenTable86, HowlingKnight"
                        className={`w-full px-3 py-2 bg-neutral-950 border rounded text-white focus:outline-none ${
                          usernameCheck
                            ? usernameCheck.valid
                              ? 'border-emerald-500'
                              : 'border-red-500'
                            : 'border-neutral-700 focus:border-blue-500'
                        }`}
                      />
                      {usernameCheck && !usernameCheck.valid && (
                        <p className="text-red-400 text-[10px] mt-1">{usernameCheck.error}</p>
                      )}
                      <p className="text-[10px] text-neutral-500 mt-1">
                        Rule: 2-20 characters, letters & numbers only, not taken yet.
                      </p>
                    </div>

                    {/* Optional Email Attachment */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-neutral-400 flex items-center gap-1">
                          <Mail size={12} className="text-blue-400" />
                          Recovery Email
                        </label>
                        <span className="text-[10px] text-neutral-500 font-mono">Optional</span>
                      </div>
                      <input
                        type="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        placeholder="you@example.com (optional)"
                        className={`w-full px-3 py-2 bg-neutral-950 border rounded text-white focus:outline-none ${
                          signupEmail.trim()
                            ? emailCheck?.valid && !emailTakenCheck
                              ? 'border-emerald-500'
                              : 'border-red-500'
                            : 'border-neutral-700 focus:border-blue-500'
                        }`}
                      />
                      {signupEmail.trim() && !emailCheck?.valid && (
                        <p className="text-red-400 text-[10px] mt-1">{emailCheck?.error}</p>
                      )}
                      {signupEmail.trim() && emailTakenCheck && (
                        <p className="text-red-400 text-[10px] mt-1">This email is already attached to another account.</p>
                      )}
                      <p className="text-[10px] text-neutral-500 mt-1">
                        Attach an email to enable password reset and recovery if you forget your password.
                      </p>
                    </div>

                    <div>
                      <label className="block text-neutral-400 mb-1">Password</label>
                      <input
                        type="password"
                        required
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="At least 4 characters"
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-neutral-400 mb-1">Confirm Password</label>
                      <input
                        type="password"
                        required
                        value={signupConfirm}
                        onChange={(e) => setSignupConfirm(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={(usernameCheck !== null && !usernameCheck.valid) || (signupEmail.trim() ? (!emailCheck?.valid || emailTakenCheck) : false)}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded transition-colors flex items-center justify-center gap-2 text-xs"
                    >
                      <UserPlus size={14} />
                      Create Account
                    </button>
                  </form>

                  <div className="pt-2 text-center text-[11px] text-neutral-400">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setTab('login')}
                      className="text-blue-400 hover:underline font-semibold"
                    >
                      Log In
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: GOOGLE SIGN UP COMPLETION (Requires manual password setup) */}
              {tab === 'google-signup' && (
                <div className="p-5 space-y-4 font-mono text-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setTab('signup')}
                      className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <div>
                      <h3 className="font-bold text-white text-xs">Complete Google Sign Up</h3>
                      <p className="text-[11px] text-neutral-400">Set up your password to finish creating your account</p>
                    </div>
                  </div>

                  {googleSignupError && (
                    <div className="p-2.5 rounded bg-red-950/50 border border-red-800 text-red-300 flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{googleSignupError}</span>
                    </div>
                  )}
                  {googleSignupSuccess && (
                    <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 flex items-center gap-2">
                      <Check size={14} className="shrink-0" />
                      <span>{googleSignupSuccess}</span>
                    </div>
                  )}

                  {/* Google Verified Account Badge */}
                  <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center gap-2.5">
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white font-bold truncate">{googleSignupEmail}</span>
                        <span className="text-[10px] bg-emerald-950 border border-emerald-800 text-emerald-300 px-1 py-0.2 rounded">
                          Verified
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400">Attached automatically for recovery & Google logins</p>
                    </div>
                  </div>

                  <form onSubmit={handleGoogleSignupSubmit} className="space-y-3.5">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-neutral-400">Choose Username</label>
                        <button
                          type="button"
                          onClick={handleAutofillGoogleRandom}
                          className="text-blue-400 hover:text-blue-300 text-[11px] flex items-center gap-1 hover:underline"
                        >
                          <Sparkles size={11} className="text-amber-400" />
                          Autofill Random
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={googleSignupUsername}
                        onChange={(e) => setGoogleSignupUsername(e.target.value)}
                        placeholder="e.g. GoldenTable86"
                        className={`w-full px-3 py-2 bg-neutral-950 border rounded text-white focus:outline-none ${
                          googleUsernameCheck
                            ? googleUsernameCheck.valid
                              ? 'border-emerald-500'
                              : 'border-red-500'
                            : 'border-neutral-700 focus:border-blue-500'
                        }`}
                      />
                      {googleUsernameCheck && !googleUsernameCheck.valid && (
                        <p className="text-red-400 text-[10px] mt-1">{googleUsernameCheck.error}</p>
                      )}
                    </div>

                    <div className="p-2.5 rounded bg-blue-950/40 border border-blue-800/60 text-blue-300 text-[11px] leading-relaxed">
                      💡 <strong>Password Requirement:</strong> When signing up with Google, please set up your account password manually below so you can also log in anytime with username and password.
                    </div>

                    <div>
                      <label className="block text-neutral-400 mb-1">Set Account Password Manually</label>
                      <input
                        type="password"
                        required
                        value={googleSignupPassword}
                        onChange={(e) => setGoogleSignupPassword(e.target.value)}
                        placeholder="At least 4 characters"
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-neutral-400 mb-1">Confirm Password</label>
                      <input
                        type="password"
                        required
                        value={googleSignupConfirm}
                        onChange={(e) => setGoogleSignupConfirm(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={googleUsernameCheck !== null && !googleUsernameCheck.valid}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded transition-colors flex items-center justify-center gap-2 text-xs"
                    >
                      <Check size={14} />
                      Complete Sign Up
                    </button>
                  </form>
                </div>
              )}

              {/* TAB: PASSWORD RECOVERY / RESET */}
              {tab === 'recovery' && (
                <div className="p-5 space-y-4 font-mono text-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        setRecoveryError('');
                        setRecoverySuccess('');
                        setRecoveryStage('request');
                      }}
                      className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <div>
                      <h3 className="font-bold text-white text-xs">Account Recovery & Reset</h3>
                      <p className="text-[11px] text-neutral-400">Reset your password using your attached email</p>
                    </div>
                  </div>

                  {recoveryError && (
                    <div className="p-2.5 rounded bg-red-950/50 border border-red-800 text-red-300 flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{recoveryError}</span>
                    </div>
                  )}
                  {recoverySuccess && (
                    <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 flex items-center gap-2">
                      <Check size={14} className="shrink-0" />
                      <span>{recoverySuccess}</span>
                    </div>
                  )}

                  {/* Simulation Notification / Code Banner */}
                  {generatedCodeNotice && (
                    <div className="p-3 bg-blue-950/60 border border-blue-700/60 rounded-lg text-neutral-200 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-blue-300 font-bold flex items-center gap-1">
                          <Mail size={12} /> Email Dispatched to: {generatedCodeNotice.email}
                        </span>
                        <span className="text-[10px] text-neutral-400">Valid 15m</span>
                      </div>
                      <div className="flex items-center justify-between bg-neutral-950 p-2 rounded border border-neutral-800">
                        <span className="text-sm font-bold tracking-widest text-cyan-300">
                          {generatedCodeNotice.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryCodeInput(generatedCodeNotice.code);
                          }}
                          className="px-2 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-[10px] rounded flex items-center gap-1 font-mono"
                        >
                          <Copy size={11} /> Auto-fill
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Stage 1: Request Code */}
                  {recoveryStage === 'request' && (
                    <form onSubmit={handleRequestRecovery} className="space-y-4">
                      <div>
                        <label className="block text-neutral-400 mb-1">Username or Attached Email</label>
                        <input
                          type="text"
                          required
                          value={recoveryIdentifier}
                          onChange={(e) => setRecoveryIdentifier(e.target.value)}
                          placeholder="e.g. GoldenTable86 or you@example.com"
                          className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                        />
                        <p className="text-[10px] text-neutral-500 mt-1">
                          We will verify that this account has a recovery email attached and send a 6-digit code.
                        </p>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors flex items-center justify-center gap-2 text-xs"
                      >
                        <Mail size={14} />
                        Send Recovery Code
                      </button>
                    </form>
                  )}

                  {/* Stage 2: Enter Code & New Password */}
                  {recoveryStage === 'reset' && (
                    <form onSubmit={handleResetPassword} className="space-y-3.5">
                      <div>
                        <label className="block text-neutral-400 mb-1">6-Digit Verification Code</label>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={recoveryCodeInput}
                          onChange={(e) => setRecoveryCodeInput(e.target.value.trim())}
                          placeholder="123456"
                          className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white text-center tracking-widest text-sm font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">New Password</label>
                        <input
                          type="password"
                          required
                          value={recoveryNewPassword}
                          onChange={(e) => setRecoveryNewPassword(e.target.value)}
                          placeholder="At least 4 characters"
                          className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Confirm New Password</label>
                        <input
                          type="password"
                          required
                          value={recoveryConfirmPassword}
                          onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition-colors flex items-center justify-center gap-2 text-xs"
                      >
                        <KeyRound size={14} />
                        Reset Password & Return to Login
                      </button>

                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => setRecoveryStage('request')}
                          className="text-[11px] text-neutral-400 hover:text-white hover:underline"
                        >
                          Request a different code
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* TAB: GUEST PROFILE */}
              {tab === 'guest' && (
                <div className="p-5 space-y-4 font-mono text-xs">
                  {guestError && (
                    <div className="p-2.5 rounded bg-red-950/50 border border-red-800 text-red-300 flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{guestError}</span>
                    </div>
                  )}
                  {guestSuccess && (
                    <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 flex items-center gap-2">
                      <Check size={14} className="shrink-0" />
                      <span>{guestSuccess}</span>
                    </div>
                  )}

                  <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Current Status:</span>
                      <span className="text-amber-400 font-bold">Guest Player</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">In Singleplayer:</span>
                      <span className="text-white font-bold">{singleName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">In Multiplayer:</span>
                      <span className="text-cyan-300 font-bold">{multiName}</span>
                    </div>
                  </div>

                  <form onSubmit={handleSaveGuestName} className="space-y-3">
                    <div>
                      <label className="block text-neutral-400 mb-1">Set Temporary Guest Name</label>
                      <input
                        type="text"
                        value={guestInput}
                        onChange={(e) => setGuestInput(e.target.value)}
                        placeholder="e.g. Rogue, Shadow, Nomad"
                        className={`w-full px-3 py-2 bg-neutral-950 border rounded text-white focus:outline-none ${
                          guestCheck
                            ? guestCheck.valid
                              ? 'border-emerald-500'
                              : 'border-red-500'
                            : 'border-neutral-700 focus:border-blue-500'
                        }`}
                      />
                      {guestCheck && !guestCheck.valid && (
                        <p className="text-red-400 text-[10px] mt-1">{guestCheck.error}</p>
                      )}
                      {guestInput.trim() && guestCheck?.valid && (
                        <p className="text-emerald-400 text-[10px] mt-1">
                          Will appear as: <span className="font-bold">{guestInput.trim()} (Guest)</span>
                        </p>
                      )}
                      <p className="text-[10px] text-neutral-500 mt-1">
                        Note: Guest names can't match any other active guest (even offline) or registered account.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={!guestInput.trim() || (guestCheck !== null && !guestCheck.valid)}
                        className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded transition-colors text-xs"
                      >
                        Save Guest Name
                      </button>
                      {session.guestName && (
                        <button
                          type="button"
                          onClick={handleClearGuestName}
                          className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors text-xs"
                          title="Clear custom guest name"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </form>

                  <div className="pt-2 border-t border-neutral-800 text-center">
                    <p className="text-[11px] text-neutral-400 mb-2">Want a permanent name and account?</p>
                    <button
                      type="button"
                      onClick={() => setTab('signup')}
                      className="text-blue-400 hover:underline font-semibold text-xs"
                    >
                      Create a Free Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
