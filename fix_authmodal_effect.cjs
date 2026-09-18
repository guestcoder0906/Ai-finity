const fs = require('fs');
let content = fs.readFileSync('components/AuthModal.tsx', 'utf8');

content = content.replace(
  `  useEffect(() => {
    const unsub = authService.subscribe(() => {
      const s = authService.getSession();
      setSession(s);
      setProfile(authService.getProfileInfo());
      if (s.guestName) {
        setGuestInput(s.guestName);
      }
    });
    return () => { unsub(); unsubUser(); };
  }, []);`,
  `  useEffect(() => {
    const unsub = authService.subscribe(() => {
      const s = authService.getSession();
      setSession(s);
      setProfile(authService.getProfileInfo());
      if (s.guestName) {
        setGuestInput(s.guestName);
      }
    });
    const unsubUser = userService.subscribe(() => {
      setUserProfileData(userService.getProfile());
    });
    return () => { unsub(); unsubUser(); };
  }, []);`
);

fs.writeFileSync('components/AuthModal.tsx', content, 'utf8');
