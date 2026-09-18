const fs = require('fs');
let content = fs.readFileSync('services/communityService.ts', 'utf8');

const regex = /if \(!snap\.empty\) {([\s\S]*?)}/m;

const replacement = `
      if (!snap.empty) {
        const list: CommunityAdventureRecord[] = [];
        snap.forEach(docSnap => {
          list.push(docSnap.data() as CommunityAdventureRecord);
        });
        localStorage.setItem(LOCAL_STORAGE_COMMUNITY_FALLBACK, JSON.stringify(list));
        return list;
      } else {
        localStorage.setItem(LOCAL_STORAGE_COMMUNITY_FALLBACK, JSON.stringify([]));
        return [];
      }
`;

content = content.replace(
  /if \(!snap\.empty\) \{([\s\S]*?)\} catch \(e\)/m,
  replacement.trim() + '\n    } catch (e)'
);

fs.writeFileSync('services/communityService.ts', content, 'utf8');
