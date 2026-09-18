const fs = require('fs');
let content = fs.readFileSync('components/CommunityAdventures.tsx', 'utf8');

content = content.replace(
  `import { auth } from '../services/firebase';`,
  `import { auth } from '../services/firebase';\nimport { userService } from '../services/userService';`
);

content = content.replace(
  `  const [customTitle, setCustomTitle] = useState('');`,
  `  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [isNsfw, setIsNsfw] = useState(false);
  const [showNsfwWarning, setShowNsfwWarning] = useState(false);
  const [viewNsfw, setViewNsfw] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityAdventureRecord | null>(null);`
);

content = content.replace(
  `  const authorUid = auth.currentUser?.uid;`,
  `  const authorUid = auth.currentUser?.uid;
  const userProfile = userService.getProfile();
  const isAdminOrMod = userProfile?.role === 'admin' || userProfile?.role === 'mod';`
);

fs.writeFileSync('components/CommunityAdventures.tsx', content, 'utf8');
