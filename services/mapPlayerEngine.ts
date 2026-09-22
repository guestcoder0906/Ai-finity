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

    const base = f.replace(/\.txt$/, '');
    const lower = base.toLowerCase();

    // Skip NPC files
    if (
      lower.endsWith('-npc') ||
      lower.endsWith('_npc') ||
      lower.includes(' npc') ||
      lower.startsWith('npc-') ||
      lower.startsWith('npc_')
    ) {
      continue;
    }

    let username = '';
    let charName = '';

    if (base.includes('-')) {
      const parts = base.split('-');
      const suffix = parts[parts.length - 1].trim();
      const prefix = parts.slice(0, -1).join('-').trim();

      const suffixLower = suffix.toLowerCase();
      if (suffixLower === 'npc' || suffixLower === 'bot' || suffixLower === 'ai') {
        continue;
      }

      username = suffix;
      charName = prefix || suffix;
    } else {
      const content = fileSystem ? fileSystem.read(f) : null;
      if (content && (content.includes('[NAME & DESCRIPTION]') || content.includes('[STATS & MODIFIERS]'))) {
        const isNpcSheet = /is_npc[:=\s]*true|category[:=\s]*npc|\(npc\)|status:\s*npc/i.test(content);
        if (isNpcSheet) continue;
        username = base;
        charName = base;
      } else {
        continue;
      }
    }

    const uKey = username.toLowerCase();
    if (seenUsernames.has(uKey)) continue;
    seenUsernames.add(uKey);

    let fullName = charName;
    const content = fileSystem ? fileSystem.read(f) : null;
    if (content) {
      const nameMatch = content.match(/[-*•]?\s*(?:Character\s+)?Name\s*[:=]\s*([^\n\r]+)/i);
      if (nameMatch) {
        const rawParsedName = nameMatch[1].replace(/^[*-•\s]+/, '').trim();
        if (rawParsedName && rawParsedName.length > 1) {
          fullName = rawParsedName;
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
      filename: f,
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
        facing: 0
      });
      existingKeys.add(key);
    }
  }
}
