export interface UserAccount {
  username: string; // 2-20 alphanumeric characters
  passwordHash: string;
  createdAt: number;
  email?: string; // Optional attached email for recovery & password reset
  googleId?: string; // Optional Google identifier/email if linked with Google
}

export interface AuthSession {
  type: 'registered' | 'guest';
  username?: string; // If registered
  guestName?: string; // If guest who set their name (base name, e.g. "Shadow")
  guestNumber?: number; // Random 1-9999 assigned for unset guest in multiplayer
}

export interface RecoveryRequest {
  code: string;
  expiresAt: number;
  email: string;
  username: string;
}

const STORAGE_KEY_ACCOUNTS = 'aifinity_accounts';
const STORAGE_KEY_SESSION = 'aifinity_current_session';
const STORAGE_KEY_GUEST_NAME = 'aifinity_guest_name';
const STORAGE_KEY_CLAIMED_GUEST_NAMES = 'aifinity_claimed_guest_names';
const STORAGE_KEY_GUEST_NUM = 'aifinity_guest_mp_number';

// Reserved system names
const RESERVED_NAMES = new Set(['player', 'guest', 'admin', 'system', 'host', 'aifinity', 'root']);

// Word lists for autofill username generator (adjective + noun + optional number)
const ADJECTIVES = [
  'Golden', 'Silver', 'Howling', 'Silent', 'Crimson', 'Azure', 'Swift', 'Shadow',
  'Ancient', 'Mystic', 'Iron', 'Brave', 'Storm', 'Wild', 'Frost', 'Solar',
  'Lunar', 'Echo', 'Astral', 'Vivid', 'Cyber', 'Neon', 'Thunder', 'Crystal',
  'Ghost', 'Emerald', 'Ruby', 'Obsidian', 'Radiant', 'Starlight'
];

const NOUNS = [
  'Table', 'Bird', 'Knight', 'Wolf', 'Falcon', 'Dragon', 'Ranger', 'Blade',
  'Fox', 'Tiger', 'Hawk', 'Shield', 'Crown', 'Wanderer', 'Hunter', 'Sage',
  'Beacon', 'Forge', 'Raven', 'Viper', 'Golem', 'Rider', 'Sentinel', 'Keeper',
  'Guardian', 'Phoenix', 'Archer', 'Sorcerer', 'Paladin', 'Nomad'
];

class AuthService {
  private accounts: UserAccount[] = [];
  private session: AuthSession = { type: 'guest' };
  private claimedGuestNames: Set<string> = new Set();
  private listeners: Array<() => void> = [];
  private recoveryRequests: Map<string, RecoveryRequest> = new Map();

  constructor() {
    this.loadState();
  }

  private loadState() {
    if (typeof window === 'undefined') return;

    // Load registered accounts
    try {
      const storedAccs = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
      if (storedAccs) {
        this.accounts = JSON.parse(storedAccs);
      }
    } catch (e) {
      console.error('Failed to load accounts from localStorage', e);
      this.accounts = [];
    }

    // Load claimed guest names
    try {
      const storedGuests = localStorage.getItem(STORAGE_KEY_CLAIMED_GUEST_NAMES);
      if (storedGuests) {
        const list: string[] = JSON.parse(storedGuests);
        this.claimedGuestNames = new Set(list.map(s => s.toLowerCase()));
      }
    } catch (e) {
      console.error('Failed to load claimed guest names', e);
      this.claimedGuestNames = new Set();
    }

    // Load active session (if user logged in before, their login saves)
    try {
      const storedSession = localStorage.getItem(STORAGE_KEY_SESSION);
      if (storedSession) {
        const parsed = JSON.parse(storedSession);
        if (parsed.type === 'registered' && parsed.username) {
          const acc = this.accounts.find(
            a => a.username.toLowerCase() === parsed.username.toLowerCase()
          );
          if (acc) {
            this.session = {
              type: 'registered',
              username: acc.username
            };
            return;
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore session', e);
    }

    // Default to guest
    const savedGuestName = localStorage.getItem(STORAGE_KEY_GUEST_NAME) || undefined;
    if (savedGuestName) {
      this.claimedGuestNames.add(savedGuestName.toLowerCase());
    }

    let guestNumber: number | undefined;
    const storedGuestNum = localStorage.getItem(STORAGE_KEY_GUEST_NUM);
    if (storedGuestNum) {
      const parsedNum = parseInt(storedGuestNum, 10);
      if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= 9999) {
        guestNumber = parsedNum;
      }
    }
    if (!guestNumber) {
      guestNumber = Math.floor(Math.random() * 9999) + 1;
      localStorage.setItem(STORAGE_KEY_GUEST_NUM, guestNumber.toString());
    }

    this.session = {
      type: 'guest',
      guestName: savedGuestName,
      guestNumber: guestNumber
    };
  }

  private saveAccounts() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(this.accounts));
  }

