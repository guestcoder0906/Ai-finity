const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

const additionalFields = `
              <div>
                <label className="block text-neutral-400 mb-1">Adventure Description (Optional)</label>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-black border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="A short summary of this adventure..."
                />
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-300 hover:text-white">
                <input 
                  type="checkbox" 
                  checked={isNsfw} 
                  onChange={(e) => setIsNsfw(e.target.checked)} 
                  className="accent-red-500 rounded" 
                />
                <span className="text-red-400 font-bold">Mark as NSFW (Adult Content)</span>
              </label>
`;

content = content.replace(
  `                  placeholder="e.g. The Chronicles of Eldoria"
                  className="w-full px-3 py-2 bg-black border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                />
              </div>`,
  `                  placeholder="e.g. The Chronicles of Eldoria"
                  className="w-full px-3 py-2 bg-black border border-neutral-700 rounded text-white focus:outline-none focus:border-blue-500"
                />
              </div>` + additionalFields
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
