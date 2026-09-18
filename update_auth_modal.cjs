const fs = require('fs');
let content = fs.readFileSync('components/AuthModal.tsx', 'utf8');

content = content.replace(
  `import { authService, AuthSession, STORAGE_KEY_GUEST_NAME } from '../services/authService';`,
  `import { authService, AuthSession, STORAGE_KEY_GUEST_NAME } from '../services/authService';\nimport { userService, UserProfile } from '../services/userService';`
);

content = content.replace(
  `const [session, setSession] = useState<AuthSession>(authService.getSession());`,
  `const [session, setSession] = useState<AuthSession>(authService.getSession());
  const [userProfileData, setUserProfileData] = useState<UserProfile | null>(userService.getProfile());
  const [adminTargetUser, setAdminTargetUser] = useState('');
  const [adminGrantAmount, setAdminGrantAmount] = useState(100);
  const [adminActionError, setAdminActionError] = useState('');
  const [adminActionSuccess, setAdminActionSuccess] = useState('');`
);

content = content.replace(
  `const unsub = authService.subscribe(() => {
      setSession(authService.getSession());
      setProfile(authService.getProfileInfo());
    });`,
  `const unsub = authService.subscribe(() => {
      setSession(authService.getSession());
      setProfile(authService.getProfileInfo());
    });
    const unsubUser = userService.subscribe(() => {
      setUserProfileData(userService.getProfile());
    });`
);

content = content.replace(
  `return unsub;`,
  `return () => { unsub(); unsubUser(); };`
);

fs.writeFileSync('components/AuthModal.tsx', content, 'utf8');
