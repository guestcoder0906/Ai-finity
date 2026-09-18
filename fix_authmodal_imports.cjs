const fs = require('fs');
let content = fs.readFileSync('components/AuthModal.tsx', 'utf8');

content = content.replace(
  `import { signInWithGooglePopup } from '../services/firebase';`,
  `import { signInWithGooglePopup } from '../services/firebase';
import { userService, UserProfile } from '../services/userService';`
);

fs.writeFileSync('components/AuthModal.tsx', content, 'utf8');
