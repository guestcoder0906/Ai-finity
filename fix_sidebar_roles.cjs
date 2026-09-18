const fs = require('fs');
let content = fs.readFileSync('components/Sidebar.tsx', 'utf8');

// The line is: <span className="truncate font-mono font-bold text-[11px] ..." title={username}>{username}</span>

const profileTags = `
          {actionQuotaService.getQuotaState().profile?.role === 'admin' && (
            <span className="text-[9px] bg-indigo-950/80 border border-indigo-500 text-indigo-300 px-1 py-0.5 rounded font-mono flex items-center gap-1 shadow-[0_0_5px_rgba(99,102,241,0.5)]">
              <Sparkles size={8} className="text-cyan-300" /> Admin
            </span>
          )}
          {actionQuotaService.getQuotaState().profile?.role === 'mod' && (
            <span className="text-[9px] bg-amber-950/80 border border-amber-500 text-amber-300 px-1 py-0.5 rounded font-mono shadow-[0_0_5px_rgba(245,158,11,0.5)]">
              Mod
            </span>
          )}
`;

content = content.replace(
  `{username}
            </span>`,
  `{username}
            </span>` + profileTags
);

fs.writeFileSync('components/Sidebar.tsx', content, 'utf8');
