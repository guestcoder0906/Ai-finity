/**
 * Weight, Dimension, Container, and Encumbrance Engine for Aifinity
 *
 * Implements:
 * 1. Standardized parsing for item weights (e.g. "0 weight", "1 pound and 3x5 inches", "5 lbs", "feather 0 weight 3x0 inch")
 * 2. Item & Container dimensions parsing (e.g. "3x0 inch", "18 inches tall by 12 inches area", "18x12x8 inches")
 * 3. Container holding limits and overflow detection (e.g. staff protruding from backpack risking dropping)
 * 4. Character dimensions (Height, Width, Depth) & Body Weight
 * 5. Total carried weight calculation across all equipped items, armor, containers, and inventory inside containers
 * 6. Exclusion of owned/stored items not on person (home, vault, camp, wagon)
 * 7. Encumbrance & Speed: <= 20% good, 21%+ slower speed effect until weight drops below 21%
 * 8. Max lift strength: 100% of body weight for average human with 1.0x strength modifier (anything heavier is impossible)
 * 9. Temporary spell/effect reversions (e.g. lightweight spell on a boulder reverting when expired)
 */

export interface ParsedDimensions {
  height?: number; // inches
  width?: number;  // inches
  depth?: number;  // inches
  raw: string;
  applies: boolean;
  unit: string;
}

export interface ItemInfo {
  name: string;
  weight: number; // lbs
  dimensions: ParsedDimensions;
  category: 'equipped' | 'carried' | 'container' | 'stored';
  containerName?: string;
  location?: string;
  isHiddenLocation?: boolean;
  isFoldable?: boolean;
  isOverflow?: boolean;
  doesNotFit?: boolean;
  fitStatus?: 'fits' | 'overflow' | 'does_not_fit';
  overflowReason?: string;
  rawText: string;
  temporaryEffect?: {
    name: string;
    expires?: string;
    tempWeight: number;
    baseWeight: number;
  };
}

export interface ContainerInfo {
  name: string;
  weight: number; // empty weight in lbs
  dimensions: ParsedDimensions;
  maxDimensions: ParsedDimensions;
  maxWeightCapacity?: number;
  items: ItemInfo[];
  currentItemsWeight: number;
  totalWeight: number; // container weight + items weight
  hasOverflow: boolean;
  hasDoesNotFit?: boolean;
  rawText: string;
}

export interface HeldItemInfo extends ItemInfo {
  holdingLimb?: string; // e.g. "Right Hand", "Left Hand", "Both Hands", "Mouth / Jaws", "Tentacle 1", "Under Arm (Overflow)"
  isOverflowHold?: boolean;
  overflowWarning?: string;
}

export interface HoldingCapacityInfo {
  applies: boolean;
  holdingLimbsDescription: string; // e.g. "2 Hands / Arms", "Jaws / Mouth (Quadruped)", "4 Arms", "None (Limbless/Amorphous)"
  maxStandardHoldCount: number;
  currentHeldCount: number;
  isFull: boolean;
  hasOverflowHold: boolean;
  overflowReason?: string;
  freeSlots: number;
}

export interface CurrencyEntry {
  name: string; // e.g. "Gold Coin", "Silver Coin", "Copper Coin", "Credits", "Bottle Caps", "Dollars"
  amount: number;
  weight?: number; // lbs
  container?: string; // e.g. "Coin Pouch", "Wallet", "Backpack"
  location?: string; // Attached location e.g. "Player's Cottage, Riverwood", "Gringotts Vault 687"
  isHiddenLocation?: boolean; // true if location is wrapped in hide[...]
  rawText: string;
}

export interface CharacterCurrencyData {
  currencyType: string; // e.g. "Gold, Silver, and Copper Coins" or "Credits"
  carriedCurrencies: CurrencyEntry[];
  carriedSummary: string; // e.g. "1 Gold Coin, 5 Silver Coins" or "250 Credits" or "0"
  storedCurrencies: CurrencyEntry[];
  storedSummary: string; // e.g. "150 Gold Coins [Player's Cottage]" or "None"
  totalNetWorthSummary: string;
  hasCurrency: boolean;
}

export interface CharacterPhysicalStats {
  characterName: string;
  username?: string;
  characterType?: string; // e.g. "Slime", "Ghost", "Humanoid", "Golem", "Robot"
  height?: string;
  width?: string;
  depth?: string;
  dimensionsRaw: string;
  dimensionsApply: boolean;
  bodyWeight: number; // lbs, default 160 for human if unspecified
  strengthMultiplier: number; // default 1.0x
  maxLiftStrength: number; // lbs (100% of body weight for 1.0x baseline human)
  baseWalkingSpeed: number; // m/s, default 1.5
  baseRunningSpeed: number; // m/s, default 4.5
  currentWalkingSpeed: number; // m/s
  currentRunningSpeed: number; // m/s
  isEncumbered: boolean;
  encumbranceRatio: number; // carriedWeight / bodyWeight (e.g. 0.18 = 18%)
  encumbranceThreshold: number; // default 20% (0.20) for standard human, or custom / None / immune
  encumbranceApplies: boolean; // false for Slimes, Incorporeal/Ghosts, Telekinetic, or immune entities
  encumbranceImmunityReason?: string; // e.g. "Slime biology absorbs items internally without standard encumbrance/slowing"
  encumbranceEffectDescription: string; // Dynamic description of what carrying weight does to this specific entity
  totalCarriedWeight: number; // lbs
  currency: CharacterCurrencyData;
  isMounted: boolean;
  mountedEntityName?: string;
  mountedStatusDescription?: string;
  passengersOrRiders: Array<{ name: string; weight?: number }>;
  passengerWeight: number;
  currentlyHolding: HeldItemInfo[];
  holdingCapacity: HoldingCapacityInfo;
  containers: ContainerInfo[];
  equippedGear: ItemInfo[];
  carriedItems: ItemInfo[];
  storedItems: ItemInfo[]; // owned, but NOT on person
  activeWeightEffects: Array<{
    name: string;
    expires?: string;
    target: string;
    tempVal: number;
    baseVal: number;
  }>;
}

