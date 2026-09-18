const fs = require('fs');

let content = fs.readFileSync('services/actionQuotaService.ts', 'utf8');

// Inside syncWithAuth, we need to call userService.syncProfile
content = content.replace(
  `public syncWithAuth() {
    this.state = this.loadCurrentContextState();
    this.checkAndResetDaily();
    this.notify();
  }`,
  `public syncWithAuth() {
    this.state = this.loadCurrentContextState();
    this.checkAndResetDaily();
    
    // Attempt to sync with firestore
    const session = authService.getSession();
    if (session.type === 'registered' && session.username) {
      userService.syncProfile(
        session.username,
        this.state.monthlyPlan,
        this.state.purchasedBalance,
        this.state.dailyUsed,
        this.state.lastResetDate
      ).then(() => {
        this.notify();
      });
    } else {
      this.notify();
    }
  }`
);

// Subscribe to userService changes inside constructor
content = content.replace(
  `authService.subscribe(() => {
        this.syncWithAuth();
      });`,
  `authService.subscribe(() => {
        this.syncWithAuth();
      });
      userService.subscribe(() => {
        const pending = userService.getPendingGrants();
        if (pending > 0) {
           this.state.purchasedBalance += pending;
           this.saveCurrentContextState();
           userService.clearPendingGrants();
           userService.clearGrantsInFirestore();
        }
        // Update local state with latest role/plan privileges
        this.state.profile = userService.getProfile();
        this.notify();
      });`
);

// Update isGoldenName to include infiniteActionsGranted
content = content.replace(
  `public isGoldenName(): boolean {
    return this.state.monthlyPlan === 'infinite';
  }`,
  `public isGoldenName(): boolean {
    if (this.state.profile?.role === 'admin' && !this.state.profile?.adminGlowHidden) return true;
    if (this.state.profile?.role === 'mod' && !this.state.profile?.adminGlowHidden) return true;
    return this.state.monthlyPlan === 'infinite' || this.state.profile?.infiniteActionsGranted === true;
  }`
);

// In canPerformAction and consumeAction check infiniteActionsGranted
content = content.replace(
  `if (this.state.monthlyPlan === 'infinite') {`,
  `if (this.state.monthlyPlan === 'infinite' || this.state.profile?.infiniteActionsGranted) {`
);
content = content.replace(
  `if (this.state.monthlyPlan === 'infinite') {`,
  `if (this.state.monthlyPlan === 'infinite' || this.state.profile?.infiniteActionsGranted) {`
);

// In hasPermanentSaves and hasCommunityUnlimited
content = content.replace(
  `public hasPermanentSaves(): boolean {
    return this.state.monthlyPlan === 'adventurer' || this.state.monthlyPlan === 'infinite';
  }`,
  `public hasPermanentSaves(): boolean {
    return this.state.monthlyPlan === 'adventurer' || this.state.monthlyPlan === 'infinite' || this.state.profile?.permanentSavesGranted === true || this.state.profile?.role === 'admin' || this.state.profile?.role === 'mod';
  }`
);

content = content.replace(
  `public isCommunityUnlimited(): boolean {
    return this.state.monthlyPlan === 'adventurer' || this.state.monthlyPlan === 'infinite';
  }`,
  `public isCommunityUnlimited(): boolean {
    return this.state.monthlyPlan === 'adventurer' || this.state.monthlyPlan === 'infinite' || this.state.profile?.permanentCommunityPostsGranted === true || this.state.profile?.role === 'admin' || this.state.profile?.role === 'mod';
  }`
);

fs.writeFileSync('services/actionQuotaService.ts', content, 'utf8');
