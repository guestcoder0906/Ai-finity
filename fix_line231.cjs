const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');
content = content.replace(
  `        return communityService.isUserAuthor(a, authorName,
      description: customDescription.trim(),
      authorUid);`,
  `        return communityService.isUserAuthor(a, authorName, authorUid);`
);
fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
