const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

content = content.replace(
  `isMine = communityService.isUserAuthor(adv, authorName,
      description: customDescription.trim(),
      isNsfw, authorUid);`,
  `isMine = communityService.isUserAuthor(adv, authorName, authorUid);`
);

content = content.replace(
  `{communityService.isUserAuthor(selectedAdventure, authorName,
      description: customDescription.trim(),
      isNsfw, authorUid) && (`,
  `{communityService.isUserAuthor(selectedAdventure, authorName, authorUid) && (`
);

content = content.replace(
  `{communityService.isUserAuthor(selectedAdventure, authorName,
      description: customDescription.trim(),
      isNsfw, authorUid) && (`,
  `{communityService.isUserAuthor(selectedAdventure, authorName, authorUid) && (`
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
