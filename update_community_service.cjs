const fs = require('fs');
let content = fs.readFileSync('services/communityService.ts', 'utf8');

content = content.replace(
  `  tags?: string;
}`,
  `  tags?: string;
  description?: string;
  isNsfw?: boolean;
}`
);

const updateMethod = `
  async updateAdventure(id: string, updates: Partial<CommunityAdventureRecord>): Promise<{ success: boolean; error?: string }> {
    try {
      try {
        const docRef = doc(db, 'community_adventures', id);
        const { updateDoc } = require('firebase/firestore');
        await updateDoc(docRef, updates);
      } catch (fsErr) {
        console.warn('Firestore update notice (falling back to local cache):', fsErr);
      }

      const cached = this.getLocalCache();
      const updated = cached.map(adv => adv.id === id ? { ...adv, ...updates } : adv);
      localStorage.setItem(LOCAL_STORAGE_COMMUNITY_FALLBACK, JSON.stringify(updated));

      return { success: true };
    } catch (err: any) {
      console.error('Failed to update adventure:', err);
      return { success: false, error: err.message || 'Failed to update adventure.' };
    }
  },
`;

content = content.replace(
  `async deleteAdventure`,
  updateMethod + `\n  async deleteAdventure`
);

fs.writeFileSync('services/communityService.ts', content, 'utf8');
