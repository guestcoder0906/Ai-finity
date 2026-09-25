/**
 * Map Player Engine
 * Provides canonical player identification, multi-page deduplication,
 * and robust reconciliation between character files and CurrentMap.json.
 */

export interface RegisteredPlayer {
  username: string;
  charName: string;
  fullName: string;
  filename: string;
  aliases: Set<string>;
}

export interface PlayerResolution {
  canonicalKey: string;
  username: string;
  characterName: string;
  isRegistered: boolean;
  playerObj: any;
}

/**
 * Determines whether a file represents a human player character sheet rather than an NPC or world file.
 */
export function isPlayerCharacterFile(
  filename: string,
  content?: string | null
): { isPlayer: boolean; username: string; charName: string; canonicalName: string } {
  if (!filename || !filename.endsWith('.txt')) {
    return { isPlayer: false, username: '', charName: '', canonicalName: '' };
  }
  if (
    filename.startsWith('World') ||
    filename.startsWith('Guide') ||
    filename.startsWith('Log') ||
    filename.startsWith('History') ||
    filename.startsWith('Event') ||
    filename.startsWith('Combat') ||
    filename === 'CurrentMap.json'
  ) {
    return { isPlayer: false, username: '', charName: '', canonicalName: '' };
  }

  const base = filename.replace(/\.txt$/, '');
  const cleanBase = base.replace(/[-_](?:npc|dead|corpse)$/i, '').trim();

  // Deceased characters ending in -dead.txt are preserved corpses/memorials, not active player characters
  if (base.toLowerCase().endsWith('-dead') || base.toLowerCase().endsWith('_dead')) {
    return { isPlayer: false, username: '', charName: cleanBase, canonicalName: cleanBase };
  }

  let isPlayer = false;
  let username = '';
  let charName = '';

  if (content) {
    const playerMatch = content.match(/[-*•]?\s*Player\s*[:=]\s*([^\n\r]+)/i);
    if (playerMatch && playerMatch[1]) {
      const pVal = playerMatch[1].replace(/^[*-•\s]+/, '').trim();
      if (pVal && !/^(?:none|n\/a|npc|dead|deceased|former|bot|ai|unassigned)/i.test(pVal)) {
        isPlayer = true;
        username = pVal;
      }
    }
    const nameMatch = content.match(/[-*•]?\s*(?:Character\s+)?Name\s*[:=]\s*([^\n\r]+)/i);
    if (nameMatch && nameMatch[1]) {
      const nVal = nameMatch[1].replace(/^[*-•\s]+/, '').trim();
      if (nVal && nVal.length > 1 && !/^(?:adventurer|player|npc)$/i.test(nVal)) {
        charName = nVal;
      }
    }
  }

  if (!isPlayer && cleanBase.includes('-')) {
    const parts = cleanBase.split('-');
    const suffix = parts[parts.length - 1].trim();
    const prefix = parts.slice(0, -1).join('-').trim();
    const suffixLower = suffix.toLowerCase();
    if (suffix && !['npc', 'dead', 'corpse', 'deceased', 'bot', 'ai', 'boss', 'monster', 'creature', 'enemy', 'ally', 'guard', 'merchant'].includes(suffixLower)) {
      isPlayer = true;
      if (!username) username = suffix;
      if (!charName) charName = prefix || suffix;
    }
  }

  return {
    isPlayer,
    username: username.trim(),
    charName: (charName || username).trim(),
    canonicalName: cleanBase
  };
}

/**
 * Detects and repairs any human player character files that were incorrectly named or corrupted
 * with an accidental "-npc" suffix (e.g., "MiraRavencrest-Chloe-npc.txt" -> "MiraRavencrest-Chloe.txt").
 * Also cleans up duplicate player files for the same account.
 */
