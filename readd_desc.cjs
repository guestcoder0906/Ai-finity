const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

content = content.replace(
  `      authorName,
      
      isNsfw,`,
  `      authorName,
      description: customDescription.trim(),
      isNsfw: finalNsfw,`
);

content = content.replace(
  `                  await communityService.updateAdventure(editingPost.id, {
                    title: customTitle.trim() || 'Community Adventure',
                    
                    isNsfw: finalNsfw
                  });`,
  `                  await communityService.updateAdventure(editingPost.id, {
                    title: customTitle.trim() || 'Community Adventure',
                    description: customDescription.trim(),
                    isNsfw: finalNsfw
                  });`
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
