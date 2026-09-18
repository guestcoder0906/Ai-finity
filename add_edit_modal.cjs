const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

const editModal = `
      {/* EDIT POST MODAL */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-lg p-5 sm:p-6 flex flex-col font-mono shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Edit Adventure Post</h3>
              <button
                onClick={() => setEditingPost(null)}
                className="text-neutral-400 hover:text-white"
              >
                &times;
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-neutral-400 text-xs mb-1">Adventure Name</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-neutral-400 text-xs mb-1">Description (Optional)</label>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Tell the community what to expect..."
                />
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer mt-2 text-sm text-neutral-300 hover:text-white">
                <input 
                  type="checkbox" 
                  checked={isNsfw} 
                  onChange={(e) => setIsNsfw(e.target.checked)} 
                  className="accent-red-500 rounded" 
                />
                <span className="text-red-400 font-bold">Mark as NSFW (Adult Content)</span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingPost(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsPosting(true);
                  const nsfwKeywords = ['gore', 'sex', 'blood', 'rape', 'murder', 'erotic', 'nsfw', 'porn'];
                  const prompt = editingPost.startingPrompt;
                  const initialGen = editingPost.initialGeneration || '';
                  const fullNarrative = editingPost.fullNarrativeText || '';
                  const isAutoNsfw = nsfwKeywords.some(kw => prompt.toLowerCase().includes(kw) || initialGen.toLowerCase().includes(kw) || fullNarrative.toLowerCase().includes(kw) || customTitle.toLowerCase().includes(kw) || customDescription.toLowerCase().includes(kw));
                  const finalNsfw = isNsfw || isAutoNsfw;
                  
                  await communityService.updateAdventure(editingPost.id, {
                    title: customTitle.trim() || 'Community Adventure',
                    description: customDescription.trim(),
                    isNsfw: finalNsfw
                  });
                  setIsPosting(false);
                  setEditingPost(null);
                  fetchAdventures();
                }}
                disabled={isPosting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
              >
                {isPosting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(
  `{/* DETAIL PREVIEW MODAL */}`,
  editModal + `\n      {/* DETAIL PREVIEW MODAL */}`
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
