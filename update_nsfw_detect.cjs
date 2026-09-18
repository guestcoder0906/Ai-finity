const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

const nsfwKeywords = ['gore', 'sex', 'blood', 'rape', 'murder', 'erotic', 'nsfw', 'porn'];
const detectCode = `
    const isAutoNsfw = ${JSON.stringify(nsfwKeywords)}.some(kw => prompt.toLowerCase().includes(kw) || initialGen.toLowerCase().includes(kw) || fullNarrative.toLowerCase().includes(kw) || customTitle.toLowerCase().includes(kw) || customDescription.toLowerCase().includes(kw));
    const finalNsfw = isNsfw || isAutoNsfw;
`;

content = content.replace(
  `    setIsPosting(true);`,
  detectCode + `\n    setIsPosting(true);`
);

content = content.replace(
  `isNsfw,`,
  `isNsfw: finalNsfw,`
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
