const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

content = content.replace(
  `const [isNsfw: finalNsfw, setIsNsfw] = useState(false);`,
  `const [isNsfw, setIsNsfw] = useState(false);`
);

content = content.replace(/isNsfw, authorUid\);/g, `authorUid);`);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