export class WeightInventoryEngine {
  /**
   * Parses currency entries from lines, item descriptions, and balance notes:
   * e.g.:
   * - "1 Gold Coin, 5 Silver Coins: 0.15 lbs. Container: [Coin Pouch]"
   * - "150 Gold Coins: Location: [Iron Treasure Chest in Player's Cottage]"
   * - "50 Silver Coins: Location: hide[Buried under tree at coords (120, 340)]"
   * - "250 Credits"
   * - "$500" / "500 Dollars"
   * - "Contains: 1 Gold Coin, 5 Silver Coins"
   */
  public static parseCurrencyEntries(
    line: string,
    defaultLocation?: string,
    defaultContainer?: string
  ): CurrencyEntry[] {
    const entries: CurrencyEntry[] = [];
    if (!line || !line.trim()) return entries;

    const trimmed = line.replace(/^[-*•>\s]+/, '').trim();
    const lower = trimmed.toLowerCase();

    // Skip headers or instructions
    if (
      lower.startsWith('currency type:') ||
      lower.startsWith('- currency type:') ||
      lower.startsWith('carried balance') ||
      lower.startsWith('- carried balance') ||
      lower.startsWith('stored / remote balance') ||
      lower.startsWith('- stored / remote balance') ||
      lower.startsWith('stored balance') ||
      lower.startsWith('- stored balance') ||
      lower.startsWith('total carried wealth:') ||
      lower.startsWith('total stored wealth:') ||
      lower.startsWith('total net worth:') ||
      (lower.startsWith('(') && lower.endsWith(')') && !lower.includes('gold') && !lower.includes('coin') && !lower.includes('credit'))
    ) {
      return entries;
    }

    // Extract location if present
    let location = defaultLocation;
    let isHiddenLocation = false;
    const locPattern = /(?:\[\s*)?(?:location|secret)[:=\s]+(hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]|target\([^)]+\)\[[^\]]+\]|hide(?::all)?\[[^\]]+\]|\[[^\]]+\]|[^,;\r\n()]+)/i;
    const locMatch = trimmed.match(locPattern);
    if (locMatch) {
      location = locMatch[1].trim();
      if (/hide[:\[]|target\(/i.test(location)) {
        isHiddenLocation = true;
      }
    } else if (/hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]/i.test(trimmed)) {
      const match = trimmed.match(/hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]/i);
      if (match) {
        location = match[0];
        isHiddenLocation = true;
      }
    } else if (/target\([^)]+\)\[[^\]]+\]/i.test(trimmed)) {
      const match = trimmed.match(/target\([^)]+\)\[[^\]]+\]/i);
      if (match) {
        location = match[0];
        isHiddenLocation = true;
      }
    } else if (trimmed.toLowerCase().includes('hide[')) {
      const hideMatch = trimmed.match(/hide\[([^\]]+)\]/i);
      if (hideMatch) {
        location = `hide[${hideMatch[1].trim()}]`;
        isHiddenLocation = true;
      }
    }

    // Extract container if present
    let container = defaultContainer;
    const contMatch = trimmed.match(/container[:=\s]+\[?([a-zA-Z0-9_\s'-]+)\]?/i);
    if (contMatch) {
      container = contMatch[1].trim();
    } else {
      const bracketMatch = trimmed.match(/\[([a-zA-Z0-9_\s'-]+)\]/i);
      if (bracketMatch && !locMatch) {
        const inner = bracketMatch[1].trim();
        if (/pouch|wallet|purse|backpack|chest|bag|sack/i.test(inner)) {
          container = inner;
        }
      }
    }

    // Extract weight if specified
    let entryWeight: number | undefined;
    const weightMatch = trimmed.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?|kg|grams?)\b/i);
    if (weightMatch) {
      entryWeight = parseFloat(weightMatch[1]);
    }

    let contentToScan = trimmed;
    const containsMatch = trimmed.match(/contains[:=\s]+([^)]+)/i);
    if (containsMatch) {
      contentToScan = containsMatch[1];
    } else {
      contentToScan = contentToScan
        .replace(/location[:=\s]+(?:hide\[[^\]]+\]|\[[^\]]+\]|[^,;\r\n()]+)/gi, '')
        .replace(/container[:=\s]+\[?[a-zA-Z0-9_\s'-]+\]?/gi, '')
        .replace(/:?\s*[0-9]+(?:\.[0-9]+)?\s*(?:lbs?|pounds?|kg|grams?)\b/gi, '');
    }

    // Dollar sign pattern: e.g. "$50", "-$20", "+$100", "$50 Cash", "-$20 (from wallet)"
    const dollarRegex = /[-+]?\s*[$]\s*(\d+(?:,\d+)*(?:\.\d+)?)(?:\s*(cash|dollars?|bucks?|cents?|bills?))?/gi;
    let dMatch;
    while ((dMatch = dollarRegex.exec(contentToScan)) !== null) {
      const dAmt = parseFloat(dMatch[1].replace(/,/g, ''));
      if (!isNaN(dAmt) && dAmt > 0) {
        const subName = dMatch[2] ? (/cash/i.test(dMatch[2]) ? 'Cash' : 'Dollars') : 'Dollars';
        if (!entries.some(e => e.amount === dAmt)) {
          entries.push({
            name: subName,
            amount: dAmt,
            weight: entryWeight,
            container,
            location,
            isHiddenLocation,
            rawText: dMatch[0].trim()
          });
        }
      }
    }

    const currencyRegex = /([-+]?\s*\$?\s*\d+(?:,\d+)*(?:\.\d+)?)\s*([a-zA-Z\s]+?(?:coins?|credits?|creds?|gold|silver|copper|electrum|platinum|dollars?|bucks?|cents?|caps?|crowns?|sovereigns?|ducats?|septims?|yen|euros?|rubles?|rupees?|zenny|gil|pieces?\s+of\s+eight|shillings?|pence|penny)\b)/gi;

    let match;
    while ((match = currencyRegex.exec(contentToScan)) !== null) {
      const rawNum = match[1].replace(/[$,\s+-]/g, '');
      const amt = parseFloat(rawNum);
      const name = match[2].trim();
      if (!isNaN(amt) && amt > 0 && name) {
        const lowerName = name.toLowerCase();
        if (
          lowerName.includes('inch') ||
          lowerName.includes('lbs') ||
          lowerName.includes('pound') ||
          lowerName.includes('weight') ||
          lowerName.includes('tall') ||
          lowerName.includes('wide') ||
          lowerName.includes('depth') ||
          lowerName.includes('m/s') ||
          lowerName.includes('damage') ||
          lowerName.includes('health') ||
          lowerName.includes('mana') ||
          lowerName.includes('stamina') ||
          lowerName.includes('energy') ||
          lowerName.includes('level') ||
          lowerName.includes('slot') ||
          lowerName.includes('round') ||
          lowerName.includes('turn')
        ) {
          continue;
        }

        const cleanName = name.replace(/^of\s+/i, '').trim();

        if (!entries.some(e => e.amount === amt && (e.name.toLowerCase() === cleanName.toLowerCase() || (e.name === 'Dollars' && /dollar/i.test(cleanName))))) {
          entries.push({
            name: cleanName,
            amount: amt,
            weight: entryWeight,
            container,
            location,
            isHiddenLocation,
            rawText: match[0].trim()
          });
        }
      }
    }

    // Also support prefix currency format: e.g. "Cash: $50" or "Gold Coins: 25" or "Money: $100"
    const prefixRegex = /\b(cash|money|dollars?|coins?|gold\s+coins?|silver\s+coins?|copper\s+coins?|credits?|funds?)\s*[:=]\s*\$?\s*(\d+(?:,\d+)*(?:\.\d+)?)/gi;
    let pMatch;
    while ((pMatch = prefixRegex.exec(contentToScan)) !== null) {
      const pName = pMatch[1].trim();
      const pAmt = parseFloat(pMatch[2].replace(/,/g, ''));
      if (!isNaN(pAmt) && pAmt > 0) {
        const cleanName = /cash|money/i.test(pName) ? 'Cash' : pName;
        if (!entries.some(e => e.amount === pAmt && e.name.toLowerCase() === cleanName.toLowerCase())) {
          entries.push({
            name: cleanName,
            amount: pAmt,
            weight: entryWeight,
            container,
            location,
            isHiddenLocation,
            rawText: pMatch[0].trim()
          });
        }
      }
    }

    return entries;
  }

  /**
   * Formats a list of currency entries into a clean aggregated summary string:
   * e.g. "1 Gold Coin, 5 Silver Coins" or "250 Credits" or "0"
   */
  public static formatCurrencySummary(entries: CurrencyEntry[]): string {
    if (!entries || entries.length === 0) return '0';
    const totals: { [name: string]: number } = {};
    for (const e of entries) {
      let norm = e.name;
      if (e.amount === 1) {
        norm = norm.replace(/\bCoins\b/i, 'Coin').replace(/\bCredits\b/i, 'Credit').replace(/\bDollars\b/i, 'Dollar');
      } else {
        if (!norm.toLowerCase().endsWith('s') && !norm.toLowerCase().endsWith('coin') && !norm.toLowerCase().endsWith('credit')) {
          norm = `${norm}s`;
        } else if (norm.toLowerCase().endsWith('coin')) {
          norm = `${norm}s`;
        }
      }
      totals[norm] = (totals[norm] || 0) + e.amount;
    }
    const parts = Object.entries(totals).map(([name, amt]) => `${amt.toLocaleString()} ${name}`);
    return parts.length > 0 ? parts.join(', ') : '0';
  }

  /**
   * Parses weights in diverse formats:
   * - "feather 0 weight 3x0 inch" -> 0
   * - "Medium geode 1 pound and 3x5 inches" -> 1
   * - "2.5 lbs", "2.5 lb", "2.5 pounds", "10 kg", "500 grams", "0 weight", "None"
   */
  public static parseWeight(text: string): { weight: number; applies: boolean } {
    if (!text) return { weight: 0, applies: false };
    const lower = text.toLowerCase().trim();

    if (
      lower.includes('none') ||
      lower.includes('incorporeal') ||
      lower.includes('ghost') ||
      lower.includes('intangible') ||
      lower.includes('energy') ||
      lower.includes('formless')
    ) {
      return { weight: 0, applies: false };
    }

    // Pattern 1: "X weight" or "0 weight"
    const weightWordMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:weight)/);
    if (weightWordMatch) {
      return { weight: parseFloat(weightWordMatch[1]), applies: true };
    }

    // Pattern 2: "X pound(s)" or "X lbs" or "X lb"
    const poundMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?)/);
    if (poundMatch) {
      return { weight: parseFloat(poundMatch[1]), applies: true };
    }

    // Pattern 3: "Weight:\s*X"
    const colonWeightMatch = lower.match(/(?:weight|wt)[:=]\s*([0-9]+(?:\.[0-9]+)?)/);
    if (colonWeightMatch) {
      return { weight: parseFloat(colonWeightMatch[1]), applies: true };
    }

    // Pattern 4: Kilograms "X kg"
    const kgMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:kg|kilograms?)/);
    if (kgMatch) {
      return { weight: parseFloat(kgMatch[1]) * 2.20462, applies: true };
    }

    // Pattern 5: Grams "X grams" / "X g"
    const gMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:grams?|g\b)/);
    if (gMatch) {
      return { weight: parseFloat(gMatch[1]) * 0.00220462, applies: true };
    }

    // Pattern 6: Ounces "X oz"
    const ozMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:oz|ounces?)/);
    if (ozMatch) {
      return { weight: parseFloat(ozMatch[1]) * 0.0625, applies: true };
    }

    // Standalone number before/after common text
    const standaloneMatch = lower.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:and|,|\/|$)/);
    if (standaloneMatch && (lower.includes('weight') || lower.includes('heavy'))) {
      return { weight: parseFloat(standaloneMatch[1]), applies: true };
    }

    return { weight: 0, applies: true };
  }

  /**
   * Parses dimensions in diverse formats:
   * - "3x0 inch", "3x5 inches", "18x12 inches", "18x12x8 inches"
   * - "18 inches tall by 12 inches area", "18 inches tall x 12 inches width"
   * - "Height: 5'11", Width: 20", Depth: 12""
   * - "None" or "Incorporeal"
   */
  public static parseDimensions(text: string): ParsedDimensions {
    if (!text) return { raw: 'None', applies: false, unit: 'inches' };
    const lower = text.toLowerCase().trim();

    if (
      lower.includes('none') ||
      lower.includes('incorporeal') ||
      lower.includes('ghost') ||
      lower.includes('formless')
    ) {
      return { raw: text, applies: false, unit: 'inches' };
    }

    let height: number | undefined;
    let width: number | undefined;
    let depth: number | undefined;

    // Pattern A: "18 inches tall by 12 inches area/wide" or "18 tall x 12 wide x 8 deep"
    const tallByMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches)?\s*(?:tall|height|long|length)\s*(?:by|x|\band\b)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches)?\s*(?:area|wide|width)?(?:\s*(?:by|x|\band\b)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches)?\s*(?:deep|depth)?)?/);
    if (tallByMatch) {
      height = parseFloat(tallByMatch[1]);
      width = parseFloat(tallByMatch[2]);
      if (tallByMatch[3]) depth = parseFloat(tallByMatch[3]);
      return { height, width, depth, raw: tallByMatch[0].trim(), applies: true, unit: 'inches' };
    }

    // Pattern B: "3x5x8" or "3x5" or "3 x 5 inches" or "3x0 inch"
    const xPattern = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*x\s*([0-9]+(?:\.[0-9]+)?)(?:\s*x\s*([0-9]+(?:\.[0-9]+)?))?\s*(?:in|inch|inches|cm|m|ft)?/);
    if (xPattern) {
      const dim1 = parseFloat(xPattern[1]);
      const dim2 = parseFloat(xPattern[2]);
      const dim3 = xPattern[3] ? parseFloat(xPattern[3]) : undefined;
      const cleanRaw = dim3 !== undefined ? `${dim1}x${dim2}x${dim3} inches` : `${dim1}x${dim2} inches`;
      return { height: dim1, width: dim2, depth: dim3, raw: cleanRaw, applies: true, unit: 'inches' };
    }

    // Pattern C: "Height: 5'11", Width: 20", Depth: 12"" or "Height: 6ft, Width: 2ft"
    const hMatch = lower.match(/height[:=\s]+([0-9]+)'?([0-9]+)?"?|\bheight[:=\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:ft|feet|cm|m|in|inches)?/);
    if (hMatch) {
      if (hMatch[1] && hMatch[2]) {
        height = parseInt(hMatch[1]) * 12 + parseInt(hMatch[2]);
      } else if (hMatch[3]) {
        height = parseFloat(hMatch[3]);
        if (lower.includes('ft') || lower.includes('feet')) height *= 12;
        if (lower.includes('cm')) height /= 2.54;
        if (lower.includes('m') && !lower.includes('cm')) height *= 39.37;
      }
    }

    const wMatch = lower.match(/width[:=\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches|cm|m|ft)?/);
    if (wMatch) {
      width = parseFloat(wMatch[1]);
      if (lower.includes('ft')) width *= 12;
      if (lower.includes('cm')) width /= 2.54;
    }

    const dMatch = lower.match(/depth[:=\s]+([0-9]+(?:\.[0-9]+)?)\s*(?:in|inch|inches|cm|m|ft)?/);
    if (dMatch) {
      depth = parseFloat(dMatch[1]);
      if (lower.includes('ft')) depth *= 12;
      if (lower.includes('cm')) depth /= 2.54;
    }

    let cleanRaw = 'None';
    if (height !== undefined || width !== undefined || depth !== undefined) {
      const parts: string[] = [];
      if (height !== undefined) parts.push(`${height}"H`);
      if (width !== undefined) parts.push(`${width}"W`);
      if (depth !== undefined) parts.push(`${depth}"D`);
      cleanRaw = parts.join(' x ');
    } else {
      const dimMatch = text.match(/dimensions?[:=\s]+([^,;()\n]+)/i);
      if (dimMatch) {
        cleanRaw = dimMatch[1].trim();
      } else if (text.length <= 25 && !text.includes(':') && !text.toLowerCase().includes('overflow')) {
        cleanRaw = text.trim();
      } else {
        cleanRaw = 'Standard size';
      }
    }

    return {
      height,
      width,
      depth,
      raw: cleanRaw,
      applies: height !== undefined || width !== undefined || depth !== undefined || !lower.includes('none'),
      unit: 'inches'
    };
  }

  /**
   * Unwraps recursively nested held item strings and detects the true holding limb and item description.
   * Cleans chains like "Hands: Weight: 0.2 lbs. Dimensions: Hands: Weight: ... Held in Jaws: ... Red Rubber Ball..."
   * Also filters out rule lines, mandates, status headers, and repeated overflow warnings.
   */
  public static unwrapHeldItem(rawText: string, defaultLimb: string = 'Hands'): { cleanText: string; holdingLimb: string; isOverflow: boolean } | null {
    let text = rawText.trim().replace(/^[-*•>\s]+/, '').trim();
    const lower = text.toLowerCase();

    // 1. Immediately reject rule / mandate / guideline / capacity / header lines
    if (
      lower.startsWith('holding anatomy') ||
      lower.startsWith('holding capacity') ||
      lower.startsWith('capacity & status') ||
      lower.startsWith('capacity status') ||
      lower.startsWith('holding status') ||
      lower.startsWith('- capacity') ||
      lower.startsWith('capacity:') ||
      lower.startsWith('items currently held') ||
      lower.startsWith('held items') ||
      lower.startsWith('currently holding') ||
      lower.includes('overflow rule') ||
      lower.includes('dynamic overflow') ||
      lower.includes('weight mandate') ||
      lower.includes('capacity mandate') ||
      lower.includes('holding mandate') ||
      lower.includes('weight & capacity') ||
      lower.includes('cannot hold additional') ||
      lower.includes('occupied by') ||
      lower.includes('without dropping') ||
      lower.includes('(none') ||
      lower.includes('appendages free') ||
      lower.includes('hands free') ||
      lower === 'none' ||
      lower === '(none)'
    ) {
      return null;
    }

    let detectedLimb = defaultLimb;
    let explicitOverflow = false;

    // Detect if "Held in Jaws", "Jaws", "Mouth", "Right Hand", "Left Hand", etc. is mentioned in the line
    const limbSearch = text.match(/\b(held\s+in\s+jaws?|held\s+in\s+mouth|held\s+in\s+teeth|held\s+in\s+beak|held\s+in\s+talons?|held\s+in\s+hands?|in\s+jaws?|in\s+mouth|both\s+hands\s*(?:\(two-handed\))?|two[- ]handed|right\s+hand|left\s+hand|main\s+hand|off\s+hand|jaws?|mouth|teeth|beak|talons?|tentacles?\s*\d*|claws?\s*\d*|under\s+arm(?:\s*\(overflow\))?|overflow\s+hold|hands?)\b/i);
    if (limbSearch) {
      const matchLower = limbSearch[1].toLowerCase();
      if (matchLower.includes('jaw') || matchLower.includes('mouth') || matchLower.includes('teeth')) {
        detectedLimb = 'Held in Jaws';
      } else if (matchLower.includes('both hands') || matchLower.includes('two-handed')) {
        detectedLimb = 'Both Hands (Two-Handed)';
      } else if (matchLower.includes('right hand')) {
        detectedLimb = 'Right Hand';
      } else if (matchLower.includes('left hand')) {
        detectedLimb = 'Left Hand';
      } else if (matchLower.includes('main hand')) {
        detectedLimb = 'Main Hand';
      } else if (matchLower.includes('off hand')) {
        detectedLimb = 'Off Hand';
      } else if (matchLower.includes('beak')) {
        detectedLimb = 'Beak';
      } else if (matchLower.includes('talon')) {
        detectedLimb = 'Talons';
      } else if (matchLower.includes('tentacle')) {
        detectedLimb = 'Tentacles';
      } else if (matchLower.includes('claws')) {
        detectedLimb = 'Claws';
      } else if (matchLower.includes('overflow') || matchLower.includes('under arm')) {
        detectedLimb = 'Overflow Hold';
        explicitOverflow = true;
      } else if (matchLower.includes('hand')) {
        detectedLimb = defaultLimb.toLowerCase().includes('jaw') || defaultLimb.toLowerCase().includes('mouth') ? defaultLimb : 'Hands';
      }
    }

    // 2. Iteratively strip leading limb and weight/dimensions wrapper prefixes
    let prevText = '';
    while (text !== prevText) {
      prevText = text;
      text = text
        .replace(/^(?:[-*•>\s]*)(?:\[)?(?:right\s*hand|left\s*hand|main\s*hand|off\s*hand|both\s*hands|two[- ]handed|hands?|jaws?|mouth|teeth|talons?|beak|tentacles?\s*\d*|claws?\s*\d*|trunk|held\s*in\s*jaws?|held\s*in\s*mouth|held\s*in\s*teeth|held\s*in\s*hands?|held\s*in\s*beak|held\s*in\s*talons?|in\s*jaws?|in\s*mouth|overflow\s*hold|under\s*arm)(?:\])?\s*[:=-]\s*/i, '')
        .replace(/^weight\s*[:=]\s*[0-9.]+\s*lbs?\.?\s*(?:dimensions?\s*[:=]\s*)?/i, '')
        .replace(/^dimensions?\s*[:=]\s*/i, '')
        .trim();
    }

    // 3. Strip trailing repeated overflow warnings
    text = text.replace(/(?:\s*\.?\s*\(Overflow:\s*Yes[^)]*\))+/gi, '').trim();
    // Clean multiple trailing periods
    text = text.replace(/\.{2,}$/, '.').trim();

    // 4. Check if the remaining core text is a rule, mandate, or empty
    const cleanLower = text.toLowerCase();
    if (
      cleanLower.startsWith('dynamic overflow rule') ||
      cleanLower.startsWith('weight & capacity mandate') ||
      cleanLower.startsWith('overflow rule') ||
      cleanLower.startsWith('weight mandate') ||
      cleanLower.startsWith('capacity mandate') ||
      cleanLower.includes('jaws are occupied') ||
      cleanLower.includes('held in jaws..') ||
      cleanLower.includes('held in mouth without dropping') ||
      cleanLower === 'hands' ||
      cleanLower === 'hand' ||
      cleanLower === ''
    ) {
      return null;
    }

    return {
      cleanText: text,
      holdingLimb: detectedLimb,
      isOverflow: explicitOverflow
    };
  }

  /**
   * Determines whether an item is pliable, flexible, or foldable (e.g. leather tunic, cloth clothing,
   * cloaks, robes, bedrolls, blankets, ropes, bandages, parchment) versus a rigid item
   * (e.g. iron armor, steel plate, breastplate, shield, helmet, sword, staff, chest).
   *
   * Foldable items fold and compress to fit inside containers and do NOT cause overflow
   * simply because their flat unfolded dimensions exceed the container dimensions.
   */
  public static isFoldableItem(name: string, rawText: string = ''): boolean {
    const text = `${name} ${rawText}`.toLowerCase();

    // Explicit rigidity markers
    if (
      text.includes('rigid') ||
      text.includes('inflexible') ||
      text.includes('unbendable') ||
      text.includes('solid metal') ||
      text.includes('solid wood') ||
      text.includes('solid stone')
    ) {
      return false;
    }

    // Explicit foldability markers
    if (
      text.includes('foldable') ||
      text.includes('folded') ||
      text.includes('flexible') ||
      text.includes('pliable') ||
      text.includes('rollable') ||
      text.includes('rolled') ||
      text.includes('soft')
    ) {
      return true;
    }

    // Rigid armor & items (cannot fold down to fit)
    if (
      text.includes('iron armor') ||
      text.includes('steel armor') ||
      text.includes('plate armor') ||
      text.includes('breastplate') ||
      text.includes('cuirass') ||
      text.includes('full plate') ||
      text.includes('plate mail') ||
      text.includes('metal armor') ||
      text.includes('chainmail') ||
      text.includes('shield') ||
      text.includes('helmet') ||
      text.includes('helm') ||
      text.includes('greathelm') ||
      text.includes('sword') ||
      text.includes('blade') ||
      text.includes('staff') ||
      text.includes('stave') ||
      text.includes('spear') ||
      text.includes('polearm') ||
      text.includes('halberd') ||
      text.includes('mace') ||
      text.includes('warhammer') ||
      text.includes('bow') ||
      text.includes('crossbow') ||
      text.includes('chest') ||
      text.includes('crate') ||
      text.includes('vial') ||
      text.includes('bottle') ||
      text.includes('flask') ||
      text.includes('ingot') ||
      text.includes('anvil') ||
      text.includes('statue') ||
      text.includes('lantern')
    ) {
      return false;
    }

    // Pliable/foldable clothing and soft gear
    if (
      text.includes('tunic') || // e.g. "Reinforced Leather Tunic"
      text.includes('leather tunic') ||
      text.includes('leather jacket') ||
      text.includes('leather vest') ||
      text.includes('robe') ||
      text.includes('cloak') ||
      text.includes('cape') ||
      text.includes('shirt') ||
      text.includes('pants') ||
      text.includes('trousers') ||
      text.includes('vest') ||
      text.includes('garment') ||
      text.includes('clothing') ||
      text.includes('clothes') ||
      text.includes('dress') ||
      text.includes('skirt') ||
      text.includes('shawl') ||
      text.includes('scarf') ||
      text.includes('blanket') ||
      text.includes('bedroll') ||
      text.includes('sleeping bag') ||
      text.includes('cloth') ||
      text.includes('fabric') ||
      text.includes('linen') ||
      text.includes('silk') ||
      text.includes('cotton') ||
      text.includes('wool') ||
      text.includes('pelt') ||
      text.includes('hide') ||
      text.includes('fur') ||
      text.includes('rope') ||
      text.includes('bandages') ||
      text.includes('bandage') ||
      text.includes('parchment') ||
      text.includes('paper') ||
      text.includes('scroll') ||
      text.includes('sack') ||
      text.includes('pouch') ||
      text.includes('bag')
    ) {
      return true;
    }

    // Leather items without plate/rigid terms are pliable
    if (text.includes('leather') && !text.includes('hardened plate') && !text.includes('rigid')) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates container fit and overflow:
   * 1. Foldable items (leather tunic, cloth clothing, robes, cloaks, blankets) fold and compress
   *    to fit inside containers without overflowing, provided total container volume/weight is not exceeded.
   * 2. Rigid items (iron armor, plate, shields, staves, spears) cannot fold.
   * 3. Cannot Fit Rule: "If an item has all dimensions bigger than smallest dimension of the container
   *    then it doesn't fit at all in first place." (i.e. even its smallest dimension exceeds the container's
   *    smallest dimension; it cannot enter or fit inside).
   * 4. Protruding Overflow Rule: If a rigid item can enter (its cross section fits through the opening),
   *    but its length exceeds container depth (e.g. 60-inch staff in 18-inch backpack), it protrudes/overflows
   *    and risks dropping during movement or combat.
   */
  public static checkContainerFit(
    item: { name: string; weight?: number; dimensions: ParsedDimensions; rawText?: string },
    containerMaxDim: ParsedDimensions,
    containerCapacity?: { maxWeight?: number; currentWeight?: number }
  ): {
    canFit: boolean;
    isOverflow: boolean;
    doesNotFit: boolean;
    isFoldable: boolean;
    status: 'fits' | 'overflow' | 'does_not_fit';
    reason?: string;
  } {
    const rawText = (item.rawText || '').toLowerCase();
    const isFoldable = this.isFoldableItem(item.name, item.rawText);

    // Check explicit narrative tags in raw text
    if (rawText.includes('does not fit') || rawText.includes('cannot fit') || rawText.includes('too big to enter')) {
      return {
        canFit: false,
        isOverflow: false,
        doesNotFit: true,
        isFoldable,
        status: 'does_not_fit',
        reason: 'Item explicitly does not fit inside container.'
      };
    }
    if (rawText.includes('overflow: yes') || rawText.includes('overflowing') || rawText.includes('sticks out') || rawText.includes('protruding')) {
      return {
        canFit: true,
        isOverflow: true,
        doesNotFit: false,
        isFoldable,
        status: 'overflow',
        reason: 'Item protrudes from container opening; risks falling or dropping.'
      };
    }

    if (!item.dimensions.applies || !containerMaxDim.applies) {
      return { canFit: true, isOverflow: false, doesNotFit: false, isFoldable, status: 'fits' };
    }

    const itemDims = [item.dimensions.height || 0, item.dimensions.width || 0, item.dimensions.depth || 0]
      .filter(d => d > 0)
      .sort((a, b) => b - a);
    const contDims = [containerMaxDim.height || 0, containerMaxDim.width || 0, containerMaxDim.depth || 0]
      .filter(d => d > 0)
      .sort((a, b) => b - a);

    if (itemDims.length === 0 || contDims.length === 0) {
      return { canFit: true, isOverflow: false, doesNotFit: false, isFoldable, status: 'fits' };
    }

    const cMax = contDims[0];
    const cMid = contDims.length > 1 ? contDims[1] : contDims[0];
    const cMin = contDims[contDims.length - 1]; // Smallest dimension of the container!

    // Check container weight limit if provided
    if (containerCapacity?.maxWeight && containerCapacity.maxWeight > 0) {
      const current = containerCapacity.currentWeight || 0;
      const itWeight = item.weight || 0;
      if (current + itWeight > containerCapacity.maxWeight) {
        return {
          canFit: true,
          isOverflow: true,
          doesNotFit: false,
          isFoldable,
          status: 'overflow',
          reason: `Container weight capacity exceeded (${current + itWeight} lbs > ${containerCapacity.maxWeight} lbs max).`
        };
      }
    }

    // 1. Foldable / Pliable items (e.g. Leather Tunic, Cloak, Robes, Clothes, Blankets, Ropes)
    if (isFoldable) {
      // Foldable items fold and compress to fit inside typical containers.
      // They do NOT overflow simply because flat unfolded length/width exceeds the container.
      const itemVol = itemDims.reduce((a, b) => a * b, 1);
      const contVol = contDims.reduce((a, b) => a * b, 1);

      // Only if raw uncompressed material volume itself exceeds the container internal volume by a wide margin
      if (contVol > 0 && itemVol > contVol * 1.5) {
        return {
          canFit: false,
          isOverflow: false,
          doesNotFit: true,
          isFoldable: true,
          status: 'does_not_fit',
          reason: `Folded volume of item exceeds total container volume.`
        };
      }

      return {
        canFit: true,
        isOverflow: false,
        doesNotFit: false,
        isFoldable: true,
        status: 'fits',
        reason: 'Item is flexible and folds cleanly to fit inside container.'
      };
    }

    // 2. Rigid items (e.g. Iron Armor, Steel Breastplate, Shield, Staff, Spear, Greatsword, Chest)
    // CRITICAL MANDATE: "If an item has all dimensions bigger than smallest dimension of the container then it doesn't fit at all in first place."
    const allDimsExceedCMin = itemDims.every(d => d > cMin);
    if (allDimsExceedCMin) {
      return {
        canFit: false,
        isOverflow: false,
        doesNotFit: true,
        isFoldable: false,
        status: 'does_not_fit',
        reason: `Rigid item has all dimensions (${itemDims.join('x')}") larger than container's smallest dimension (${cMin}"). It cannot enter or fit in the container at all!`
      };
    }

    const iMax = itemDims[0];
    const iMid = itemDims.length > 1 ? itemDims[1] : itemDims[0];

    // Check if the rigid item's cross-section is too wide to enter the container opening
    if (iMid > cMid && iMid > cMax) {
      return {
        canFit: false,
        isOverflow: false,
        doesNotFit: true,
        isFoldable: false,
        status: 'does_not_fit',
        reason: `Rigid item cannot fold; width (${iMid}") exceeds container opening (${cMid}"). Does not fit in container.`
      };
    }

    // If rigid item can enter the opening, but its length exceeds container depth/max dimension:
    // It cannot fold down, so it protrudes/overflows out the opening (e.g. staff, spear, greatsword sticking out of backpack).
    if (cMax > 0 && iMax > cMax) {
      return {
        canFit: true,
        isOverflow: true,
        doesNotFit: false,
        isFoldable: false,
        status: 'overflow',
        reason: `Rigid item cannot fold; length (${iMax}") exceeds container depth (${cMax}"). It protrudes out of the container and risks dropping!`
      };
    }

    return {
      canFit: true,
      isOverflow: false,
      doesNotFit: false,
      isFoldable: false,
      status: 'fits'
    };
  }

  /**
   * Backwards-compatible checkOverflow delegating to checkContainerFit.
   */
  public static checkOverflow(
    itemDimOrItem: ParsedDimensions | { name: string; weight?: number; dimensions: ParsedDimensions; rawText?: string },
    containerMaxDim: ParsedDimensions,
    itemName?: string
  ): {
    isOverflow: boolean;
    doesNotFit?: boolean;
    canFit?: boolean;
    isFoldable?: boolean;
    reason?: string;
  } {
    const item = 'raw' in itemDimOrItem && 'applies' in itemDimOrItem
      ? { name: itemName || 'Item', dimensions: itemDimOrItem as ParsedDimensions }
      : itemDimOrItem as { name: string; weight?: number; dimensions: ParsedDimensions; rawText?: string };

    const fit = this.checkContainerFit(item, containerMaxDim);
    return {
      isOverflow: fit.isOverflow,
      doesNotFit: fit.doesNotFit,
      canFit: fit.canFit,
      isFoldable: fit.isFoldable,
      reason: fit.reason
    };
  }

  /**
   * Intelligently finds the container matching a target container name.
   * Handles partial matching, keyword matching (backpack, pouch, satchel, etc.),
   * and falls back gracefully to the first available container.
   */
  public static findMatchingContainer(containers: ContainerInfo[], targetName?: string): ContainerInfo | undefined {
    if (!containers || containers.length === 0) return undefined;
    if (!targetName || !targetName.trim()) return undefined;

    const target = targetName.trim().toLowerCase();

    // 1. Exact match (case insensitive)
    const exact = containers.find(c => c.name.toLowerCase() === target);
    if (exact) return exact;

    // 2. Contains match (either container name contains target or target contains container name)
    const contains = containers.find(c => {
      const cName = c.name.toLowerCase();
      return cName.includes(target) || target.includes(cName);
    });
    if (contains) return contains;

    // 3. Keyword matching (backpack, satchel, pouch, bag, sack, quiver, chest, etc.)
    const keywords = ['backpack', 'satchel', 'pouch', 'sack', 'bag', 'haversack', 'rucksack', 'chest', 'quiver', 'bandolier', 'scabbard', 'pocket', 'trunk', 'crate', 'case', 'holster'];
    const matchedKey = keywords.find(k => target.includes(k));
    if (matchedKey) {
      const keyMatch = containers.find(c => c.name.toLowerCase().includes(matchedKey));
      if (keyMatch) return keyMatch;
    }

    return undefined;
  }

  /**
   * Parses an item line, extracting name, weight, dimensions, container, and overflow notes.
   * Example lines:
   * - "feather 0 weight 3x0 inch"
   * - "Medium geode 1 pound and 3x5 inches"
   * - "- Iron Dagger: 2 lbs, 12x2 inches. Container: Backpack"
   * - "Staff of Power: Weight: 4 lbs. Dimensions: 60x2x2 inches. Container: Backpack (Overflow: Yes - sticks out)"
   */
  public static parseItemLine(line: string, defaultContainer?: string): ItemInfo | null {
    const trimmed = line.trim().replace(/^[-*•>]\s*/, '');
    if (!trimmed || trimmed.startsWith('[') && trimmed.endsWith(']')) return null;

    // Check if it's a category header or section line
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith('equipped:') ||
      lower.startsWith('items:') ||
      lower.startsWith('containers:') ||
      lower.startsWith('total carried weight') ||
      lower.startsWith('encumbrance') ||
      lower === 'none' ||
      lower === '(none)' ||
      lower === 'none.' ||
      lower === '0 lbs' ||
      lower.startsWith('0 lbs (none') ||
      lower.startsWith('0 lbs (none)') ||
      lower.startsWith('(none)') ||
      lower.startsWith('created character file') ||
      lower.startsWith('created file') ||
      lower.startsWith('updated file') ||
      lower.startsWith('saved file') ||
      lower.startsWith('tool result') ||
      lower.includes('created character file') ||
      lower.startsWith('holding anatomy') ||
      lower.startsWith('holding capacity') ||
      lower.startsWith('items currently held') ||
      lower.startsWith('currently holding') ||
      lower.includes('overflow rule') ||
      lower.includes('dynamic overflow') ||
      lower.includes('weight mandate') ||
      lower.includes('capacity mandate') ||
      lower.includes('holding mandate') ||
      lower.includes('weight & capacity') ||
      lower.includes('cannot hold additional') ||
      lower.includes('occupied by') ||
      lower.includes('without dropping')
    ) {
      return null;
    }

    // Extract item name
    let name = '';
    let rest = trimmed;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      name = trimmed.substring(0, colonIdx).trim();
      rest = trimmed.substring(colonIdx + 1).trim();
    } else {
      // e.g. "feather 0 weight 3x0 inch"
      const weightIdx = trimmed.search(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:weight|pound|lbs?|kg|oz)/i);
      if (weightIdx > 0) {
        name = trimmed.substring(0, weightIdx).trim();
        rest = trimmed.substring(weightIdx).trim();
      } else {
        name = trimmed.split(/[(,]/)[0].trim();
      }
    }

    // If the extracted "name" is actually a limb prefix (e.g. "Hands", "Held in Jaws"), strip it and continue extracting the real item name from rest
    const isLimbPrefix = /^(?:(?:right|left|main|off|both)?\s*hands?|jaws?|mouth|teeth|talons?|beak|claws?|tentacles?|trunk|held\s+in\s+jaws?|held\s+in\s+mouth|held\s+in\s+teeth|held\s+in\s+hands?|in\s+jaws?|in\s+mouth|overflow\s+hold)$/i.test(name);
    if (isLimbPrefix) {
      while (/^(?:(?:right|left|main|off|both)?\s*hands?|jaws?|mouth|teeth|talons?|beak|held\s+in\s+jaws?|held\s+in\s+mouth|held\s+in\s+hands?|overflow\s+hold|weight\s*[:=]\s*[0-9.]+\s*lbs?\.?\s*dimensions?\s*[:=]?)\s*[:=-]?\s*/i.test(rest)) {
        rest = rest.replace(/^(?:(?:right|left|main|off|both)?\s*hands?|jaws?|mouth|teeth|talons?|beak|held\s+in\s+jaws?|held\s+in\s+mouth|held\s+in\s+hands?|overflow\s+hold|weight\s*[:=]\s*[0-9.]+\s*lbs?\.?\s*dimensions?\s*[:=]?)\s*[:=-]?\s*/i, '').trim();
      }
      const nextColon = rest.indexOf(':');
      if (nextColon > 0 && nextColon < 40) {
        name = rest.substring(0, nextColon).trim();
        rest = rest.substring(nextColon + 1).trim();
      } else {
        const nextWeight = rest.search(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:weight|pound|lbs?|kg|oz)/i);
        if (nextWeight > 0) {
          name = rest.substring(0, nextWeight).trim();
          rest = rest.substring(nextWeight).trim();
        } else {
          name = rest.split(/[(,]/)[0].trim();
        }
      }
    }

    if (
      !name ||
      name.toLowerCase() === 'none' ||
      name.toLowerCase() === '0 lbs' ||
      name.toLowerCase() === 'hands' ||
      name.toLowerCase() === 'hand' ||
      name.toLowerCase().includes('overflow rule') ||
      name.toLowerCase().includes('weight mandate') ||
      name.toLowerCase().includes('capacity mandate') ||
      name.toLowerCase().includes('holding mandate') ||
      name.toLowerCase().includes('weight & capacity')
    ) {
      return null;
    }

    // Parse weight
    const weightResult = this.parseWeight(rest);
    let weight = weightResult.weight;

    // Check for temporary effect inside item text:
    // e.g. [Status:Lightweight(Expires: 3:00 PM; TempWeight: 1 lb; BaseWeight: 500 lbs)]
    let temporaryEffect: ItemInfo['temporaryEffect'] | undefined;
    const statusMatch = rest.match(/\[Status:([^()]+)\(([^)]+)\)\]/i);
    if (statusMatch) {
      const effectName = statusMatch[1];
      const effectBody = statusMatch[2];
      const tempMatch = effectBody.match(/tempweight[:=\s]*([0-9]+(?:\.[0-9]+)?)/i);
      const baseMatch = effectBody.match(/baseweight[:=\s]*([0-9]+(?:\.[0-9]+)?)/i);
      const expMatch = effectBody.match(/expires[:=\s]*([^;)]+)/i);

      if (tempMatch && baseMatch) {
        const tempW = parseFloat(tempMatch[1]);
        const baseW = parseFloat(baseMatch[1]);
        weight = tempW; // active weight is the temporary weight
        temporaryEffect = {
          name: effectName,
          expires: expMatch ? expMatch[1].trim() : undefined,
          tempWeight: tempW,
          baseWeight: baseW
        };
      }
    }

    // Parse dimensions
    const dimensions = this.parseDimensions(rest);

    // Check foldability
    const isFoldable = this.isFoldableItem(name, line);

    // Parse container
    let containerName = defaultContainer;
    const containerMatch = rest.match(/container[:=\s]*\[?([a-zA-Z0-9_\s'-]+)\]?/i);
    if (containerMatch) {
      containerName = containerMatch[1].trim();
    } else {
      const insideMatch = rest.match(/(?:inside|in container|stored in|in:)\s*\[?([a-zA-Z0-9_\s'-]+)\]?/i);
      if (insideMatch) {
        containerName = insideMatch[1].trim();
      } else {
        const bracketMatch = rest.match(/\[([a-zA-Z0-9_\s'-]+)\]/i);
        if (bracketMatch) {
          const inner = bracketMatch[1].trim().toLowerCase();
          if (inner.includes('backpack') || inner.includes('pouch') || inner.includes('satchel') || inner.includes('bag') || inner.includes('sack') || inner.includes('chest') || inner.includes('quiver') || inner.includes('haversack')) {
            containerName = bracketMatch[1].trim();
          }
        } else {
          const parenMatch = rest.match(/\((?:in:?\s*)?([A-Za-z0-9\s'-]+(?:backpack|pouch|satchel|bag|chest|sack|quiver|haversack|case)[A-Za-z0-9\s'-]*)\)/i);
          if (parenMatch) {
            containerName = parenMatch[1].replace(/^(?:in|inside|stored in)\s+/i, '').trim();
          }
        }
      }
    }

    // Parse location (especially for stored items or remote caches)
    let location: string | undefined;
    let isHiddenLocation = false;
    const locPattern = /(?:\[\s*)?(?:location|secret)[:=\s]+(hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]|target\([^)]+\)\[[^\]]+\]|hide(?::all)?\[[^\]]+\]|\[[^\]]+\]|[^,;\r\n()]+)/i;
    const locMatch = rest.match(locPattern);
    if (locMatch) {
      location = locMatch[1].trim();
      if (/hide[:\[]|target\(/i.test(location)) {
        isHiddenLocation = true;
      }
    } else if (/hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]/i.test(rest)) {
      const match = rest.match(/hide:(?:besides|except|for)\([^)]+\)\[[^\]]+\]/i);
      if (match) {
        location = match[0];
        isHiddenLocation = true;
      }
    } else if (/target\([^)]+\)\[[^\]]+\]/i.test(rest)) {
      const match = rest.match(/target\([^)]+\)\[[^\]]+\]/i);
      if (match) {
        location = match[0];
        isHiddenLocation = true;
      }
    } else if (rest.toLowerCase().includes('hide[')) {
      const hideMatch = rest.match(/hide\[([^\]]+)\]/i);
      if (hideMatch) {
        location = `hide[${hideMatch[1].trim()}]`;
        isHiddenLocation = true;
      }
    }

    // Check overflow & does not fit notes in text
    let doesNotFit = false;
    let isOverflow = false;
    let overflowReason: string | undefined;
    if (lower.includes('does not fit') || lower.includes('cannot fit') || lower.includes('too big to enter')) {
      doesNotFit = true;
      overflowReason = 'Item does not fit inside container dimensions.';
    } else if (lower.includes('overflow: yes') || lower.includes('overflowing') || lower.includes('protruding') || lower.includes('sticks out')) {
      isOverflow = true;
      overflowReason = 'Item exceeds container space; risks falling or dropping during actions/movement.';
    }

    return {
      name,
      weight,
      dimensions,
      category: defaultContainer ? 'carried' : 'equipped',
      containerName,
      location,
      isHiddenLocation,
      isFoldable,
      isOverflow,
      doesNotFit,
      fitStatus: doesNotFit ? 'does_not_fit' : isOverflow ? 'overflow' : 'fits',
      overflowReason,
      rawText: line,
      temporaryEffect
    };
  }

  /**
   * Evaluates all items, containers, character dimensions, body weight, strength, and encumbrance.
   */
  public static parseCharacterStatsAndInventory(
    fileContent: string,
    currentTimestamp?: string
  ): CharacterPhysicalStats {
    const lines = fileContent.split('\n');

    let characterName = 'Character';
    let characterType = 'Humanoid';
    let height: string | undefined;
    let width: string | undefined;
    let depth: string | undefined;
    let dimensionsRaw = 'Height: 5\'11", Width: 20", Depth: 12"';
    let dimensionsApply = true;
    let bodyWeight = 160; // lbs default for average human
    let strengthMultiplier = 1.0;
    let baseWalkingSpeed = 1.5; // m/s
    let baseRunningSpeed = 4.5; // m/s
    let currentWalkingSpeed = 1.5;
    let currentRunningSpeed = 4.5;
    let maxLiftStrength = 160; // 100% of body weight for 1.0x baseline

    // Dynamic encumbrance parameters
    let encumbranceApplies = true;
    let encumbranceThreshold = 0.20; // 20% default baseline human
    let encumbranceImmunityReason: string | undefined;
    let encumbranceEffectDescription = 'Speed penalty applies when carried weight exceeds threshold.';

    const containers: ContainerInfo[] = [];
    const equippedGear: ItemInfo[] = [];
    const carriedItems: ItemInfo[] = [];
    const storedItems: ItemInfo[] = [];
    const currentlyHolding: HeldItemInfo[] = [];
    let customHoldingAnatomy: string | undefined;
    let customHoldingMax: number | undefined;
    let customHoldingApplies: boolean | undefined;
    const activeWeightEffects: CharacterPhysicalStats['activeWeightEffects'] = [];

    // Currency & balance data
    let currencyType = 'Standard World Currency';
    const carriedCurrencies: CurrencyEntry[] = [];
    const storedCurrencies: CurrencyEntry[] = [];
    let activeCurrencySub: 'carried' | 'stored' | 'general' = 'carried';
    const hasDedicatedCurrencySection = fileContent.includes('[CURRENCY & FINANCIAL BALANCE]') || fileContent.includes('[CURRENCY');
    let explicitCarriedNone = false;

    let isMounted = false;
    let mountedEntityName: string | undefined;
    let mountedStatusDescription: string | undefined;
    const passengersOrRiders: Array<{ name: string; weight?: number }> = [];
    let passengerWeight = 0;

    let currentSection = '';
    let activeContainerName = '';
    let activeSubsection: 'containers' | 'equipped' | 'inside_containers' | 'holding' | 'general' = 'general';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect Section Headers (with or without brackets, markdown `#`, asterisks `**`, colons)
      let detectedSection: string | null = null;
      const bracketMatch = line.match(/^\[(.*?)\]:?$/);
      if (bracketMatch) {
        detectedSection = bracketMatch[1].toUpperCase();
      } else if (!/^[-*•>]\s+[a-zA-Z]/.test(line)) {
        const cleanHeader = line
          .replace(/^#+\s*/, '')
          .replace(/^\*+\s*/, '')
          .replace(/^-+\s*/, '')
          .replace(/^\[+/, '')
          .replace(/\]+:?$/, '')
          .replace(/\*+$/, '')
          .replace(/:$/, '')
          .trim()
          .toUpperCase();

        const canonicalSections: { [k: string]: string } = {
          'NAME & DESCRIPTION': 'NAME & DESCRIPTION',
          'NAME AND DESCRIPTION': 'NAME & DESCRIPTION',
          'CHARACTER PROFILE': 'NAME & DESCRIPTION',
          'PROFILE': 'NAME & DESCRIPTION',
          'BIO': 'NAME & DESCRIPTION',
          'BIOGRAPHY': 'NAME & DESCRIPTION',

          'STATS & MODIFIERS': 'STATS & MODIFIERS',
          'STATS AND MODIFIERS': 'STATS & MODIFIERS',
          'CHARACTER STATS': 'STATS & MODIFIERS',
          'ATTRIBUTES': 'STATS & MODIFIERS',
          'STATS': 'STATS & MODIFIERS',

          'ATTACKS & COMBAT ACTIONS': 'ATTACKS & COMBAT ACTIONS',
          'ATTACKS AND COMBAT ACTIONS': 'ATTACKS & COMBAT ACTIONS',
          'ATTACKS': 'ATTACKS & COMBAT ACTIONS',
          'COMBAT ACTIONS': 'ATTACKS & COMBAT ACTIONS',
          'COMBAT': 'ATTACKS & COMBAT ACTIONS',

          'ABILITIES & MAGIC': 'ABILITIES & MAGIC',
          'ABILITIES AND MAGIC': 'ABILITIES & MAGIC',
          'ABILITIES': 'ABILITIES & MAGIC',
          'MAGIC': 'ABILITIES & MAGIC',
          'SPELLS': 'ABILITIES & MAGIC',

          'INVENTORY & EQUIPMENT': 'INVENTORY & EQUIPMENT',
          'INVENTORY AND EQUIPMENT': 'INVENTORY & EQUIPMENT',
          'INVENTORY': 'INVENTORY & EQUIPMENT',
          'EQUIPMENT': 'INVENTORY & EQUIPMENT',
          'CONTAINERS & CARRIED GEAR': 'INVENTORY & EQUIPMENT',
          'CARRIED GEAR': 'INVENTORY & EQUIPMENT',

          'CURRENTLY HOLDING': 'CURRENTLY HOLDING',
          'ITEMS CURRENTLY HELD': 'CURRENTLY HOLDING',
          'HELD ITEMS': 'CURRENTLY HOLDING',

          'OWNED / STORED ITEMS (NOT ON PERSON)': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'OWNED / STORED ITEMS': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'STORED ITEMS (NOT ON PERSON)': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'STORED ITEMS': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'OWNED ITEMS': 'OWNED / STORED ITEMS (NOT ON PERSON)',
          'STORAGE': 'OWNED / STORED ITEMS (NOT ON PERSON)',

          'CURRENCY & FINANCIAL BALANCE': 'CURRENCY & FINANCIAL BALANCE',
          'CURRENCY AND FINANCIAL BALANCE': 'CURRENCY & FINANCIAL BALANCE',
          'CURRENCY & BALANCE': 'CURRENCY & FINANCIAL BALANCE',
          'CURRENCY': 'CURRENCY & FINANCIAL BALANCE',
          'FINANCIAL BALANCE': 'CURRENCY & FINANCIAL BALANCE',
          'FINANCES': 'CURRENCY & FINANCIAL BALANCE',
          'WEALTH': 'CURRENCY & FINANCIAL BALANCE',
          'MONEY': 'CURRENCY & FINANCIAL BALANCE',
          'CURRENCY & WEALTH': 'CURRENCY & FINANCIAL BALANCE',

          'STATUS EFFECTS & LORE': 'STATUS EFFECTS & LORE',
          'STATUS EFFECTS AND LORE': 'STATUS EFFECTS & LORE',
          'STATUS EFFECTS': 'STATUS EFFECTS & LORE',
          'EFFECTS & LORE': 'STATUS EFFECTS & LORE',
          'LORE': 'STATUS EFFECTS & LORE',

          'MOUNT, VEHICLE & TRANSPORT STATUS': 'TRANSPORT',
          'MOUNT, VEHICLE & TRANSPORT': 'TRANSPORT',
          'MOUNT & VEHICLE STATUS': 'TRANSPORT',
          'TRANSPORT & MOUNTS': 'TRANSPORT',
          'MOUNT & VEHICLE': 'TRANSPORT',
          'TRANSPORT': 'TRANSPORT'
        };

        if (canonicalSections[cleanHeader]) {
          detectedSection = canonicalSections[cleanHeader];
        }
      }

      if (detectedSection) {
        currentSection = detectedSection;
        activeContainerName = '';
        activeSubsection = (currentSection.includes('HOLDING') || currentSection.includes('HELD')) ? 'holding' : 'general';
        continue;
      }

      const lower = line.toLowerCase();

      // 1. [NAME & DESCRIPTION] Section
      if (currentSection.includes('NAME') || currentSection.includes('DESCRIPTION')) {
        if (lower.startsWith('- full name:') || lower.startsWith('name:')) {
          characterName = line.split(/[:=]/)[1]?.trim() || characterName;
        }

        // Detect creature type / race / biology (e.g. Slime, Ghost, Ooze, Golem, Elemental)
        if (
          lower.includes('slime') ||
          lower.includes('gelatinous') ||
          lower.includes('ooze') ||
          lower.includes('amorphous')
        ) {
          characterType = 'Slime';
          encumbranceApplies = false;
          encumbranceImmunityReason = 'Amorphous/Slime biology: absorbs items into gel matrix without standard movement slowdown';
          encumbranceEffectDescription = 'Slime biology allows carrying objects internally without standard encumbrance speed penalty';
        } else if (
          lower.includes('incorporeal') ||
          lower.includes('ghost') ||
          lower.includes('spirit') ||
          lower.includes('phantom') ||
          lower.includes('formless') ||
          lower.includes('spectral')
        ) {
          characterType = 'Ghost/Incorporeal';
          dimensionsApply = false;
          encumbranceApplies = false;
          encumbranceImmunityReason = 'Incorporeal entity: immune to physical encumbrance';
          encumbranceEffectDescription = 'Incorporeal nature: unaffected by weight or encumbrance';
        }

        if (lower.includes('race:') || lower.includes('species:') || lower.includes('type:')) {
          const typeMatch = line.match(/(?:race|species|type)[:=\s]+([^\n,;]+)/i);
          if (typeMatch) {
            const rawType = typeMatch[1].trim();
            characterType = rawType;
            if (rawType.toLowerCase().includes('slime') || rawType.toLowerCase().includes('ooze')) {
              encumbranceApplies = false;
              encumbranceImmunityReason = 'Amorphous/Slime biology: absorbs items without standard encumbrance slowdown';
            } else if (rawType.toLowerCase().includes('ghost') || rawType.toLowerCase().includes('specter') || rawType.toLowerCase().includes('incorporeal')) {
              encumbranceApplies = false;
              dimensionsApply = false;
              encumbranceImmunityReason = 'Incorporeal entity: unaffected by physical weight';
            }
          }
        }

        if (lower.includes('physical dimension') || lower.startsWith('dimensions:') || lower.startsWith('- dimensions:')) {
          dimensionsRaw = line.split(/[:=]/).slice(1).join(':').trim();
          if (dimensionsRaw.toLowerCase().includes('none') || dimensionsRaw.toLowerCase().includes('incorporeal') || dimensionsRaw.toLowerCase().includes('ghost')) {
            dimensionsApply = false;
          } else {
            dimensionsApply = true;
            const parsed = this.parseDimensions(dimensionsRaw);
            if (parsed.height) height = `${parsed.height}"`;
            if (parsed.width) width = `${parsed.width}"`;
            if (parsed.depth) depth = `${parsed.depth}"`;
          }
        }

        if (lower.includes('height:')) {
          const h = line.match(/height[:=\s]+([^\n,;]+)/i);
          if (h) height = h[1].trim();
        }
        if (lower.includes('width:')) {
          const w = line.match(/width[:=\s]+([^\n,;]+)/i);
          if (w) width = w[1].trim();
        }
        if (lower.includes('depth:')) {
          const d = line.match(/depth[:=\s]+([^\n,;]+)/i);
          if (d) depth = d[1].trim();
        }

        if (lower.includes('body weight') || lower.startsWith('weight:') || lower.startsWith('- weight:')) {
          const wResult = this.parseWeight(line);
          if (wResult.applies && wResult.weight > 0) {
            bodyWeight = wResult.weight;
          }
        }
      }

      // Mount / Vehicle / Riding / Enterable Status Check (can appear in any section e.g. [MOUNT, VEHICLE & TRANSPORT], [STATUS EFFECTS & LORE], or [STATS & MODIFIERS])
      if (
        lower.includes('mounted on') ||
        lower.startsWith('- mounting / riding status:') ||
        lower.startsWith('- mounting/riding status:') ||
        lower.startsWith('mounting / riding status:') ||
        lower.startsWith('- riding status:') ||
        lower.startsWith('riding status:') ||
        lower.startsWith('- mounted:') ||
        lower.startsWith('mounted:') ||
        lower.startsWith('- riding:') ||
        lower.startsWith('riding:') ||
        lower.startsWith('- status / transport:') ||
        lower.startsWith('- status / mounting:') ||
        lower.startsWith('- transport / mount:') ||
        lower.startsWith('- transport:') ||
        lower.startsWith('- inside vehicle:') ||
        lower.startsWith('- inside:') ||
        lower.startsWith('inside:') ||
        lower.startsWith('piloting:') ||
        lower.startsWith('- pilot:')
      ) {
        const val = line.split(/[:=]/).slice(1).join(':').trim();
        if (
          val &&
          !val.toLowerCase().includes('none') &&
          !val.toLowerCase().includes('unmounted') &&
          !val.toLowerCase().includes('on foot') &&
          !val.toLowerCase().includes('independent')
        ) {
          isMounted = true;
          mountedStatusDescription = val;
          const entityMatch = val.match(/\[([^\]]+)\]/);
          if (entityMatch) {
            mountedEntityName = entityMatch[1].trim();
          } else {
            const cleaned = val
              .replace(/^(?:mounted\s+on|riding|inside\s+of|inside|piloting)\s+/i, '')
              .replace(/\(.*?\)/g, '')
              .trim();
            if (cleaned) mountedEntityName = cleaned;
          }
        }
      }

      // Mount / Vehicle Passenger / Rider Check (for horses, carriages, wagons, boats, etc.)
      if (
        lower.startsWith('- rider') ||
        lower.startsWith('rider:') ||
        lower.startsWith('- passenger') ||
        lower.startsWith('passengers:') ||
        lower.startsWith('- occupants:') ||
        lower.startsWith('occupants:') ||
        lower.startsWith('- total occupant weight:')
      ) {
        const val = line.split(/[:=]/).slice(1).join(':').trim();
        if (
          val &&
          !val.toLowerCase().includes('none') &&
          !val.toLowerCase().includes('empty') &&
          !val.toLowerCase().includes('0 riders')
        ) {
          const totalWeightMatch = val.match(/total(?:\s+occupant)?\s+weight[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*lbs?/i);
          if (totalWeightMatch) {
            passengerWeight = Math.max(passengerWeight, parseFloat(totalWeightMatch[1]));
          } else {
            const bracketMatches = Array.from(val.matchAll(/\[([^\]]+)\](?:\s*\([^)]*?([0-9]+(?:\.[0-9]+)?)\s*lbs?[^)]*?\))?/g));
            let foundBracket = false;
            for (const bm of bracketMatches) {
              foundBracket = true;
              const pName = bm[1].trim();
              const pWeight = bm[2] ? parseFloat(bm[2]) : 0;
              passengersOrRiders.push({ name: pName, weight: pWeight || undefined });
              if (pWeight > 0) passengerWeight += pWeight;
            }
            if (!foundBracket) {
              const weightMatch = val.match(/([0-9]+(?:\.[0-9]+)?)\s*lbs?/i);
              if (weightMatch) {
                passengerWeight += parseFloat(weightMatch[1]);
              }
            }
          }
        }
      }

      // 2. [STATS & MODIFIERS] Section
      if (currentSection.includes('STAT') || currentSection.includes('MODIFIER')) {
        // Speed
        if (lower.includes('speed:')) {
          // Check for unmounted base speed if present e.g. "Unmounted base: 1.5 m/s / 4.5 m/s" or "(Unmounted: 1.5 m/s, 4.5 m/s)"
          const unmountedMatch = line.match(/unmounted(?:\s+base)?[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?[,\s/]+([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i);
          if (unmountedMatch) {
            baseWalkingSpeed = parseFloat(unmountedMatch[1]);
            baseRunningSpeed = parseFloat(unmountedMatch[2]);
          }

          if (lower.includes('mounted on') || lower.includes('riding')) {
            isMounted = true;
            const mountMatch = line.match(/\[([^\]]+)\]/);
            if (mountMatch) {
              mountedEntityName = mountMatch[1].trim();
            }
          }

          const walkMatch = line.match(/walking[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i) ||
                            line.match(/pushing[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i);
          if (walkMatch) {
            currentWalkingSpeed = parseFloat(walkMatch[1]);
            if (!unmountedMatch && !isMounted) baseWalkingSpeed = currentWalkingSpeed;
          }
          const runMatch = line.match(/(?:running|galloping|gallop|coasting)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i);
          if (runMatch) {
            currentRunningSpeed = parseFloat(runMatch[1]);
            if (!unmountedMatch && !isMounted) baseRunningSpeed = currentRunningSpeed;
          }
        }

        // Strength & Multiplier
        if (lower.includes('strength:')) {
          const multMatch = line.match(/(?:multiplier|lift multiplier)[:=\s]*([0-9]+(?:\.[0-9]+)?)x?/i);
          if (multMatch) {
            strengthMultiplier = parseFloat(multMatch[1]);
          } else {
            // Check formula +X%(1000)
            const pctMatch = line.match(/([+-]?\d+)\s*%\s*\(\s*1000\s*\)/);
            if (pctMatch) {
              const bonus = parseInt(pctMatch[1]) / 1000;
              strengthMultiplier = Math.max(0.2, 1.0 + bonus);
            }
          }
        }

        // Dynamic Encumbrance Rule / Threshold in Character Stats
        // e.g. "Encumbrance: Immune (Slime biology absorbs items without slowing)"
        // or "Encumbrance Threshold: None / Immune" or "Encumbrance Threshold: 35%"
        if (lower.includes('encumbrance')) {
          if (
            lower.includes('immune') ||
            lower.includes('none') ||
            lower.includes('no penalty') ||
            lower.includes('unaffected') ||
            lower.includes('not affected') ||
            lower.includes('does not apply')
          ) {
            encumbranceApplies = false;
            encumbranceImmunityReason = line.split(/[:=]/).slice(1).join(':').trim() || 'Immune to encumbrance penalty';
            encumbranceEffectDescription = encumbranceImmunityReason;
          } else {
            const customPctMatch = line.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
            if (customPctMatch) {
              encumbranceThreshold = parseFloat(customPctMatch[1]) / 100;
              encumbranceApplies = true;
            }
            if (line.includes(':')) {
              encumbranceEffectDescription = line.split(/[:=]/).slice(1).join(':').trim();
            }
          }
        }

        // Max lift strength
        if (lower.includes('max lift') || lower.includes('lift strength:')) {
          const liftMatch = this.parseWeight(line);
          if (liftMatch.applies && liftMatch.weight > 0) {
            maxLiftStrength = liftMatch.weight;
          }
        }
      }

      // 3. [CONTAINERS & CARRIED GEAR] or [INVENTORY & EQUIPMENT]
      if (
        currentSection.includes('INVENTORY') ||
        currentSection.includes('CONTAINER') ||
        currentSection.includes('EQUIPMENT') ||
        currentSection.includes('GEAR')
      ) {
        // A subsection header line cannot have item stats (weight:, dimensions:, or lbs with a weight definition)
        const hasItemStat = lower.includes('weight:') || lower.includes('dimensions:') || /\b[0-9]+(?:\.[0-9]+)?\s*lbs?\b/i.test(lower);

        // Check for subsection headers
        const isContainersHeader = !hasItemStat && (
          (lower.startsWith('- containers') || lower.startsWith('* containers') || lower.startsWith('containers') || lower.includes('equipped containers') || lower.includes('containers carried') || lower.includes('containers equipped')) &&
          !lower.includes('inside') && !lower.includes('content') && !lower.includes('inventory')
        );

        if (isContainersHeader) {
          activeSubsection = 'containers';
          activeContainerName = '';
          continue;
        }

        // Holding anatomy line
        if (lower.startsWith('- holding anatomy') || lower.startsWith('holding anatomy') || lower.startsWith('* holding anatomy')) {
          customHoldingAnatomy = line.split(/[:=]/).slice(1).join(':').trim();
          const cLower = customHoldingAnatomy.toLowerCase();
          if (cLower.includes('none') || cLower.includes('limbless') || cLower.includes('amorphous') || cLower.includes('spectral')) {
            customHoldingApplies = false;
            customHoldingMax = 0;
          } else if (cLower.includes('mouth') || cLower.includes('jaw') || cLower.includes('1 item') || cLower.includes('1 hand')) {
            customHoldingApplies = true;
            customHoldingMax = 1;
          } else if (cLower.includes('4') || cLower.includes('four')) {
            customHoldingApplies = true;
            customHoldingMax = 4;
          } else if (cLower.includes('3') || cLower.includes('three')) {
            customHoldingApplies = true;
            customHoldingMax = 3;
          } else {
            customHoldingApplies = true;
            customHoldingMax = 2;
          }
          continue;
        }

        // Holding capacity line
        if (lower.startsWith('- holding capacity') || lower.startsWith('holding capacity') || lower.startsWith('* holding capacity') || lower.includes('capacity & status')) {
          const countMatch = line.match(/(\d+)\s*\/\s*(\d+)/);
          if (countMatch) {
            customHoldingMax = parseInt(countMatch[2]);
          }
          continue;
        }

        const isHoldingHeader = !hasItemStat && (
          lower.includes('currently holding') ||
          lower.includes('held items') ||
          lower.includes('items being held') ||
          lower.includes('items currently held') ||
          lower.startsWith('- holding:') ||
          lower.startsWith('* holding:') ||
          lower.startsWith('holding:')
        );

        if (isHoldingHeader) {
          activeSubsection = 'holding';
          activeContainerName = '';
          continue;
        }

        const isEquippedHeader = !hasItemStat && (
          lower.includes('equipped gear') ||
          lower.includes('equipped armor') ||
          lower.includes('equipped items') ||
          lower.includes('worn gear') ||
          lower.startsWith('- equipped:') ||
          lower.startsWith('* equipped:') ||
          lower.startsWith('equipped:') ||
          lower.startsWith('- worn:') ||
          lower.startsWith('* worn:') ||
          lower.startsWith('worn:')
        );

        if (isEquippedHeader) {
          activeSubsection = 'equipped';
          activeContainerName = '';
          continue;
        }

        const isInsideContainersHeader = !hasItemStat && (
          lower.includes('inside container') ||
          lower.includes('inside containers') ||
          lower.includes('in container') ||
          lower.includes('in containers') ||
          lower.includes('carried inventory') ||
          lower.includes('container inventory') ||
          lower.includes('container contents') ||
          lower.includes('items inside') ||
          lower.includes('items in container') ||
          lower.includes('items in backpack') ||
          lower.includes('inside backpack') ||
          lower.includes('inside satchel') ||
          lower.includes('inside pouch') ||
          lower.includes('backpack contents') ||
          lower.includes('satchel contents') ||
          lower.includes('pouch contents') ||
          (lower.startsWith('- carried items') && !lower.includes('loose')) ||
          (lower.startsWith('carried items') && !lower.includes('loose'))
        );

        if (isInsideContainersHeader) {
          activeSubsection = 'inside_containers';
          if (!activeContainerName && containers.length > 0) {
            activeContainerName = containers[0].name;
          }
          continue;
        }

        // Check if line switches active container (e.g. "- Backpack:" or "- Inside Leather Satchel:" or "Small Leather Backpack:")
        // It must NOT be in container definition mode, must not have item stats, and must match a known container.
        if (activeSubsection !== 'containers' && containers.length > 0 && !hasItemStat) {
          const strippedName = line.replace(/^[-*•>\s]+/, '').replace(/^(?:inside|in(?:\s*container)?|stored in)\s+/i, '').replace(/[:=\(\[\)].*$/, '').trim();
          if (strippedName) {
            const matching = this.findMatchingContainer(containers, strippedName);
            if (matching && (line.endsWith(':') || line.includes(':') || lower.includes('contents') || lower.includes('inside'))) {
              activeSubsection = 'inside_containers';
              activeContainerName = matching.name;
              continue;
            }
          }
        }

        // Ignore metadata notes, empty markers, or summary lines
        if (
          lower.startsWith('- auto-equip') ||
          lower.startsWith('auto-equip') ||
          lower.includes('oversized / wearable items rule') ||
          lower.startsWith('- total carried weight') ||
          lower.startsWith('total carried weight') ||
          lower.startsWith('- total weight') ||
          lower === '(none)' ||
          lower === '- (none)' ||
          lower === '* (none)' ||
          lower === 'none' ||
          lower === '0 lbs (none)' ||
          lower === '- 0 lbs (none)'
        ) {
          continue;
        }

        // Container definition: e.g. "Backpack: Dimensions 18 inches tall by 12 inches area, Max Capacity: 40 lbs"
        const containerKeywords = ['backpack', 'satchel', 'pouch', 'sack', 'bag', 'haversack', 'rucksack', 'chest', 'quiver', 'bandolier', 'scabbard', 'pocket', 'trunk', 'crate', 'case', 'holster'];
        const hasContainerKeyword = containerKeywords.some(kw => lower.includes(kw));
        const isExplicitItemInContainer = lower.includes('container:') || lower.includes('inside container') || lower.includes('in backpack') || lower.includes('in satchel') || lower.includes('in pouch') || lower.includes('in bag');

        const isContainerDef = (activeSubsection === 'containers' && !lower.startsWith('total') && !isExplicitItemInContainer) || (
          hasContainerKeyword &&
          !isExplicitItemInContainer &&
          (
            lower.includes('dimension') ||
            lower.includes('capacity') ||
            lower.includes('max space') ||
            lower.includes('max weight') ||
            lower.includes('max:') ||
            lower.includes('holds') ||
            /\b\d+\s*x\s*\d+/i.test(lower) ||
            lower.includes('empty weight')
          )
        );

        if (isContainerDef) {
          let name = line.split(/[:=]/)[0].replace(/^[-*•>\s]+/, '').trim();
          const parenIdx = name.search(/[\(\[]/);
          if (parenIdx > 0) {
            name = name.substring(0, parenIdx).trim();
          }
          if (!name) name = 'Backpack';

          // Distinguish container empty weight from max capacity
          let containerWeight = 2.0;
          if (lower.includes('pouch')) containerWeight = 0.5;
          if (lower.includes('satchel')) containerWeight = 1.0;
          if (lower.includes('chest')) containerWeight = 15.0;

          const emptyWeightMatch = line.match(/(?:empty\s*weight|weight|wt)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?)/i);
          if (emptyWeightMatch) {
            containerWeight = parseFloat(emptyWeightMatch[1]);
          } else {
            const wResult = this.parseWeight(line);
            if (wResult.applies && wResult.weight > 0) {
              containerWeight = wResult.weight;
            }
          }

          let maxWeightCapacity: number | undefined;
          const capMatch = line.match(/(?:max\s*(?:weight|capacity)|capacity|holds\s*up\s*to)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?)/i);
          if (capMatch) {
            maxWeightCapacity = parseFloat(capMatch[1]);
          } else {
            // Sensible defaults
            if (lower.includes('pouch')) maxWeightCapacity = 5;
            else if (lower.includes('satchel')) maxWeightCapacity = 20;
            else if (lower.includes('quiver')) maxWeightCapacity = 10;
            else if (lower.includes('chest')) maxWeightCapacity = 100;
            else maxWeightCapacity = 40;
          }

          let maxDim = this.parseDimensions(line);
          if (!maxDim.raw) {
            if (lower.includes('pouch')) maxDim = this.parseDimensions('6x4x3 inches');
            else if (lower.includes('satchel')) maxDim = this.parseDimensions('12x10x4 inches');
            else if (lower.includes('quiver')) maxDim = this.parseDimensions('24x4x4 inches');
            else if (lower.includes('chest')) maxDim = this.parseDimensions('36x24x20 inches');
            else maxDim = this.parseDimensions('18x12x8 inches');
          }

          activeContainerName = name;
          containers.push({
            name,
            weight: containerWeight,
            dimensions: maxDim,
            maxDimensions: maxDim,
            maxWeightCapacity,
            items: [],
            currentItemsWeight: 0,
            totalWeight: containerWeight,
            hasOverflow: false,
            hasDoesNotFit: false,
            rawText: line
          });
          continue;
        }

        // Check if line is an item
        const item = this.parseItemLine(line, activeSubsection === 'inside_containers' ? activeContainerName : undefined);
        if (item) {
          // If explicitly marked or parsed in equipped subsection
          if (
            activeSubsection === 'equipped' ||
            lower.includes('equipped: yes') ||
            lower.includes('worn: yes') ||
            lower.includes('wielding') ||
            lower.includes('wearing')
          ) {
            item.category = 'equipped';
            item.containerName = undefined;
            item.isOverflow = false;
            item.doesNotFit = false;
            equippedGear.push(item);
          } else if (activeSubsection === 'inside_containers' || activeContainerName || item.containerName) {
            // Put in targeted or active container
            let cont = this.findMatchingContainer(containers, item.containerName || activeContainerName);

            // If an item has no matching container found by name:
            // Check if any container exists in containers
            if (!cont && containers.length > 0 && !item.containerName) {
              cont = containers[0];
            }

            // Auto-recovery: If items in container were written without an explicit container header/definition,
            // or a named container was specified that doesn't exist yet, auto-create it so items are NEVER lost!
            if (!cont) {
              const defaultName = item.containerName || activeContainerName || 'Backpack';
              const defaultDim = this.parseDimensions('18x12x8 inches');
              cont = {
                name: defaultName,
                weight: 2.0,
                dimensions: defaultDim,
                maxDimensions: defaultDim,
                maxWeightCapacity: 40,
                items: [],
                currentItemsWeight: 0,
                totalWeight: 2.0,
                hasOverflow: false,
                hasDoesNotFit: false,
                rawText: `- ${defaultName}: Dimensions 18x12x8 inches, Max Capacity: 40 lbs, Weight: 2 lbs`
              };
              containers.push(cont);
            }

            item.category = 'carried';
            item.containerName = cont.name;

            // Check container fit
            const fitCheck = this.checkContainerFit(item, cont.maxDimensions, {
              currentWeight: cont.currentItemsWeight
            });

            item.isFoldable = fitCheck.isFoldable;
            item.fitStatus = fitCheck.status;

            if (fitCheck.doesNotFit) {
              item.doesNotFit = true;
              item.overflowReason = fitCheck.reason;
              cont.hasDoesNotFit = true;
            } else if (fitCheck.isOverflow) {
              item.isOverflow = true;
              item.overflowReason = fitCheck.reason;
              cont.hasOverflow = true;
            }

            cont.items.push(item);
            cont.currentItemsWeight += item.weight;
            cont.totalWeight += item.weight;
          } else if (lower.includes('equipped') || lower.includes('wielding') || lower.includes('wearing') || lower.includes('armor:')) {
            item.category = 'equipped';
            equippedGear.push(item);
          } else {
            carriedItems.push(item);
          }
        }
      }

      // 3.5. [CURRENTLY HOLDING] Section or Holding Subsection
      if (
        currentSection.includes('HOLDING') ||
        currentSection.includes('HELD') ||
        activeSubsection === 'holding'
      ) {
        // Holding Anatomy line
        if (
          lower.includes('holding anatomy:') ||
          lower.includes('holding limbs:') ||
          lower.includes('holding appendages:') ||
          lower.startsWith('- anatomy:') ||
          lower.startsWith('* anatomy:') ||
          lower.startsWith('anatomy:')
        ) {
          customHoldingAnatomy = line.split(/[:=]/).slice(1).join(':').trim();
          const cLower = customHoldingAnatomy.toLowerCase();
          if (cLower.includes('none') || cLower.includes('incorporeal') || cLower.includes('formless') || cLower.includes('cannot hold')) {
            customHoldingApplies = false;
            customHoldingMax = 0;
          } else if (cLower.includes('mouth') || cLower.includes('jaw') || cLower.includes('1 item') || cLower.includes('1 hand')) {
            customHoldingApplies = true;
            customHoldingMax = 1;
          } else if (cLower.includes('4') || cLower.includes('four')) {
            customHoldingApplies = true;
            customHoldingMax = 4;
          } else if (cLower.includes('3') || cLower.includes('three')) {
            customHoldingApplies = true;
            customHoldingMax = 3;
          } else {
            customHoldingApplies = true;
            customHoldingMax = 2;
          }
          continue;
        }

        // Holding capacity / status line
        if (
          lower.includes('holding capacity') ||
          lower.includes('capacity & status') ||
          lower.includes('holding status') ||
          lower.startsWith('- capacity:') ||
          lower.startsWith('capacity:')
        ) {
          continue;
        }

        // Informational lines or instructions
        if (
          lower.includes('overflow rules:') ||
          lower.includes('weight mandate:') ||
          lower.startsWith('- items currently held:') ||
          lower.startsWith('* items currently held:') ||
          lower.startsWith('items currently held:') ||
          lower.startsWith('- held items:') ||
          lower.startsWith('held items:') ||
          lower.includes('(none') ||
          lower.includes('hands/appendages free')
        ) {
          continue;
        }

        // Parse held item line
        let defaultLimb = 'Hands';
        if (customHoldingAnatomy) {
          const cLower = customHoldingAnatomy.toLowerCase();
          if (cLower.includes('mouth') || cLower.includes('jaw') || cLower.includes('teeth')) {
            defaultLimb = 'Held in Jaws';
          } else if (cLower.includes('beak')) {
            defaultLimb = 'Beak';
          } else if (cLower.includes('talon')) {
            defaultLimb = 'Talons';
          } else if (cLower.includes('tentacle')) {
            defaultLimb = 'Tentacles';
          } else if (cLower.includes('claws')) {
            defaultLimb = 'Claws';
          } else if (cLower.includes('trunk')) {
            defaultLimb = 'Trunk';
          }
        }

        const unwrapped = WeightInventoryEngine.unwrapHeldItem(line, defaultLimb);
        if (!unwrapped) {
          continue;
        }

        const item = this.parseItemLine(unwrapped.cleanText);
        if (item) {
          item.category = 'equipped';
          const maxAllowed = customHoldingMax !== undefined ? customHoldingMax : 2;
          const isOverflow = unwrapped.isOverflow || (currentlyHolding.length >= maxAllowed);
          const heldItem: HeldItemInfo = {
            ...item,
            holdingLimb: unwrapped.holdingLimb,
            isOverflowHold: isOverflow,
            overflowWarning: isOverflow ? 'Held with overflow; risks dropping or getting knocked down depending on narrative context.' : undefined
          };
          // Prevent duplicate held items caused by prior sync loops or accidental line replication
          const isDuplicate = currentlyHolding.some(
            existing =>
              existing.name.toLowerCase() === item.name.toLowerCase() &&
              existing.holdingLimb.toLowerCase() === unwrapped.holdingLimb.toLowerCase() &&
              Math.abs(existing.weight - item.weight) < 0.001
          );
          if (isDuplicate && (customHoldingMax === 1 || unwrapped.holdingLimb.toLowerCase().includes('jaw') || unwrapped.holdingLimb.toLowerCase().includes('mouth') || unwrapped.holdingLimb.toLowerCase().includes('right hand') || unwrapped.holdingLimb.toLowerCase().includes('left hand'))) {
            continue;
          }

          currentlyHolding.push(heldItem);
          continue;
        }
      }

      // [CURRENCY & FINANCIAL BALANCE]
      if (currentSection.includes('CURRENCY') || currentSection.includes('FINANCE') || currentSection.includes('WEALTH') || currentSection.includes('BALANCE')) {
        if (lower.startsWith('- currency type:') || lower.startsWith('currency type:')) {
          currencyType = line.split(/[:=]/)[1]?.trim() || currencyType;
          continue;
        }
        if (lower.includes('stored') || lower.includes('remote balance') || lower.includes('not on person') || lower.includes('vault') || lower.includes('cache') || lower.includes('chest') || lower.includes('bank')) {
          activeCurrencySub = 'stored';
        } else if (lower.includes('carried balance') || lower.includes('carried currency') || (lower.includes('on person') && !lower.includes('not on person')) || lower.includes('pouch') || lower.includes('wallet')) {
          activeCurrencySub = 'carried';
        }

        if (activeCurrencySub === 'carried' && (lower.includes('none') || lower.includes('(0)') || lower === '* 0' || lower === '- 0' || lower.endsWith(': 0'))) {
          explicitCarriedNone = true;
          continue;
        }

        const entries = WeightInventoryEngine.parseCurrencyEntries(line);
        if (entries.length > 0) {
          if (activeCurrencySub === 'stored') {
            storedCurrencies.push(...entries);
          } else {
            carriedCurrencies.push(...entries);
          }
          continue;
        }
      }

      // Check for carried currency inside Inventory / Containers section ONLY if character file does not have an authoritative currency section
      if (!hasDedicatedCurrencySection && (currentSection.includes('INVENTORY') || currentSection.includes('CONTAINER') || currentSection.includes('CARRIED'))) {
        const cEntries = WeightInventoryEngine.parseCurrencyEntries(line, undefined, activeContainerName);
        if (cEntries.length > 0) {
          for (const ce of cEntries) {
            if (!carriedCurrencies.some(existing => existing.name.toLowerCase() === ce.name.toLowerCase() && existing.amount === ce.amount)) {
              carriedCurrencies.push(ce);
            }
          }
        }
      }

      // 4. [OWNED / STORED ITEMS (NOT ON PERSON)]
      if (currentSection.includes('OWNED') || currentSection.includes('STORED') || currentSection.includes('NOT ON PERSON')) {
        const item = this.parseItemLine(line);
        if (item) {
          item.category = 'stored';
          storedItems.push(item);
        }
        const sCurr = WeightInventoryEngine.parseCurrencyEntries(line, item?.location);
        if (sCurr.length > 0) {
          storedCurrencies.push(...sCurr);
        }
      }

      // 5. [STATUS EFFECTS & LORE]
      if (currentSection.includes('STATUS') || currentSection.includes('EFFECT')) {
        const effMatch = line.match(/\[Status:([^()]+)\(([^)]+)\)\]/i);
        if (effMatch) {
          const effName = effMatch[1];
          const effBody = effMatch[2];
          const tempW = effBody.match(/tempweight[:=\s]*([0-9]+(?:\.[0-9]+)?)/i);
          const baseW = effBody.match(/baseweight[:=\s]*([0-9]+(?:\.[0-9]+)?)/i);
          const exp = effBody.match(/expires[:=\s]*([^;)]+)/i);

          if (tempW && baseW) {
            activeWeightEffects.push({
              name: effName,
              expires: exp ? exp[1].trim() : undefined,
              target: effName,
              tempVal: parseFloat(tempW[1]),
              baseVal: parseFloat(baseW[1])
            });
          }
        }
      }
    }

    // Ensure Max Lift Strength matches standard human baseline (100% of body weight for 1.0x strength)
    maxLiftStrength = Math.round(bodyWeight * strengthMultiplier);

    // Calculate Holding Capacity and Status dynamically based on character's anatomy
    let holdingCapacityApplies = customHoldingApplies !== undefined ? customHoldingApplies : true;
    let holdingLimbsDescription = customHoldingAnatomy || '2 Hands / Arms (Humanoid)';
    let maxStandardHoldCount = customHoldingMax !== undefined ? customHoldingMax : 2;

    const lowerType = characterType ? characterType.toLowerCase() : '';
    if (customHoldingApplies === undefined && (lowerType.includes('slime') || lowerType.includes('ghost') || lowerType.includes('incorporeal') || lowerType.includes('snake') || lowerType.includes('serpent'))) {
      holdingCapacityApplies = false;
      holdingLimbsDescription = 'None (Limbless / Amorphous biology)';
      maxStandardHoldCount = 0;
    } else if (customHoldingApplies === undefined && (lowerType.includes('dog') || lowerType.includes('wolf') || lowerType.includes('canine') || lowerType.includes('horse') || lowerType.includes('feline'))) {
      holdingCapacityApplies = true;
      holdingLimbsDescription = 'Mouth / Jaws (Quadruped - 1 item hold)';
      maxStandardHoldCount = 1;
    }

    // Auto-populate held items from equipped weapons/shields if currentlyHolding is empty
    if (currentlyHolding.length === 0 && holdingCapacityApplies && maxStandardHoldCount > 0 && equippedGear.length > 0) {
      const weaponShieldWords = ['sword', 'dagger', 'blade', 'spear', 'staff', 'bow', 'axe', 'mace', 'wand', 'shield', 'lantern', 'torch', 'hammer', 'scythe'];
      for (const eq of equippedGear) {
        const eqLower = eq.name.toLowerCase();
        if (weaponShieldWords.some(w => eqLower.includes(w))) {
          const isTwoHanded = eqLower.includes('greatsword') || eqLower.includes('bow') || eqLower.includes('two-handed') || eqLower.includes('staff') || eqLower.includes('spear');
          const limb = isTwoHanded ? 'Both Hands (Two-Handed)' : (currentlyHolding.length === 0 ? 'Main Hand' : 'Off Hand');
          const isOverflow = currentlyHolding.length >= maxStandardHoldCount;
          currentlyHolding.push({
            ...eq,
            holdingLimb: limb,
            isOverflowHold: isOverflow,
            overflowWarning: isOverflow ? 'Held with overflow; risks dropping or getting knocked down depending on narrative context.' : undefined
          });
          if (isTwoHanded && maxStandardHoldCount <= 2) {
            break;
          }
        }
      }
    }

    const nonOverflowCount = currentlyHolding.filter(h => !h.isOverflowHold).length;
    const isFull = holdingCapacityApplies && (nonOverflowCount >= maxStandardHoldCount);
    const hasOverflowHold = currentlyHolding.some(h => h.isOverflowHold);
    const freeSlots = holdingCapacityApplies ? Math.max(0, maxStandardHoldCount - nonOverflowCount) : 0;

    const holdingCapacity: HoldingCapacityInfo = {
      applies: holdingCapacityApplies,
      holdingLimbsDescription,
      maxStandardHoldCount,
      currentHeldCount: currentlyHolding.length,
      isFull,
      hasOverflowHold,
      overflowReason: hasOverflowHold ? 'Character is holding items with overflow beyond standard anatomical capacity; risks dropping or being knocked down.' : undefined,
      freeSlots
    };

    // Calculate Total Carried Weight on Person:
    // = Equipped Gear + Containers (empty weight) + Items inside containers + Carried loose items + Currently Held items
    let totalCarriedWeight = 0;
    for (const eq of equippedGear) {
      totalCarriedWeight += eq.weight;
    }
    for (const cont of containers) {
      totalCarriedWeight += cont.totalWeight;
    }
    for (const cItem of carriedItems) {
      totalCarriedWeight += cItem.weight;
    }
    for (const hItem of currentlyHolding) {
      // Avoid double counting if held item was already mirrored in equippedGear or carriedItems
      const alreadyInEquipped = equippedGear.some(e => e.name.toLowerCase() === hItem.name.toLowerCase());
      const alreadyInCarried = carriedItems.some(c => c.name.toLowerCase() === hItem.name.toLowerCase());
      if (!alreadyInEquipped && !alreadyInCarried) {
        totalCarriedWeight += hItem.weight;
      }
    }
    if (explicitCarriedNone) {
      carriedCurrencies.length = 0;
    }

    // Add carried currency physical weight (if coins or physical money)
    for (const c of carriedCurrencies) {
      if (c.weight !== undefined && c.weight > 0) {
        totalCarriedWeight += c.weight;
      } else if (/coins?|gold|silver|copper/i.test(c.name)) {
        // Standard realistic physical coin weight: ~0.02 lbs (approx 50 coins per pound)
        totalCarriedWeight += Math.round(c.amount * 0.02 * 100) / 100;
      }
    }

    // Add passenger/rider weight if this entity is carrying riders or passengers (e.g. mount, carriage, wagon)
    totalCarriedWeight += passengerWeight;
    // Stored items are EXCLUDED (user mandate: "not owned, owned items they don't have on them are put in another category but it's theirs still")

    // Dynamic Encumbrance calculation:
    // If the character is immune (e.g. Slimes, Incorporeal, Telekinetic, or trait-exempt), encumbrance does not apply
    const encumbranceRatio = bodyWeight > 0 ? (totalCarriedWeight / bodyWeight) : 0;
    let isEncumbered = false;

    if (encumbranceApplies) {
      isEncumbered = encumbranceRatio > encumbranceThreshold;
    }

    // Apply speed penalty if encumbered
    if (isEncumbered && encumbranceApplies) {
      if (totalCarriedWeight > maxLiftStrength) {
        // Exceeds max lift capacity: impossible to lift or move!
        currentWalkingSpeed = 0;
        currentRunningSpeed = 0;
      } else {
        // Penalty scaled by degree of encumbrance beyond their dynamic threshold
        const overPercent = (encumbranceRatio - encumbranceThreshold);
        // Penalty: min 20%, scaling up to 70% as weight approaches max lift
        const penaltyFactor = Math.min(0.70, 0.20 + (overPercent * 0.8));
        currentWalkingSpeed = Math.round(baseWalkingSpeed * (1 - penaltyFactor) * 10) / 10;
        currentRunningSpeed = Math.round(baseRunningSpeed * (1 - penaltyFactor) * 10) / 10;
      }
    }

    const carriedSummary = WeightInventoryEngine.formatCurrencySummary(carriedCurrencies);
    const storedSummary = WeightInventoryEngine.formatCurrencySummary(storedCurrencies);
    const totalNetWorthSummary = WeightInventoryEngine.formatCurrencySummary([...carriedCurrencies, ...storedCurrencies]);
    const hasCurrency = carriedCurrencies.length > 0 || storedCurrencies.length > 0;

    const currency: CharacterCurrencyData = {
      currencyType,
      carriedCurrencies,
      carriedSummary,
      storedCurrencies,
      storedSummary,
      totalNetWorthSummary,
      hasCurrency
    };

    return {
      characterName,
      characterType,
      height,
      width,
      depth,
      dimensionsRaw,
      dimensionsApply,
      bodyWeight: Math.round(bodyWeight * 10) / 10,
      strengthMultiplier,
      maxLiftStrength,
      baseWalkingSpeed,
      baseRunningSpeed,
      currentWalkingSpeed,
      currentRunningSpeed,
      isEncumbered,
      encumbranceRatio: Math.round(encumbranceRatio * 1000) / 10, // percentage e.g. 21.5%
      encumbranceThreshold: Math.round(encumbranceThreshold * 100), // e.g. 20%
      encumbranceApplies,
      encumbranceImmunityReason,
      encumbranceEffectDescription,
      totalCarriedWeight: Math.round(totalCarriedWeight * 10) / 10,
      currency,
      isMounted,
      mountedEntityName,
      mountedStatusDescription,
      passengersOrRiders,
      passengerWeight: Math.round(passengerWeight * 10) / 10,
      currentlyHolding,
      holdingCapacity,
      containers,
      equippedGear,
      carriedItems,
      storedItems,
      activeWeightEffects
    };
  }

  /**
   * Helper to find the index of the next top-level section header like `\n[HEADER]`
   */
  public static findNextSectionHeaderIndex(text: string, fromIndex: number): number {
    const sub = text.substring(fromIndex);
    const m = sub.match(/\n\s*\[[A-Z0-9_\s&/'-]+\]/);
    if (m && m.index !== undefined) {
      const bracketOffset = m[0].indexOf('[');
      return fromIndex + m.index + bracketOffset;
    }
    return -1;
  }

  /**
   * Synchronizes and writes the exact calculated weight, dimensions, container overflow,
   * encumbrance status, and adjusted speed directly back into the character file text.
   * This guarantees that the code automatically adds all weight and applies dynamic encumbrance.
   */
  public static syncCharacterFileContent(
    content: string,
    currentTimestamp?: string,
    currencyOverride?: { carried?: CurrencyEntry[]; stored?: CurrencyEntry[] }
  ): { updatedContent: string; stats: CharacterPhysicalStats; changes: string[] } {
    const stats = this.parseCharacterStatsAndInventory(content, currentTimestamp);
    if (currencyOverride?.carried !== undefined) {
      stats.currency.carriedCurrencies = currencyOverride.carried;
      stats.currency.carriedSummary = WeightInventoryEngine.formatCurrencySummary(stats.currency.carriedCurrencies);
    }
    if (currencyOverride?.stored !== undefined) {
      stats.currency.storedCurrencies = currencyOverride.stored;
      stats.currency.storedSummary = WeightInventoryEngine.formatCurrencySummary(stats.currency.storedCurrencies);
    }
    if (currencyOverride?.carried !== undefined || currencyOverride?.stored !== undefined) {
      stats.currency.totalNetWorthSummary = WeightInventoryEngine.formatCurrencySummary([
        ...stats.currency.carriedCurrencies,
        ...stats.currency.storedCurrencies
      ]);
      stats.currency.hasCurrency = stats.currency.carriedCurrencies.length > 0 || stats.currency.storedCurrencies.length > 0;
    }
    const changes: string[] = [];

    let updated = content;

    // 1. Ensure [NAME & DESCRIPTION] contains Physical Dimensions and Body Weight if not already present
    if (!updated.includes('Physical Dimensions:') && !updated.includes('Dimensions:') && !updated.includes('Body Dimensions:')) {
      const nameDescIdx = updated.indexOf('[NAME & DESCRIPTION]');
      if (nameDescIdx >= 0) {
        const nextHeader = WeightInventoryEngine.findNextSectionHeaderIndex(updated, nameDescIdx + 20);
        const insertPos = nextHeader > 0 ? nextHeader : updated.length;
        let dimStr = '';
        if (stats.dimensionsApply && stats.dimensionsRaw && !stats.dimensionsRaw.includes("5'11\"")) {
          dimStr = `- Physical Dimensions: ${stats.dimensionsRaw}\n- Body Weight: ${stats.bodyWeight} lbs\n\n`;
        } else if (!stats.dimensionsApply) {
          dimStr = `- Physical Dimensions: None (${stats.characterType || 'Incorporeal/Formless'})\n- Body Weight: ${stats.bodyWeight} lbs\n\n`;
        } else {
          dimStr = `- Body Weight: ${stats.bodyWeight} lbs\n\n`;
        }
        if (dimStr) {
          updated = updated.substring(0, insertPos) + dimStr + updated.substring(insertPos);
          changes.push('Added Physical Dimensions & Body Weight');
        }
      }
    }

    // 2. Ensure [STATS & MODIFIERS] includes Max Lift Strength, Encumbrance, and accurate Speed
    let encumbranceNote = '';
    if (!stats.encumbranceApplies) {
      encumbranceNote = `(Encumbrance Immune: ${stats.encumbranceImmunityReason || 'Unaffected by carried weight / slime biology / incorporeal'})`;
    } else if (stats.isEncumbered) {
      encumbranceNote = `(Encumbered: Carried ${stats.totalCarriedWeight} lbs is ${stats.encumbranceRatio}% of body weight, exceeding ${stats.encumbranceThreshold}% threshold - Speed penalty active)`;
    } else {
      encumbranceNote = `(Unencumbered: Carried ${stats.totalCarriedWeight} lbs is ${stats.encumbranceRatio}% of body weight, within <= ${stats.encumbranceThreshold}% good threshold)`;
    }

    let speedLine = `- Speed: Walking: ${stats.currentWalkingSpeed} m/s, Running: ${stats.currentRunningSpeed} m/s ${encumbranceNote}`;
    if (stats.isMounted && stats.mountedEntityName) {
      speedLine = `- Speed: Walking: ${stats.currentWalkingSpeed} m/s, Running: ${stats.currentRunningSpeed} m/s (Mounted on [${stats.mountedEntityName}]; Unmounted base: ${stats.baseWalkingSpeed} m/s / ${stats.baseRunningSpeed} m/s)`;
    }
    if (updated.match(/^[-\s]*Speed:.*$/im)) {
      updated = updated.replace(/^[-\s]*Speed:.*$/im, speedLine);
    }

    // Encumbrance Rule line in stats
    const encumbranceRuleLine = stats.encumbranceApplies
      ? `- Encumbrance Threshold: ${stats.encumbranceThreshold}% of body weight (Carried weight at ${stats.encumbranceThreshold + 1}%+ affects character negatively with slower speed until weight drops below ${stats.encumbranceThreshold + 1}%)`
      : `- Encumbrance: Immune / Unaffected (${stats.encumbranceImmunityReason || 'Dynamic biology absorbs or ignores weight penalties'})`;

    if (updated.match(/^[-\s]*Encumbrance Threshold:.*$/im)) {
      updated = updated.replace(/^[-\s]*Encumbrance Threshold:.*$/im, encumbranceRuleLine);
    } else if (updated.match(/^[-\s]*Encumbrance:.*$/im)) {
      updated = updated.replace(/^[-\s]*Encumbrance:.*$/im, encumbranceRuleLine);
    }

    // Max Lift Strength
    const maxLiftLine = `- Max Lift Strength: ${stats.maxLiftStrength} lbs (Based on body weight and strength multiplier; heavier loads cannot be lifted)`;
    if (updated.match(/^[-\s]*Max Lift Strength:.*$/im)) {
      updated = updated.replace(/^[-\s]*Max Lift Strength:.*$/im, maxLiftLine);
    } else {
      const statsIdx = updated.indexOf('[STATS & MODIFIERS]');
      if (statsIdx >= 0) {
        const nextHeader = WeightInventoryEngine.findNextSectionHeaderIndex(updated, statsIdx + 20);
        const insertPos = nextHeader > 0 ? nextHeader : updated.length;
        updated = updated.substring(0, insertPos) + `${maxLiftLine}\n` + updated.substring(insertPos);
      }
    }

    // 3. Update or Insert Total Carried Weight summary in [CONTAINERS & CARRIED GEAR] or [INVENTORY & EQUIPMENT]
    const weightStatusText = !stats.encumbranceApplies
      ? 'IMMUNE TO ENCUMBRANCE'
      : stats.isEncumbered
        ? 'ENCUMBERED: Slower Speed'
        : 'GOOD: Unencumbered';

    const riderSummary = (stats.passengersOrRiders && stats.passengersOrRiders.length > 0) || stats.passengerWeight > 0
      ? ` (Includes ${stats.passengerWeight} lbs rider/passenger load)`
      : '';
    const weightSummaryLine = ((stats.passengersOrRiders && stats.passengersOrRiders.length > 0) || stats.passengerWeight > 0)
      ? `- Total Carried Weight on Mount/Vehicle: ${stats.totalCarriedWeight} lbs / ${stats.bodyWeight} lbs (${stats.encumbranceRatio}% body weight - ${weightStatusText}${riderSummary}) | Max Lift/Draw: ${stats.maxLiftStrength} lbs`
      : `- Total Carried Weight on Person: ${stats.totalCarriedWeight} lbs / ${stats.bodyWeight} lbs (${stats.encumbranceRatio}% body weight - ${weightStatusText}) | Max Lift: ${stats.maxLiftStrength} lbs`;

    if (updated.match(/^[-\s]*Total Carried Weight on Mount\/Vehicle:.*$/im)) {
      updated = updated.replace(/^[-\s]*Total Carried Weight on Mount\/Vehicle:.*$/im, weightSummaryLine);
    } else if (updated.match(/^[-\s]*Total Carried Weight on Person:.*$/im)) {
      updated = updated.replace(/^[-\s]*Total Carried Weight on Person:.*$/im, weightSummaryLine);
    } else if (updated.match(/^[-\s]*Total Weight:.*$/im)) {
      updated = updated.replace(/^[-\s]*Total Weight:.*$/im, weightSummaryLine);
    }

    // 4. Ensure [OWNED / STORED ITEMS (NOT ON PERSON)] section exists
    if (!updated.includes('[OWNED / STORED ITEMS (NOT ON PERSON)]') && !updated.includes('[OWNED / STORED') && !updated.includes('[STORED ITEMS')) {
      const loreIdx = updated.indexOf('[STATUS EFFECTS & LORE]');
      const insertPos = loreIdx >= 0 ? loreIdx : updated.length;
      const storedSection = `[OWNED / STORED ITEMS (NOT ON PERSON)]\n- (Items owned by character stored at home, vault, camp, or stash. Their weight is NOT added to carried weight)\n\n`;
      updated = updated.substring(0, insertPos) + storedSection + updated.substring(insertPos);
      changes.push('Added Owned/Stored Items section');
    }

    // 5. Ensure [CURRENTLY HOLDING] section reflects dynamic held items if applicable
    if (stats.holdingCapacity.applies && (stats.currentlyHolding.length > 0 || updated.includes('[CURRENTLY HOLDING]'))) {
      const holdingLines: string[] = [];
      holdingLines.push(`- Holding Anatomy: ${stats.holdingCapacity.holdingLimbsDescription}`);
      const statusSuffix = stats.holdingCapacity.hasOverflowHold
        ? ` (${stats.holdingCapacity.currentHeldCount}/${stats.holdingCapacity.maxStandardHoldCount} - Overflow Hold: Items risk dropping!)`
        : stats.holdingCapacity.isFull
          ? ` (${stats.holdingCapacity.currentHeldCount}/${stats.holdingCapacity.maxStandardHoldCount} Occupied - Full)`
          : ` (${stats.holdingCapacity.currentHeldCount}/${stats.holdingCapacity.maxStandardHoldCount} Occupied - ${stats.holdingCapacity.freeSlots} Free)`;
      holdingLines.push(`- Holding Capacity & Status:${statusSuffix}`);
      holdingLines.push(`- Items Currently Held:`);
      if (stats.currentlyHolding.length === 0) {
        holdingLines.push(`  * (None - Hands/Appendages free)`);
      } else {
        for (const h of stats.currentlyHolding) {
          // Clean name of any existing limb prefixes, repeated 'Hands:', and repeated overflow suffixes
          let cleanName = h.name
            .replace(/^[-*•>\s]*(?:(?:right|left|main|off|both)?\s*hands?|jaws?|mouth|teeth|talons?|beak|claws?|tentacles?|trunk|held\s+in\s+jaws?|held\s+in\s+mouth|held\s+in\s+hands?|overflow\s+hold)[:=\s]+/i, '')
            .replace(/^weight\s*[:=]\s*[0-9.]+\s*lbs?\.?\s*(?:dimensions?\s*[:=]\s*)?/i, '')
            .replace(/(?:\s*\.?\s*\(Overflow:\s*Yes[^)]*\))+/gi, '')
            .trim();
          if (!cleanName || cleanName.toLowerCase() === 'hands' || cleanName.toLowerCase().includes('overflow rule')) {
            continue;
          }

          let cleanDim = h.dimensions.raw || 'Standard size';
          const dimMatch = cleanDim.match(/([0-9.]+\s*x\s*[0-9.]+(?:\s*x\s*[0-9.]+)?\s*(?:in|inch|inches|cm|m|ft)?)/i);
          if (dimMatch) {
            cleanDim = dimMatch[1].trim();
          } else if (cleanDim.length > 25 || cleanDim.includes(':') || cleanDim.includes('(')) {
            if (h.dimensions.height !== undefined && h.dimensions.width !== undefined) {
              cleanDim = `${h.dimensions.height}x${h.dimensions.width}${h.dimensions.depth !== undefined ? `x${h.dimensions.depth}` : ''} inches`;
            } else {
              cleanDim = 'Standard size';
            }
          }

          const limbPrefix = h.holdingLimb ? `${h.holdingLimb}: ` : '';
          const overflowSuffix = h.isOverflowHold ? ' (Overflow: Yes - risks dropping)' : '';
          holdingLines.push(`  * ${limbPrefix}${cleanName}: Weight: ${h.weight} lbs. Dimensions: ${cleanDim}.${overflowSuffix}`);
        }
      }

      const holdingBlock = `[CURRENTLY HOLDING]\n${holdingLines.join('\n')}\n\n`;

      if (updated.includes('[CURRENTLY HOLDING]')) {
        const holdIdx = updated.indexOf('[CURRENTLY HOLDING]');
        const nextH = WeightInventoryEngine.findNextSectionHeaderIndex(updated, holdIdx + 19);
        const replaceEnd = nextH > 0 ? nextH : updated.length;
        updated = updated.substring(0, holdIdx) + holdingBlock + updated.substring(replaceEnd);
      } else {
        const invIdx = updated.indexOf('[CONTAINERS & CARRIED GEAR]');
        const insertPos = invIdx >= 0 ? invIdx : (updated.indexOf('[INVENTORY & EQUIPMENT]') >= 0 ? updated.indexOf('[INVENTORY & EQUIPMENT]') : updated.indexOf('[ATTACKS'));
        if (insertPos >= 0) {
          updated = updated.substring(0, insertPos) + holdingBlock + updated.substring(insertPos);
        } else {
          updated += `\n${holdingBlock}`;
        }
      }
      changes.push('Synchronized Currently Holding section');
    }

    // Synchronize container item lines with carried currencies:
    // If currency was removed from a container (e.g. given away or spent from wallet), remove or update the line under Carried Inventory (Inside Containers)
    const carriedInvIdx = updated.search(/^[-\s]*carried inventory.*:$/im);
    if (carriedInvIdx >= 0) {
      const lineEnd = updated.indexOf('\n', carriedInvIdx);
      const startPos = lineEnd >= 0 ? lineEnd + 1 : updated.length;
      const nextHeaderIdx = WeightInventoryEngine.findNextSectionHeaderIndex(updated, startPos);
      const endPos = nextHeaderIdx >= 0 ? nextHeaderIdx : updated.length;

      const invBlock = updated.substring(startPos, endPos);
      const invLines = invBlock.split('\n');
      let invModified = false;
      const newInvLines: string[] = [];

      for (const invLine of invLines) {
        const trimmed = invLine.trim();
        if (!trimmed) {
          newInvLines.push(invLine);
          continue;
        }

        const cEntries = WeightInventoryEngine.parseCurrencyEntries(invLine);
        if (cEntries.length > 0) {
          const contMatch = invLine.match(/container[:=\s]+\[?([a-zA-Z0-9_\s'-]+)\]?/i);
          const targetContName = (contMatch ? contMatch[1].trim() : (cEntries[0].container || '')).toLowerCase();

          // Check if any carried currency remains for this container/currency
          const matchingCarried = stats.currency.carriedCurrencies.find(cc => {
            const ccCont = (cc.container || '').toLowerCase();
            const containerMatches = !targetContName || !ccCont ||
              ccCont.includes(targetContName) ||
              targetContName.includes(ccCont);

            if (containerMatches) {
              const ccName = cc.name.toLowerCase();
              const entryName = cEntries[0].name.toLowerCase();
              return (
                ccName === entryName ||
                (ccName.length > 2 && entryName.includes(ccName)) ||
                (entryName.length > 2 && ccName.includes(entryName))
              );
            }
            return false;
          });

          if (!matchingCarried || matchingCarried.amount <= 0) {
            // Currency was given away or spent from this container!
            invModified = true;
            changes.push(`Removed spent/given currency (${cEntries[0].amount} ${cEntries[0].name}) from container ${targetContName || 'gear'}`);
            continue;
          } else if (matchingCarried.amount !== cEntries[0].amount) {
            // Currency amount changed; update line with new accurate amount
            const oldAmtStr = cEntries[0].amount.toString();
            const newAmtStr = matchingCarried.amount.toString();
            const updatedInvLine = invLine
              .replace(new RegExp(`\\$${oldAmtStr}\\b`), `$${newAmtStr}`)
              .replace(new RegExp(`\\b${oldAmtStr}\\b`), newAmtStr);
            newInvLines.push(updatedInvLine);
            invModified = true;
            changes.push(`Updated currency in container ${targetContName} from ${cEntries[0].amount} to ${matchingCarried.amount}`);
            continue;
          }
        }
        newInvLines.push(invLine);
      }

      if (invModified) {
        const nonBlank = newInvLines.filter(l => l.trim() && !l.trim().startsWith('#'));
        if (nonBlank.length === 0) {
          newInvLines.length = 0;
          newInvLines.push('  * (None)');
        }
        updated = updated.substring(0, startPos) + newInvLines.join('\n') + (endPos < updated.length ? '\n\n' : '') + updated.substring(endPos);
      }
    }

    // 6. Ensure [CURRENCY & FINANCIAL BALANCE] section is present and accurate if currency exists or section was present
    if (stats.currency.hasCurrency || updated.includes('[CURRENCY & FINANCIAL BALANCE]') || updated.includes('[CURRENCY')) {
      const currencyLines: string[] = [];
      currencyLines.push(`- Currency Type: ${stats.currency.currencyType}`);
      currencyLines.push(`- Carried Balance (On Person):`);
      if (stats.currency.carriedCurrencies.length === 0) {
        currencyLines.push(`  * None (0)`);
      } else {
        for (const c of stats.currency.carriedCurrencies) {
          const contSuffix = c.container ? ` [Container: ${c.container}]` : '';
          const wSuffix = c.weight !== undefined ? ` (Weight: ${c.weight} lbs)` : '';
          currencyLines.push(`  * ${c.amount.toLocaleString()} ${c.name}${contSuffix}${wSuffix}`);
        }
      }
      currencyLines.push(`- Stored / Remote Balance (Not on Person):`);
      if (stats.currency.storedCurrencies.length === 0) {
        currencyLines.push(`  * None (0)`);
      } else {
        for (const c of stats.currency.storedCurrencies) {
          const locStr = c.location ? ` [Location: ${c.location}]` : '';
          currencyLines.push(`  * ${c.amount.toLocaleString()} ${c.name}${locStr}`);
        }
      }
      currencyLines.push(`- Total Net Worth: ${stats.currency.totalNetWorthSummary}`);

      const currencyBlock = `[CURRENCY & FINANCIAL BALANCE]\n${currencyLines.join('\n')}\n\n`;

      if (updated.includes('[CURRENCY & FINANCIAL BALANCE]')) {
        const currIdx = updated.indexOf('[CURRENCY & FINANCIAL BALANCE]');
        const nextH = WeightInventoryEngine.findNextSectionHeaderIndex(updated, currIdx + 28);
        const replaceEnd = nextH > 0 ? nextH : updated.length;
        updated = updated.substring(0, currIdx) + currencyBlock + updated.substring(replaceEnd);
      } else if (updated.includes('[CURRENCY')) {
        const currIdx = updated.indexOf('[CURRENCY');
        const nextH = WeightInventoryEngine.findNextSectionHeaderIndex(updated, currIdx + 10);
        const replaceEnd = nextH > 0 ? nextH : updated.length;
        updated = updated.substring(0, currIdx) + currencyBlock + updated.substring(replaceEnd);
      } else {
        const loreIdx = updated.indexOf('[STATUS EFFECTS & LORE]');
        const insertPos = loreIdx >= 0 ? loreIdx : updated.length;
        updated = updated.substring(0, insertPos) + currencyBlock + updated.substring(insertPos);
      }
      changes.push('Synchronized Currency & Financial Balance section');
    }

    return {
      updatedContent: updated,
      stats,
      changes
    };
  }
}