export function cleanAndRepairPlayerFiles(
  fileSystem: {
    list: () => string[];
    read: (f: string) => string | null;
    write: (f: string, c: string) => void;
    delete: (f: string) => void;
    exists?: (f: string) => boolean;
  }
): string[] {
  if (!fileSystem || typeof fileSystem.list !== 'function') return [];
  const files = fileSystem.list();

  for (const f of files) {
    if (!f.endsWith('.txt')) continue;
    if (
      f.startsWith('World') ||
      f.startsWith('Guide') ||
      f.startsWith('Log') ||
      f.startsWith('History') ||
      f.startsWith('Event') ||
      f.startsWith('Combat') ||
      f === 'CurrentMap.json'
    ) continue;

    const base = f.replace(/\.txt$/, '');
    const lower = base.toLowerCase();

    if (lower.endsWith('-npc') || lower.endsWith('_npc')) {
      const content = fileSystem.read(f);
      const detection = isPlayerCharacterFile(f, content);

      if (detection.isPlayer) {
        const cleanBase = base.replace(/[-_]npc$/i, '').trim();
        const targetFilename = `${cleanBase}.txt`;

        console.log(`[Player Engine] Repairing corrupted player character filename: "${f}" -> "${targetFilename}"`);
        if (content) {
          const cleanedContent = content
            .replace(/[-*•]?\s*is_npc\s*[:=]\s*true[^\n\r]*/gi, '')
            .replace(/[-*•]?\s*category\s*[:=]\s*npc[^\n\r]*/gi, '')
            .replace(/[-*•]?\s*status\s*[:=]\s*npc[^\n\r]*/gi, '');
          fileSystem.write(targetFilename, cleanedContent);
        }
        fileSystem.delete(f);
      }
    }
  }

  return fileSystem.list();
}

/**
 * Discovers and builds a registry of all human players from the character files in the project.
 */
export function buildPlayerRegistry(
  files: string[] = [],
  fileSystem?: { read: (f: string) => string | null }
): RegisteredPlayer[] {
  const registry: RegisteredPlayer[] = [];
  const seenUsernames = new Set<string>();

  for (const f of files) {
    if (!f.endsWith('.txt')) continue;
    if (
      f.startsWith('World') ||
      f.startsWith('Guide') ||
      f.startsWith('Log') ||
      f.startsWith('History') ||
      f.startsWith('Event') ||
      f.startsWith('Combat') ||
      f === 'CurrentMap.json'
    ) {
      continue;
    }

    const content = fileSystem ? fileSystem.read(f) : null;
    const playerCheck = isPlayerCharacterFile(f, content);

    if (!playerCheck.isPlayer) {
      continue;
    }

    const username = playerCheck.username;
    let charName = playerCheck.charName;
    const base = f.replace(/\.txt$/, '').replace(/[-_]npc$/i, '').trim();

    const uKey = username.toLowerCase();
    if (seenUsernames.has(uKey)) continue;
    seenUsernames.add(uKey);

    let fullName = charName;
    if (content) {
      const nameMatch = content.match(/[-*•]?\s*(?:Character\s+)?Name\s*[:=]\s*([^\n\r]+)/i);
      if (nameMatch) {
        const rawParsedName = nameMatch[1].replace(/^[*-•\s]+/, '').trim();
        if (rawParsedName && rawParsedName.length > 1) {
          fullName = rawParsedName;
          if (!charName || charName === username) {
            charName = rawParsedName;
          }
        }
      }
    }

    const aliases = new Set<string>();
    const addTokens = (str: string) => {
      if (!str) return;
      const clean = str.toLowerCase().trim();
      if (!clean) return;
      aliases.add(clean);
      const alphaNum = clean.replace(/[^a-z0-9\s]/g, ' ').trim();
      if (alphaNum) {
        aliases.add(alphaNum);
        alphaNum.split(/\s+/).forEach(w => {
          if (w.length >= 3) aliases.add(w);
        });
      }
    };

    addTokens(username);
    addTokens(charName);
    addTokens(fullName);
    addTokens(base);
    addTokens(`${charName} ${username}`);
    addTokens(`${charName}-${username}`);

    registry.push({
      username,
      charName,
      fullName,
      filename: `${base}.txt`,
      aliases
    });
  }

  return registry;
}

/**
 * Resolves any map player token to its canonical player identity and links it
 * with its registered player file if available.
 */
