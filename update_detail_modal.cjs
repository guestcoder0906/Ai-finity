const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

const detailTitleRender = `<h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>{selectedAdventure.title}</span>
                  {selectedAdventure.isNsfw && (
                    <span className="text-[10px] bg-red-950/60 border border-red-800 text-red-300 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                      NSFW
                    </span>
                  )}
                  {communityService.isUserAuthor(selectedAdventure, authorName, authorUid) && (`;

content = content.replace(
  `<h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>{selectedAdventure.title}</span>
                  {communityService.isUserAuthor(selectedAdventure, authorName, authorUid) && (`,
  detailTitleRender
);

const detailDescRender = `              {selectedAdventure.description && (
                <div className="mb-4">
                  <h4 className="text-neutral-400 font-bold mb-1 uppercase text-[11px]">Description:</h4>
                  <div className="p-3 bg-black rounded-lg border border-neutral-800 text-neutral-200">
                    {selectedAdventure.description}
                  </div>
                </div>
              )}
              <div>`;

content = content.replace(
  `            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs text-neutral-300 flex-1">
              <div>`,
  `            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs text-neutral-300 flex-1">\n` + detailDescRender
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
