const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

const titleRender = `                  <h3 className="text-base font-bold text-white group-hover:text-blue-300 transition-colors line-clamp-2 mb-2 flex items-center gap-2">
                    <span>{adv.title}</span>
                    {adv.isNsfw && (
                      <span className="text-[10px] bg-red-950/60 border border-red-800 text-red-300 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                        NSFW
                      </span>
                    )}
                  </h3>`;

content = content.replace(
  `<h3 className="text-base font-bold text-white group-hover:text-blue-300 transition-colors line-clamp-2 mb-2">
                    {adv.title}
                  </h3>`,
  titleRender
);

const descriptionRender = `                  {adv.description && (
                    <p className="text-[11px] text-neutral-300 italic mb-2">
                      {adv.description}
                    </p>
                  )}`;

content = content.replace(
  `                  <p className="text-xs text-neutral-400 leading-relaxed font-sans line-clamp-3 mb-4">`,
  descriptionRender + `\n                  <p className="text-xs text-neutral-400 leading-relaxed font-sans line-clamp-3 mb-4">`
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