export function resolvePlayerIdentity(
  pl: any,
  registry: RegisteredPlayer[] = []
): PlayerResolution {
  if (!pl || typeof pl !== 'object') {
    return {
      canonicalKey: 'player',
      username: 'Player',
      characterName: 'Player',
      isRegistered: false,
      playerObj: pl
    };
  }

  const rawUsername = (pl.username !== undefined ? String(pl.username) : '').trim();
  const rawCharName = (pl.characterName !== undefined ? String(pl.characterName) : '').trim();
  const rawName = (pl.name !== undefined ? String(pl.name) : '').trim();
  const rawId = (pl.id !== undefined ? String(pl.id) : '').trim();

  const candidates = [rawUsername, rawCharName, rawName, rawId].filter(Boolean);

  for (const reg of registry) {
    const regUKey = reg.username.toLowerCase();
    const regCKey = reg.charName.toLowerCase();
    const regFKey = reg.fullName.toLowerCase();

    for (const cand of candidates) {
      const cLower = cand.toLowerCase().trim();
      if (!cLower) continue;

      if (cLower === regUKey || cLower === regCKey || cLower === regFKey) {
        return makeWinner(reg);
      }

      if (reg.aliases.has(cLower)) {
        return makeWinner(reg);
      }

      const cAlpha = cLower.replace(/[^a-z0-9]/g, '');
      if (
        cAlpha &&
        (cAlpha === regUKey.replace(/[^a-z0-9]/g, '') ||
          cAlpha === regCKey.replace(/[^a-z0-9]/g, '') ||
          cAlpha === regFKey.replace(/[^a-z0-9]/g, ''))
      ) {
        return makeWinner(reg);
      }

      if (cLower.startsWith(regCKey) || cLower.includes(regUKey) || regFKey.includes(cLower)) {
        if (cLower.length >= 3 || cLower === regUKey) {
          return makeWinner(reg);
        }
      }
    }
  }

  function makeWinner(reg: RegisteredPlayer): PlayerResolution {
    const finalUsername = reg.username;
    const finalCharName = reg.fullName || reg.charName || finalUsername;
    pl.username = finalUsername;
    if (!pl.characterName || pl.characterName === pl.username) {
      pl.characterName = finalCharName;
    }
    return {
      canonicalKey: reg.username.toLowerCase(),
      username: finalUsername,
      characterName: finalCharName,
      isRegistered: true,
      playerObj: pl
    };
  }

  const bestName = rawUsername || rawCharName || rawName || rawId || 'player';
  const cleanKey = bestName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return {
    canonicalKey: cleanKey || 'player',
    username: rawUsername || bestName,
    characterName: rawCharName || rawName || bestName,
    isRegistered: false,
    playerObj: pl
  };
}

/**
 * Selects the best token among duplicates on the same page and merges details.
 */
function pickBestPlayerToken(tokens: any[], activeUsername?: string): any {
  if (tokens.length === 1) return tokens[0];

  let best = tokens[0];
  let bestScore = -Infinity;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let score = i;
    if (t.vision) score += 50;
    if (t.facing !== undefined && t.facing !== 0) score += 20;
    if (t.characterName && t.characterName !== t.username) score += 20;
    if (activeUsername && String(t.username).toLowerCase() === activeUsername.toLowerCase()) score += 30;

    const px = Number(t.x) || 0;
    const py = Number(t.y) || 0;
    // Penalize exact default grid coordinates
    if (px >= 10 && px <= 60 && (px - 10) % 8 === 0 && (py - 15) % 6 === 0) {
      score -= 40;
    }

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  for (const t of tokens) {
    if (t === best) continue;
    if (!best.vision && t.vision) best.vision = t.vision;
    if (!best.facing && t.facing) best.facing = t.facing;
    if (!best.characterName && t.characterName) best.characterName = t.characterName;
  }

  return best;
}

/**
 * Purges any NPC tokens from all map pages that match any registered human player's
 * username, character name, full name, or aliases.
 * Player characters are strictly players, NEVER NPCs.
 */