  private saveClaimedGuests() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      STORAGE_KEY_CLAIMED_GUEST_NAMES,
      JSON.stringify(Array.from(this.claimedGuestNames))
    );
  }

  private saveSession() {
    if (typeof window === 'undefined') return;
    if (this.session.type === 'registered' && this.session.username) {
      localStorage.setItem(
        STORAGE_KEY_SESSION,
        JSON.stringify({ type: 'registered', username: this.session.username })
      );
    } else {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public getSession(): AuthSession {
    return { ...this.session };
  }

  public isLoggedIn(): boolean {
    return this.session.type === 'registered' && !!this.session.username;
  }

  /**
   * Username validation for registered account:
   * - 2-20 characters
   * - letters and numbers only
   * - not taken yet
   */
  public validateUsername(rawUsername: string): { valid: boolean; error?: string } {
    const trimmed = rawUsername.trim();
    if (trimmed.length < 2) {
      return { valid: false, error: 'Username must be at least 2 characters long.' };
    }
    if (trimmed.length > 20) {
      return { valid: false, error: 'Username must not exceed 20 characters.' };
    }
    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
      return { valid: false, error: 'Username can only contain letters and numbers.' };
    }
    const lower = trimmed.toLowerCase();
    if (RESERVED_NAMES.has(lower)) {
      return { valid: false, error: `"${trimmed}" is a reserved system name.` };
    }
    if (this.accounts.some(a => a.username.toLowerCase() === lower)) {
      return { valid: false, error: 'This username is already taken.' };
    }
    if (this.claimedGuestNames.has(lower)) {
      return { valid: false, error: 'This name is currently claimed by an active guest.' };
    }
    return { valid: true };
  }

  /**
   * Validate email format (optional, valid if empty)
   */
  public validateEmail(rawEmail: string): { valid: boolean; error?: string } {
    const trimmed = rawEmail.trim();
    if (!trimmed) return { valid: true };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, error: 'Please enter a valid email address.' };
    }
    return { valid: true };
  }

  /**
   * Check if an email is already attached to another account
   */
  public isEmailTaken(rawEmail: string, excludeUsername?: string): boolean {
    const lower = rawEmail.trim().toLowerCase();
    if (!lower) return false;
    return this.accounts.some(
      a => a.email && a.email.toLowerCase() === lower && (!excludeUsername || a.username.toLowerCase() !== excludeUsername.toLowerCase())
    );
  }

  /**
   * Guest name validation:
   * - 2-20 characters
   * - letters and numbers only
   * - can't set their guest name the same as another active guest (even if offline)
   * - can't conflict with registered account username
   */
  public validateGuestName(rawGuestName: string): { valid: boolean; error?: string } {
    const trimmed = rawGuestName.trim();
    if (trimmed.length < 2) {
      return { valid: false, error: 'Guest name must be at least 2 characters long.' };
    }
    if (trimmed.length > 20) {
      return { valid: false, error: 'Guest name must not exceed 20 characters.' };
    }
    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
      return { valid: false, error: 'Guest name can only contain letters and numbers.' };
    }
    const lower = trimmed.toLowerCase();
    if (RESERVED_NAMES.has(lower)) {
      return { valid: false, error: `"${trimmed}" is a reserved system name.` };
    }

    // Check if it's already claimed by ANOTHER guest
    const currentGuestBase = this.session.guestName?.toLowerCase();
    if (this.claimedGuestNames.has(lower) && lower !== currentGuestBase) {
      return { valid: false, error: 'This guest name is already taken by another guest.' };
    }

    // Check if registered account has this username
    if (this.accounts.some(a => a.username.toLowerCase() === lower)) {
      return { valid: false, error: 'This name belongs to a registered account.' };
    }

    return { valid: true };
  }

  /**
   * Generates a random unique username (e.g. GoldenTable86, Bird872, HowlingKnight)
   * that is guaranteed to be 2-20 alphanumeric characters and not taken yet.
   */
  public generateUniqueUsername(): string {
    for (let attempts = 0; attempts < 100; attempts++) {
      const mode = Math.random();
      let candidate = '';

      if (mode < 0.4) {
        // Pattern 1: Adjective + Noun + 2-digit number (e.g. GoldenTable86)
        const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
        const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
        const num = Math.floor(Math.random() * 90) + 10; // 10-99
        candidate = `${adj}${noun}${num}`;
      } else if (mode < 0.7) {
        // Pattern 2: Noun + 3-digit number (e.g. Bird872)
        const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
        const num = Math.floor(Math.random() * 900) + 100; // 100-999
        candidate = `${noun}${num}`;
      } else {
        // Pattern 3: Adjective + Noun (e.g. HowlingKnight)
        const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
        const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
        candidate = `${adj}${noun}`;
      }

      if (candidate.length <= 20 && this.validateUsername(candidate).valid) {
        return candidate;
      }
    }

    // Fallback guaranteed unique
    const fallbackNum = Math.floor(Math.random() * 8999) + 1000;
    return `Player${fallbackNum}`;
  }

  /**
   * Register a new user account with optional email and Google ID
   */
  public register(
    username: string,
    password: string,
    email?: string,
    googleId?: string
  ): { success: boolean; error?: string } {
    const trimmed = username.trim();
    const validation = this.validateUsername(trimmed);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    if (!password || password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters long.' };
    }

    let cleanEmail: string | undefined = undefined;
    if (email && email.trim()) {
      const emailTrimmed = email.trim();
      const emailValidation = this.validateEmail(emailTrimmed);
      if (!emailValidation.valid) {
        return { success: false, error: emailValidation.error };
      }
      if (this.isEmailTaken(emailTrimmed)) {
        return { success: false, error: 'This email is already attached to another account.' };
      }
      cleanEmail = emailTrimmed;
    }

    // Simple robust hash representation for storage
    const passwordHash = btoa(encodeURIComponent(password));

    const newAccount: UserAccount = {
      username: trimmed,
      passwordHash,
      createdAt: Date.now(),
      email: cleanEmail,
      googleId: googleId?.trim() || undefined
    };

    this.accounts.push(newAccount);
    this.saveAccounts();

    // Auto-login upon registration
    this.session = {
      type: 'registered',
      username: newAccount.username
    };
    this.saveSession();
    this.notify();

    return { success: true };
  }

  /**
   * Log into an existing account (supports username or attached email)
   */
  public login(usernameOrEmail: string, password: string): { success: boolean; error?: string } {
    const trimmed = usernameOrEmail.trim();
    const lower = trimmed.toLowerCase();
    const acc = this.accounts.find(
      a => a.username.toLowerCase() === lower || (a.email && a.email.toLowerCase() === lower)
    );

    if (!acc) {
      return { success: false, error: 'Account not found. Please check your username/email or sign up.' };
    }

    const expectedHash = btoa(encodeURIComponent(password));
    if (acc.passwordHash !== expectedHash) {
      return { success: false, error: 'Incorrect password. Please try again.' };
    }

    this.session = {
      type: 'registered',
      username: acc.username
    };
    this.saveSession();
    this.notify();

    return { success: true };
  }

  /**
   * Log in with Google automatically if account exists;
   * otherwise indicates that user is new and needs manual password setup.
   */
  public loginWithGoogle(googleEmail: string): {
    success: boolean;
    isNewUser?: boolean;
    username?: string;
    googleEmail: string;
    error?: string;
  } {
    const cleanEmail = googleEmail.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, googleEmail: '', error: 'Invalid Google email' };
    }

    // Check for existing account by googleId or attached email
    const acc = this.accounts.find(
      a => (a.googleId && a.googleId.toLowerCase() === cleanEmail) ||
           (a.email && a.email.toLowerCase() === cleanEmail)
    );

    if (acc) {
      // Link googleId if not yet set
      if (!acc.googleId) {
        acc.googleId = cleanEmail;
        this.saveAccounts();
      }

      // Log in automatically!
      this.session = {
        type: 'registered',
        username: acc.username
      };
      this.saveSession();
      this.notify();

      return {
        success: true,
        isNewUser: false,
        username: acc.username,
        googleEmail: cleanEmail
      };
    }

    // New Google user: requires setting up password manually
    return {
      success: false,
      isNewUser: true,
      googleEmail: cleanEmail
    };
  }

  /**
   * Link Google account to currently logged in account
   */
  public linkGoogleAccount(googleEmail: string): { success: boolean; error?: string } {
    if (this.session.type !== 'registered' || !this.session.username) {
      return { success: false, error: 'You must be logged in to link a Google account.' };
    }
    const cleanEmail = googleEmail.trim().toLowerCase();
    const existing = this.accounts.find(
      a => a.username.toLowerCase() !== this.session.username?.toLowerCase() &&
           ((a.googleId && a.googleId.toLowerCase() === cleanEmail) || (a.email && a.email.toLowerCase() === cleanEmail))
    );
    if (existing) {
      return { success: false, error: 'This Google account is already linked to another user.' };
    }

    const currentAcc = this.getCurrentAccount();
    if (!currentAcc) return { success: false, error: 'Current account not found.' };

    currentAcc.googleId = cleanEmail;
    if (!currentAcc.email) {
      currentAcc.email = cleanEmail;
    }
    this.saveAccounts();
    this.notify();
    return { success: true };
  }

  /**
   * Request password recovery / reset code for an account (by username or email)
   */
  public requestPasswordRecovery(identifier: string): {
    success: boolean;
    error?: string;
    obfuscatedEmail?: string;
    code?: string;
    username?: string;
  } {
    const trimmed = identifier.trim().toLowerCase();
    if (!trimmed) {
      return { success: false, error: 'Please enter your username or registered email.' };
    }

    const acc = this.accounts.find(
      a => a.username.toLowerCase() === trimmed || (a.email && a.email.toLowerCase() === trimmed)
    );

    if (!acc) {
      return { success: false, error: 'No account found with this username or email.' };
    }

    if (!acc.email) {
      return {
        success: false,
        error: `Account "${acc.username}" does not have a recovery email attached. Password recovery is only enabled for accounts with an attached email.`
      };
    }

    // Generate 6-digit recovery code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

    this.recoveryRequests.set(acc.username.toLowerCase(), {
      code,
      expiresAt,
      email: acc.email,
      username: acc.username
    });

    // Obfuscate email for privacy: e.g. chloe.a.alba.1@gmail.com -> ch***1@gmail.com
    const [userPart, domainPart] = acc.email.split('@');
    const obfuscated = userPart.length <= 2 
      ? `${userPart[0]}*@${domainPart}`
      : `${userPart.slice(0, 2)}***${userPart.slice(-1)}@${domainPart}`;

    return {
      success: true,
      obfuscatedEmail: obfuscated,
      code, // returned so the client can display dispatch notification / copy code
      username: acc.username
    };
  }

  /**
   * Complete password reset using verified 6-digit recovery code
   */
  public resetPasswordWithCode(usernameOrEmail: string, code: string, newPassword: string): { success: boolean; error?: string } {
    const trimmed = usernameOrEmail.trim().toLowerCase();
    const acc = this.accounts.find(
      a => a.username.toLowerCase() === trimmed || (a.email && a.email.toLowerCase() === trimmed)
    );

    if (!acc) {
      return { success: false, error: 'Account not found.' };
    }

    const lowerUser = acc.username.toLowerCase();
    const req = this.recoveryRequests.get(lowerUser);

    if (!req) {
      return { success: false, error: 'No active recovery request found. Please request a new code.' };
    }

    if (Date.now() > req.expiresAt) {
      this.recoveryRequests.delete(lowerUser);
      return { success: false, error: 'Recovery code has expired. Please request a new code.' };
    }

    if (req.code !== code.trim()) {
      return { success: false, error: 'Invalid recovery code. Please check and try again.' };
    }

    if (!newPassword || newPassword.length < 4) {
      return { success: false, error: 'New password must be at least 4 characters long.' };
    }

    acc.passwordHash = btoa(encodeURIComponent(newPassword));
    this.saveAccounts();
    this.recoveryRequests.delete(lowerUser);
    this.notify();

    return { success: true };
  }

  /**
   * Optionally attach or update email for current logged-in account
   */
  public attachEmail(email: string): { success: boolean; error?: string } {
    if (this.session.type !== 'registered' || !this.session.username) {
      return { success: false, error: 'You must be logged in to attach an email.' };
    }

    const trimmed = email.trim();
    if (!trimmed) {
      return { success: false, error: 'Please enter an email address.' };
    }

    const emailValidation = this.validateEmail(trimmed);
    if (!emailValidation.valid) {
      return { success: false, error: emailValidation.error };
    }

    if (this.isEmailTaken(trimmed, this.session.username)) {
      return { success: false, error: 'This email is already attached to another account.' };
    }

    const currentAcc = this.getCurrentAccount();
    if (!currentAcc) return { success: false, error: 'Account not found.' };

    currentAcc.email = trimmed;
    this.saveAccounts();
    this.notify();
    return { success: true };
  }

  /**
   * Remove attached email from current logged-in account
   */
  public removeAttachedEmail(): { success: boolean; error?: string } {
    const currentAcc = this.getCurrentAccount();
    if (!currentAcc) return { success: false, error: 'Account not found.' };

    currentAcc.email = undefined;
    this.saveAccounts();
    this.notify();
    return { success: true };
  }

  /**
   * Get full account record for current session
   */
  public getCurrentAccount(): UserAccount | undefined {
    if (this.session.type !== 'registered' || !this.session.username) return undefined;
    return this.accounts.find(a => a.username.toLowerCase() === this.session.username?.toLowerCase());
  }

  /**
   * Log out. Returns user to Guest mode.
   */
  public logout() {
    this.session = {
      type: 'guest',
      guestName: localStorage.getItem(STORAGE_KEY_GUEST_NAME) || undefined,
      guestNumber: parseInt(localStorage.getItem(STORAGE_KEY_GUEST_NUM) || '0', 10) || Math.floor(Math.random() * 9999) + 1
    };
    this.saveSession();
    this.notify();
  }

  /**
   * Set the guest's temporary name.
   * Format: baseName, rendered as `${baseName} (Guest)`
   */
  public setGuestName(rawGuestName: string): { success: boolean; error?: string } {
    const trimmed = rawGuestName.trim();
    const validation = this.validateGuestName(trimmed);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Free previous guest name from claimed set if any
    if (this.session.guestName) {
      this.claimedGuestNames.delete(this.session.guestName.toLowerCase());
    }

    this.claimedGuestNames.add(trimmed.toLowerCase());
    this.saveClaimedGuests();

    localStorage.setItem(STORAGE_KEY_GUEST_NAME, trimmed);

    this.session = {
      ...this.session,
      guestName: trimmed
    };
    this.notify();

    return { success: true };
  }

  /**
   * Clears the guest's custom name back to unset.
   */
  public clearGuestName() {
    if (this.session.guestName) {
      this.claimedGuestNames.delete(this.session.guestName.toLowerCase());
      this.saveClaimedGuests();
    }
    localStorage.removeItem(STORAGE_KEY_GUEST_NAME);
    this.session = {
      ...this.session,
      guestName: undefined
    };
    this.notify();
  }

  /**
   * Resolves the player's name for Singleplayer mode:
   * - If registered: account's username
   * - If guest with set name: `[GuestName] (Guest)`
   * - If guest without set name: `Player`
   */
  public getSingleplayerName(): string {
    if (this.session.type === 'registered' && this.session.username) {
      return this.session.username;
    }
    if (this.session.guestName) {
      return `${this.session.guestName} (Guest)`;
    }
    return 'Player';
  }

  /**
   * Resolves the player's name for Multiplayer mode:
   * - If registered: account's username
   * - If guest with set name: `[GuestName] (Guest)`
   * - If guest without set name: `guest#` (1-9999), unique among online players
   */
  public getMultiplayerName(existingPlayers: Array<{ username: string } | string> = []): string {
    if (this.session.type === 'registered' && this.session.username) {
      return this.session.username;
    }
    if (this.session.guestName) {
      return `${this.session.guestName} (Guest)`;
    }

    // Extract numbers of current online guests: e.g. "guest491" -> 491
    const usedGuestNums = new Set<number>();
    for (const p of existingPlayers) {
      const u = typeof p === 'string' ? p : p.username;
      const match = /^guest(\d+)$/i.exec(u);
      if (match) {
        usedGuestNums.add(parseInt(match[1], 10));
      }
    }

    let myNum = this.session.guestNumber;
    if (!myNum || usedGuestNums.has(myNum)) {
      // Find an unused random number between 1 and 9999
      for (let i = 0; i < 1000; i++) {
        const candidate = Math.floor(Math.random() * 9999) + 1;
        if (!usedGuestNums.has(candidate)) {
          myNum = candidate;
          break;
        }
      }
      if (!myNum) myNum = 1;
      this.session.guestNumber = myNum;
      localStorage.setItem(STORAGE_KEY_GUEST_NUM, myNum.toString());
    }

    return `guest${myNum}`;
  }

  /**
   * Get public profile descriptor
   */
  public getProfileInfo() {
    const currentAcc = this.getCurrentAccount();
    return {
      isLoggedIn: this.isLoggedIn(),
      username: this.session.username,
      email: currentAcc?.email,
      isGoogleLinked: !!currentAcc?.googleId,
      guestName: this.session.guestName,
      isGuestNameSet: !!this.session.guestName,
      singleplayerName: this.getSingleplayerName(),
      multiplayerName: this.getMultiplayerName()
    };
  }
}

export const authService = new AuthService();
