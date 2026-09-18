const fs = require('fs');
let content = fs.readFileSync('components/AuthModal.tsx', 'utf8');

const targetStr = `                <p className="text-[11px] text-neutral-400">
                  {profile.isGoogleLinked
                    ? 'Your Google account is linked. You can log in automatically anytime using "Sign in with Google".'
                    : 'Link your Google account for one-click automatic login.'}
                </p>
              </div>`;

const adminPanel = `
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
                            setAdminActionSuccess(\`Granted \${adminGrantAmount} actions to \${target.username}\`);
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
                              setAdminActionSuccess(\`Granted INFINITE actions to \${target.username}\`);
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
                              setAdminActionSuccess(\`Revoked INFINITE actions from \${target.username}\`);
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
                            setAdminActionSuccess(\`Granted Community & Saves perks to \${target.username}\`);
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
                              setAdminActionSuccess(\`Made \${target.username} a Mod\`);
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
                              setAdminActionSuccess(\`Demoted \${target.username} to User\`);
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
`;

content = content.replace(targetStr, targetStr + adminPanel);
fs.writeFileSync('components/AuthModal.tsx', content, 'utf8');