export function purgePlayerDuplicatesFromNpcs(
  pages: any[],
  registry: RegisteredPlayer[] = []
): void {
  if (!pages || !Array.isArray(pages) || pages.length === 0 || registry.length === 0) return;

  const forbiddenKeys = new Set<string>();
  for (const reg of registry) {
    if (reg.username) {
      const u = reg.username.toLowerCase().trim();
      forbiddenKeys.add(u);
      forbiddenKeys.add(`${u}-npc`);
      forbiddenKeys.add(`${u}_npc`);
      forbiddenKeys.add(`npc-${u}`);
    }
    if (reg.charName) {
      const c = reg.charName.toLowerCase().trim();
      forbiddenKeys.add(c);
      forbiddenKeys.add(`${c}-npc`);
      forbiddenKeys.add(`${c}_npc`);
      forbiddenKeys.add(`npc-${c}`);
    }
    if (reg.fullName) {
      const f = reg.fullName.toLowerCase().trim();
      forbiddenKeys.add(f);
      forbiddenKeys.add(`${f}-npc`);
      forbiddenKeys.add(`${f}_npc`);
      forbiddenKeys.add(`npc-${f}`);
    }
    reg.aliases.forEach(a => {
      const al = a.toLowerCase().trim();
      if (al && al.length >= 3) {
        forbiddenKeys.add(al);
        forbiddenKeys.add(`${al}-npc`);
      }
    });
  }

  for (const page of pages) {
    if (Array.isArray(page.npcs)) {
      page.npcs = page.npcs.filter((npc: any) => {
        if (!npc || typeof npc !== 'object') return false;
        const rawName = String(npc.name || npc.charName || npc.characterName || '').trim().toLowerCase();
        if (!rawName) return true;

        const cleanName = rawName.replace(/[-_]npc$/i, '').trim();
        const baseName = cleanName.replace(/[^a-z0-9\s]/g, '').trim();

        if (forbiddenKeys.has(rawName) || forbiddenKeys.has(cleanName) || forbiddenKeys.has(baseName)) {
          return false;
        }

        for (const reg of registry) {
          const regU = reg.username.toLowerCase();
          const regC = reg.charName.toLowerCase();
          const regF = reg.fullName.toLowerCase();
          if (cleanName === regU || cleanName === regC || cleanName === regF) {
            return false;
          }
          if (rawName.includes(regU) && rawName.includes(regC)) {
            return false;
          }
        }

        return true;
      });
    }
  }
}

/**
 * Deduplicates players both within each page and across all pages of the map.
 * Ensures that each player exists EXACTLY ONCE on the entire map.
 */
export function deduplicatePlayersOnMap(
  pages: any[],
  registry: RegisteredPlayer[] = [],
  options: {
    activeUsername?: string;
    oldPlayerLocations?: Map<string, { pageIndex: number; pageName: string; x: number; y: number; facing: number; raw: any }>;
  } = {}
): void {
  if (!pages || !Array.isArray(pages) || pages.length === 0) return;

  // Clean out any rogue NPCs that are actually players
  purgePlayerDuplicatesFromNpcs(pages, registry);

  // 1. Canonicalize player identity on all tokens
  for (const page of pages) {
    if (Array.isArray(page.players)) {
      for (const pl of page.players) {
        resolvePlayerIdentity(pl, registry);
      }
    }
  }

  // 2. Intra-page deduplication
  for (const page of pages) {
    if (!Array.isArray(page.players) || page.players.length <= 1) continue;

    const playerMap = new Map<string, any[]>();
    for (const pl of page.players) {
      const res = resolvePlayerIdentity(pl, registry);
      if (!playerMap.has(res.canonicalKey)) {
        playerMap.set(res.canonicalKey, []);
      }
      playerMap.get(res.canonicalKey)!.push(pl);
    }

    const dedupedPlayers: any[] = [];
    playerMap.forEach((list) => {
      if (list.length === 1) {
        dedupedPlayers.push(list[0]);
      } else {
        const winner = pickBestPlayerToken(list, options.activeUsername);
        dedupedPlayers.push(winner);
      }
    });
    page.players = dedupedPlayers;
  }

  // 3. Cross-page deduplication
  if (pages.length > 1) {
    const occurrencesMap = new Map<
      string,
      { pageIndex: number; pageName: string; player: any; score: number }[]
    >();

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const pageName = (page.name || '').trim().toLowerCase();
      if (!Array.isArray(page.players)) continue;

      for (const pl of page.players) {
        const res = resolvePlayerIdentity(pl, registry);
        const key = res.canonicalKey;

        let score = 0;
        const px = Number(pl.x) || 0;
        const py = Number(pl.y) || 0;

        if (options.oldPlayerLocations && options.oldPlayerLocations.has(key)) {
          const oldLoc = options.oldPlayerLocations.get(key)!;
          const samePage = pageName === oldLoc.pageName || pIdx === oldLoc.pageIndex;
          const sameCoords = Math.abs(px - oldLoc.x) < 0.2 && Math.abs(py - oldLoc.y) < 0.2;

          if (samePage && sameCoords) {
            score -= 100; // Stale location from previous turn
          } else if (!samePage) {
            score += 100; // Moved to a new page
          } else {
            score += 50;  // Updated coords on same page
          }
        }

        score += pIdx * 10;

        // Custom coordinates bonus
        if (!(Math.abs((px - 10) % 8) < 0.01 && Math.abs((py - 15) % 6) < 0.01 && px <= 50 && py <= 50)) {
          score += 20;
        }

        if (pl.vision) score += 15;

        if (!occurrencesMap.has(key)) {
          occurrencesMap.set(key, []);
        }
        occurrencesMap.get(key)!.push({
          pageIndex: pIdx,
          pageName,
          player: pl,
          score
        });
      }
    }

    occurrencesMap.forEach((occs, key) => {
      if (occs.length <= 1) return;

      occs.sort((a, b) => b.score - a.score);
      const winner = occs[0];

      // Remove from other pages or stale duplicates on same page
      for (let i = 1; i < occs.length; i++) {
        const toDrop = occs[i];
        const page = pages[toDrop.pageIndex];
        if (page && Array.isArray(page.players)) {
          if (toDrop.pageIndex === winner.pageIndex) {
            page.players = page.players.filter((p: any) => p !== toDrop.player);
          } else {
            page.players = page.players.filter((p: any) => {
              const r = resolvePlayerIdentity(p, registry);
              return r.canonicalKey !== key;
            });
          }
        }
      }
    });
  }
}

