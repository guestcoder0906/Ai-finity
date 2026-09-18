const fs = require('fs');
let content = fs.readFileSync('services/communityService.ts', 'utf8');

const regex = /\/\/\s*Seed preset community showcase adventures if empty[\s\S]*?return defaults;\n  }/;
content = content.replace(regex, `// No default seed adventures anymore\n    return [];\n  }`);

fs.writeFileSync('services/communityService.ts', content, 'utf8');
