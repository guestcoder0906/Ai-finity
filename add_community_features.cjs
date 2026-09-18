const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

content = content.replace(
  `const isMine = communityService.isUserAuthor(adv, authorName, authorUid);`,
  `const isMine = communityService.isUserAuthor(adv, authorName, authorUid);
            const canDelete = isMine || isAdminOrMod;
            if (adv.isNsfw && !viewNsfw && !isMine && !isAdminOrMod) return null;`
);

content = content.replace(
  `{isMine && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdventureToTakeDown(adv);
                        }}
                        className="text-xs font-mono text-red-400 hover:text-red-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-950/50 border border-transparent hover:border-red-800/60 transition-colors"
                        title="Take down this adventure from the community"
                      >
                        <Trash2 size={11} />
                        <span>Take Down</span>
                      </button>
                    )}`,
  `{canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdventureToTakeDown(adv);
                        }}
                        className="text-xs font-mono text-red-400 hover:text-red-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-950/50 border border-transparent hover:border-red-800/60 transition-colors"
                        title="Take down this adventure from the community"
                      >
                        <Trash2 size={11} />
                        <span>{isMine ? 'Take Down' : 'Moderate (Delete)'}</span>
                      </button>
                    )}
                    {isMine && (
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           setEditingPost(adv);
                           setCustomTitle(adv.title || '');
                           setCustomDescription(adv.description || '');
                           setIsNsfw(adv.isNsfw || false);
                         }}
                         className="text-xs font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-blue-950/50 border border-transparent hover:border-blue-800/60 transition-colors"
                       >
                         Edit
                       </button>
                    )}`
);

content = content.replace(
  `{/* Empty state for my_posts filter */}`,
  `{/* NSFW Toggle */}\n<div className="flex items-center gap-2 pb-2 text-xs font-mono">\n  <label className="flex items-center gap-2 cursor-pointer text-red-400 hover:text-red-300">\n    <input type="checkbox" checked={viewNsfw} onChange={(e) => setViewNsfw(e.target.checked)} className="accent-red-500 rounded" />\n    <span>View NSFW Content</span>\n  </label>\n  {viewNsfw && <span className="text-[10px] text-red-500 bg-red-950/30 px-2 py-0.5 rounded">Warning: Contains adult content</span>}\n</div>\n\n        {/* Empty state for my_posts filter */}`
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