/**
 * Ensures all registered human players have a token on the map, placing them on
 * page 0 ONLY if they are not already present on ANY page.
 */
export function reconcileRegisteredPlayersOnMap(
  pages: any[],
  registry: RegisteredPlayer[]
): void {
  if (!pages || pages.length === 0 || registry.length === 0) return;

  const existingKeys = new Set<string>();
  for (const page of pages) {
    if (Array.isArray(page.players)) {
      for (const pl of page.players) {
        const res = resolvePlayerIdentity(pl, registry);
        existingKeys.add(res.canonicalKey);
      }
    }
  }

  for (const reg of registry) {
    const key = reg.username.toLowerCase();
    if (!existingKeys.has(key)) {
      if (!Array.isArray(pages[0].players)) {
        pages[0].players = [];
      }
      const offset = pages[0].players.length;
      pages[0].players.push({
        username: reg.username,
        characterName: reg.fullName || reg.charName,
        x: 10 + (offset * 8),
        y: 15 + (offset * 6),
        facing: 0,
        vision: { mainAngle: 66, peripheralAngle: 90, detailedRange: 20, maxRange: 50 }
      });
      existingKeys.add(key);
    }
  }
}

const NPC_TITLES_OCCUPATIONS = new Set([
  'the', 'a', 'an', 'old', 'young', 'elder', 'little', 'big', 'great',
  'man', 'woman', 'lady', 'sir', 'madam', 'mister', 'mr', 'mrs', 'ms',
  'father', 'mother', 'brother', 'sister', 'doctor', 'dr', 'captain', 'commander',
  'officer', 'sergeant', 'lieutenant', 'chief', 'sheriff', 'mayor', 'master',
  'lord', 'king', 'queen', 'prince', 'princess', 'baron', 'count', 'duke',
  'blacksmith', 'smith', 'shopkeeper', 'merchant', 'vendor', 'trader',
  'innkeeper', 'bartender', 'barkeep', 'tavernkeeper', 'herbalist', 'alchemist',
  'apothecary', 'cleric', 'priest', 'priestess', 'ranger', 'hunter', 'farmer',
  'fisherman', 'sailor', 'pirate', 'thief', 'rogue', 'wizard', 'mage', 'sorcerer',
  'knight', 'paladin', 'warrior', 'guard', 'town guard', 'city guard', 'watchman', 'sentry', 'patrol'
]);

/**
 * Normalizes an NPC name to identify its core entity identity, detect distinct numbering,
 * and determine if genuine cloning or illusion context applies.
 */
