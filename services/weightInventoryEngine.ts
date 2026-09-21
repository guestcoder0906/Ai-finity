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
      return { height, width, depth, raw: text, applies: true, unit: 'inches' };
    }

    // Pattern B: "3x5x8" or "3x5" or "3 x 5 inches" or "3x0 inch"
    const xPattern = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*x\s*([0-9]+(?:\.[0-9]+)?)(?:\s*x\s*([0-9]+(?:\.[0-9]+)?))?\s*(?:in|inch|inches|cm|m|ft)?/);
    if (xPattern) {
      const dim1 = parseFloat(xPattern[1]);
      const dim2 = parseFloat(xPattern[2]);
      const dim3 = xPattern[3] ? parseFloat(xPattern[3]) : undefined;
      return { height: dim1, width: dim2, depth: dim3, raw: text, applies: true, unit: 'inches' };
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

    return {
      height,
      width,
      depth,
      raw: text,
      applies: height !== undefined || width !== undefined || depth !== undefined || !lower.includes('none'),
      unit: 'inches'
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
      lower.startsWith('(none)')
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

    if (!name || name.toLowerCase() === 'none' || name.toLowerCase() === '0 lbs') return null;

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
    const containerMatch = rest.match(/container[:=\s]*\[?([a-zA-Z0-9_\s]+)\]?/i);
    if (containerMatch) {
      containerName = containerMatch[1].trim();
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
    const activeWeightEffects: CharacterPhysicalStats['activeWeightEffects'] = [];

    let currentSection = '';
    let activeContainerName = '';
    let activeSubsection: 'containers' | 'equipped' | 'inside_containers' | 'general' = 'general';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect Section Headers
      const secMatch = line.match(/^\[(.*?)\]$/);
      if (secMatch) {
        currentSection = secMatch[1].toUpperCase();
        activeContainerName = '';
        activeSubsection = 'general';
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

      // 2. [STATS & MODIFIERS] Section
      if (currentSection.includes('STAT') || currentSection.includes('MODIFIER')) {
        // Speed
        if (lower.includes('speed:')) {
          const walkMatch = line.match(/walking[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i);
          if (walkMatch) {
            baseWalkingSpeed = parseFloat(walkMatch[1]);
            currentWalkingSpeed = baseWalkingSpeed;
          }
          const runMatch = line.match(/running[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:m\/s)?/i);
          if (runMatch) {
            baseRunningSpeed = parseFloat(runMatch[1]);
            currentRunningSpeed = baseRunningSpeed;
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
        // Check for subsection headers
        if (
          lower.startsWith('- containers equipped/carried:') ||
          lower.startsWith('- containers carried:') ||
          lower.startsWith('- containers equipped:') ||
          lower.startsWith('- containers:') ||
          lower.startsWith('containers equipped:') ||
          lower.startsWith('containers:')
        ) {
          activeSubsection = 'containers';
          activeContainerName = '';
          continue;
        }

        if (
          lower.startsWith('- equipped gear & armor:') ||
          lower.startsWith('- equipped gear:') ||
          lower.startsWith('- equipped armor:') ||
          lower.startsWith('- equipped items:') ||
          lower.startsWith('- worn gear:') ||
          lower.startsWith('- worn armor:') ||
          lower.startsWith('- equipped:') ||
          lower.startsWith('equipped gear & armor:') ||
          lower.startsWith('equipped gear:') ||
          lower.startsWith('equipped armor:')
        ) {
          activeSubsection = 'equipped';
          activeContainerName = '';
          continue;
        }

        if (
          lower.startsWith('- carried inventory (inside containers):') ||
          lower.startsWith('- carried inventory:') ||
          lower.startsWith('- items inside containers:') ||
          lower.startsWith('- items in containers:') ||
          lower.startsWith('- container inventory:') ||
          lower.startsWith('- carried items:') ||
          lower.startsWith('carried inventory:') ||
          lower.startsWith('carried items:')
        ) {
          activeSubsection = 'inside_containers';
          if (!activeContainerName && containers.length > 0) {
            activeContainerName = containers[0].name;
          }
          continue;
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
        const isContainerDef = (
          lower.includes('backpack') ||
          lower.includes('satchel') ||
          lower.includes('pouch') ||
          lower.includes('sack') ||
          lower.includes('bag') ||
          lower.includes('haversack') ||
          lower.includes('chest')
        ) && (
          lower.includes('dimension') ||
          lower.includes('capacity') ||
          lower.includes('max space') ||
          lower.includes('max weight')
        );

        if (isContainerDef) {
          const name = line.split(/[:=]/)[0].replace(/^[-*•>]\s*/, '').trim();

          // Distinguish container empty weight from max capacity
          let containerWeight = 2.0; // default empty container wt
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
          const capMatch = line.match(/(?:max\s*(?:weight|capacity)|capacity)[:=\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:lbs?|pounds?)/i);
          if (capMatch) {
            maxWeightCapacity = parseFloat(capMatch[1]);
          }

          const maxDim = this.parseDimensions(line);

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
            const targetName = item.containerName || activeContainerName || (containers.length > 0 ? containers[0].name : '');
            const cont = containers.find(c => c.name.toLowerCase() === targetName.toLowerCase()) || containers[0];

            if (cont) {
              item.category = 'carried';
              item.containerName = cont.name;

              // Auto-Equip Rule: If item is wearable (e.g. leather tunic, cloth robes, armor) and character has no equipped armor,
              // auto-equip it unless marked as spare/backup
              const isWearable = (
                lower.includes('armor base') ||
                lower.includes('armor:') ||
                (this.isFoldableItem(item.name, line) && (lower.includes('tunic') || lower.includes('robe') || lower.includes('cloak') || lower.includes('armor')))
              );
              const alreadyHasArmor = equippedGear.some(g => {
                const gl = g.name.toLowerCase();
                return gl.includes('tunic') || gl.includes('armor') || gl.includes('robe') || gl.includes('cuirass') || gl.includes('mail');
              });

              if (isWearable && !alreadyHasArmor && !lower.includes('spare') && !lower.includes('backup') && equippedGear.length === 0) {
                item.category = 'equipped';
                item.containerName = undefined;
                item.isOverflow = false;
                item.doesNotFit = false;
                equippedGear.push(item);
              } else {
                // Check container fit with new rule
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
              }
            } else {
              carriedItems.push(item);
            }
          } else if (lower.includes('equipped') || lower.includes('wielding') || lower.includes('wearing') || lower.includes('armor:')) {
            item.category = 'equipped';
            equippedGear.push(item);
          } else {
            carriedItems.push(item);
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

    // Calculate Total Carried Weight on Person:
    // = Equipped Gear + Containers (empty weight) + Items inside containers + Carried loose items
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
      containers,
      equippedGear,
      carriedItems,
      storedItems,
      activeWeightEffects
    };
  }

  /**
   * Synchronizes and writes the exact calculated weight, dimensions, container overflow,
   * encumbrance status, and adjusted speed directly back into the character file text.
   * This guarantees that the code automatically adds all weight and applies dynamic encumbrance.
   */
  public static syncCharacterFileContent(
    content: string,
    currentTimestamp?: string
  ): { updatedContent: string; stats: CharacterPhysicalStats; changes: string[] } {
    const stats = this.parseCharacterStatsAndInventory(content, currentTimestamp);
    const changes: string[] = [];

    let updated = content;

    // 1. Ensure [NAME & DESCRIPTION] contains Physical Dimensions and Body Weight
    if (!updated.includes('Physical Dimensions:') && !updated.includes('Dimensions:')) {
      const nameDescIdx = updated.indexOf('[NAME & DESCRIPTION]');
      if (nameDescIdx >= 0) {
        const nextHeader = updated.indexOf('[', nameDescIdx + 20);
        const insertPos = nextHeader > 0 ? nextHeader : updated.length;
        const dimStr = stats.dimensionsApply
          ? `- Physical Dimensions: Height: 5'11", Width: 20", Depth: 12"\n- Body Weight: ${stats.bodyWeight} lbs\n\n`
          : `- Physical Dimensions: None (${stats.characterType || 'Incorporeal/Formless'})\n- Body Weight: ${stats.bodyWeight} lbs\n\n`;
        updated = updated.substring(0, insertPos) + dimStr + updated.substring(insertPos);
        changes.push('Added Physical Dimensions & Body Weight');
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

    const speedLine = `- Speed: Walking: ${stats.currentWalkingSpeed} m/s, Running: ${stats.currentRunningSpeed} m/s ${encumbranceNote}`;
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
        const nextHeader = updated.indexOf('[', statsIdx + 20);
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

    const weightSummaryLine = `- Total Carried Weight on Person: ${stats.totalCarriedWeight} lbs / ${stats.bodyWeight} lbs (${stats.encumbranceRatio}% body weight - ${weightStatusText}) | Max Lift: ${stats.maxLiftStrength} lbs`;

    if (updated.match(/^[-\s]*Total Carried Weight on Person:.*$/im)) {
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

    return {
      updatedContent: updated,
      stats,
      changes
    };
  }
}