export function normalizeNpcName(raw: string): {
  normalized: string;
  cleanName: string;
  coreTokens: string[];
  numberIndex?: number;
  letterIndex?: string;
  isExplicitClone: boolean;
} {
  let name = String(raw || '').trim();
  name = name.replace(/[-_]npc$/i, '').trim();

  // Genuine cloning context: Mirror Image spell, simulacrum, clone vat, doppelganger, etc.
  const isExplicitClone = /\b(?:clone|illusion|duplicate|mirror\s*image|simulacrum|doppelganger|copy|replica|decoy|shadow\s*clone|split|mitosis|hologram|projection)\b/i.test(name);

  let numberIndex: number | undefined;
  let letterIndex: string | undefined;

  const numMatch = name.match(/(?:^|[\s_-])#?(\d+)\b/);
  if (numMatch) {
    numberIndex = parseInt(numMatch[1], 10);
  }

  const letterMatch = name.match(/(?:^|[\s_-])([A-Z])\b/);
  if (!numberIndex && letterMatch && !['A', 'I'].includes(letterMatch[1])) {
    letterIndex = letterMatch[1];
  }

  const decamel = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  const clean = decamel.replace(/[-_]+/g, ' ').replace(/[()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();

  const tokens = lower.split(/\s+/).filter(t => t.length > 0 && !/^\d+$/.test(t));
  const coreTokens = tokens.filter(t => !NPC_TITLES_OCCUPATIONS.has(t));

  return {
    normalized: lower,
    cleanName: clean,
    coreTokens: coreTokens.length > 0 ? coreTokens : tokens,
    numberIndex,
    letterIndex,
    isExplicitClone
  };
}

/**
 * Determines whether two NPC names refer to the exact same NPC entity
 * (preventing accidental cloning with slight name variations),
 * while preserving distinct numbered minions and genuine magical/sci-fi clones.
 */
export function areNpcsSameEntity(rawA: string, rawB: string): boolean {
  if (!rawA || !rawB) return false;
  if (rawA === rawB) return true;

  const a = normalizeNpcName(rawA);
  const b = normalizeNpcName(rawB);

  // If either entity has an explicit cloning/illusion tag, do NOT merge them unless identical clone tag
  if (a.isExplicitClone || b.isExplicitClone) {
    return a.normalized === b.normalized;
  }

  // If one has index 1 and another has index 2 (e.g. Bandit 1 vs Bandit 2), they are DIFFERENT entities
  if (a.numberIndex !== undefined && b.numberIndex !== undefined && a.numberIndex !== b.numberIndex) {
    return false;
  }
  if (a.letterIndex !== undefined && b.letterIndex !== undefined && a.letterIndex !== b.letterIndex) {
    return false;
  }

  // Exact normalized match e.g. "maeve" === "maeve"
  if (a.normalized === b.normalized) return true;

  // Normalized without spaces e.g. "townguard" === "townguard"
  const aNoSpace = a.normalized.replace(/\s+/g, '');
  const bNoSpace = b.normalized.replace(/\s+/g, '');
  if (aNoSpace === bNoSpace) return true;

  // Check core tokens (e.g. "Garrick" vs "Blacksmith Garrick" vs "Garrick the Blacksmith")
  if (a.coreTokens.length > 0 && b.coreTokens.length > 0) {
    const aCore = a.coreTokens.join(' ');
    const bCore = b.coreTokens.join(' ');
    if (aCore === bCore) {
      if (a.numberIndex === b.numberIndex && a.letterIndex === b.letterIndex) {
        return true;
      }
    }
    // Subset match: e.g. "Jenkins" in "Old Man Jenkins" or "Garrick" in "Garrick Ironfoot"
    if (a.coreTokens.length === 1 && b.coreTokens.includes(a.coreTokens[0])) {
      if (a.numberIndex === b.numberIndex && a.letterIndex === b.letterIndex) {
        return true;
      }
    }
    if (b.coreTokens.length === 1 && a.coreTokens.includes(b.coreTokens[0])) {
      if (a.numberIndex === b.numberIndex && a.letterIndex === b.letterIndex) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Deduplicates NPCs on map pages.
 * Prevents accidental duplicate / cloned NPCs with slight name variations from cluttering the map,
 * while preserving genuine distinct numbered entities and explicit clone mechanics.
 */
export function deduplicateNpcsOnMap(pages: any[], fileList: string[] = []): void {
  if (!pages || !Array.isArray(pages)) return;

  // Build a lookup of established canonical NPC names from existing -npc.txt files
  const canonicalNpcNames = fileList
    .filter(f => f.endsWith('-npc.txt'))
    .map(f => f.replace(/\.txt$/, ''));

  for (const page of pages) {
    if (!Array.isArray(page.npcs) || page.npcs.length <= 1) continue;

    const uniqueNpcs: any[] = [];
    for (const npc of page.npcs) {
      if (!npc || typeof npc !== 'object') continue;
      const rawName = String(npc.name || npc.charName || npc.characterName || '').trim();
      if (!rawName) continue;

      // Ensure -npc suffix
      let normalizedName = rawName.endsWith('-npc') ? rawName : `${rawName}-npc`;

      // Check if there is an established canonical file name that matches this entity
      const canonicalMatch = canonicalNpcNames.find(c => areNpcsSameEntity(c, normalizedName));
      if (canonicalMatch) {
        normalizedName = canonicalMatch;
      }

      const existingIdx = uniqueNpcs.findIndex(existing => areNpcsSameEntity(existing.name, normalizedName));
      if (existingIdx >= 0) {
        // Duplicate / cloned NPC detected! Merge into a single canonical entity
        const existing = uniqueNpcs[existingIdx];
        // Prefer canonical name from file or cleaner title
        if (canonicalMatch && existing.name !== canonicalMatch) {
          existing.name = canonicalMatch;
        }
        // Preserve richer metadata
        if (!existing.vision && npc.vision) existing.vision = npc.vision;
        if ((existing.facing === undefined || existing.facing === 0) && npc.facing !== undefined && npc.facing !== 0) {
          existing.facing = npc.facing;
        }
        if (npc.description && !existing.description) {
          existing.description = npc.description;
        }
      } else {
        uniqueNpcs.push({
          ...npc,
          name: normalizedName
        });
      }
    }

    page.npcs = uniqueNpcs;
  }
}

/**
 * Reconciles incoming and existing NPC files to prevent duplicate / cloned NPC files
 * with slight name variations (e.g. "Garrick-npc.txt" and "BlacksmithGarrick-npc.txt").
 */
export function reconcileNpcFiles(fs: any, incomingFiles?: Record<string, any>): { reconciled: boolean; mergedCount: number } {
  if (!fs) return { reconciled: false, mergedCount: 0 };
  let mergedCount = 0;

  const existingFiles = (typeof fs.list === 'function' ? fs.list() : Object.keys(fs.getAll?.() || {})) as string[];
  const existingNpcFiles = existingFiles.filter(f => f.endsWith('-npc.txt'));

  // 1. Reconcile incoming files against established existing NPC files
  if (incomingFiles && typeof incomingFiles === 'object') {
    const incomingNames = Object.keys(incomingFiles).filter(f => f.endsWith('-npc.txt'));
    for (const inName of incomingNames) {
      const matchExisting = existingNpcFiles.find(ex => ex !== inName && areNpcsSameEntity(ex.replace(/\.txt$/, ''), inName.replace(/\.txt$/, '')));
      if (matchExisting) {
        // Incoming file is a variation of an already established NPC file!
        // Preserve content in the canonical established filename and remove the duplicate variation
        const incomingData = incomingFiles[inName];
        incomingFiles[matchExisting] = incomingData;
        delete incomingFiles[inName];
        if (fs.exists(inName)) {
          fs.delete(inName);
        }
        mergedCount++;
      }
    }
  }

  // 2. Reconcile any existing duplicate NPC files already in the filesystem
  const currentNpcFiles = (typeof fs.list === 'function' ? fs.list() : Object.keys(fs.getAll?.() || {})) as string[];
  const npcFiles = currentNpcFiles.filter(f => f.endsWith('-npc.txt'));
  const visited = new Set<string>();

  for (let i = 0; i < npcFiles.length; i++) {
    const fileA = npcFiles[i];
    if (visited.has(fileA)) continue;

    for (let j = i + 1; j < npcFiles.length; j++) {
      const fileB = npcFiles[j];
      if (visited.has(fileB)) continue;

      if (areNpcsSameEntity(fileA.replace(/\.txt$/, ''), fileB.replace(/\.txt$/, ''))) {
        // Duplicate files found! Keep the cleaner/canonical one (shorter or without underscores)
        const nameA = fileA.replace(/\.txt$/, '');
        const nameB = fileB.replace(/\.txt$/, '');
        const keepA = nameA.length <= nameB.length && !nameA.includes('_');
        const canonicalFile = keepA ? fileA : fileB;
        const duplicateFile = keepA ? fileB : fileA;

        // If duplicate has content and canonical is shorter, preserve the richer content
        const contCanon = fs.read(canonicalFile) || '';
        const contDupe = fs.read(duplicateFile) || '';
        if (contDupe.length > contCanon.length) {
          fs.write(canonicalFile, contDupe);
        }

        fs.delete(duplicateFile);
        visited.add(duplicateFile);
        mergedCount++;
      }
    }
  }

  return { reconciled: mergedCount > 0, mergedCount };
}
