export interface FileData {
  content: string;
  displayName?: string;
}

export interface FileMap {
  [filename: string]: string; // content
}

export interface FileMetadata {
  [filename: string]: {
    displayName: string;
  };
}

export interface CurrencyTransaction {
  name: string;
  amount: number;
  operation: 'add' | 'deduct' | 'transfer';
  container?: string;
  giver?: string;
  recipient?: string;
  rawText?: string;
}

export interface InventoryTransaction {
  name: string;
  quantity?: number;
  operation: 'add' | 'remove' | 'equip' | 'unequip' | 'transfer' | 'drop';
  container?: string;
  targetCharacter?: string;
}

export interface UpdateItem {
  /** The category of update (e.g. Health change, Item gained) */
  type: 'stat' | 'item' | 'time' | 'location' | 'status' | 'misc' | 'currency';
  /** Human readable description (e.g. "Health -10") */
  text: string;
  /** Numeric value associated with the update (e.g. -10) */
  value: number;
  /** High-level category for dynamic classification without hardcoded keywords */
  category?: 'currency' | 'inventory' | 'stat' | 'energy' | 'mount' | 'time' | 'location' | 'misc';
  currency?: CurrencyTransaction;
  inventory?: InventoryTransaction;
}

export interface CheckDef {
  name?: string;
  description?: string;
  difficulty?: 'trivial' | 'easy' | 'moderate' | 'hard' | 'very_hard' | 'near_impossible';
  thresholds?: { [outcome: string]: number };
  // AI-selected rules for dynamic modifier calculation
  rules?: string[];
  // Alternate AI format fields
  check?: string;
  stat?: string;
  threshold?: number;
  modifier?: number;
}

export interface AIResponse {
  narrative: string;
  updates?: UpdateItem[];
  files?: { [filename: string]: FileData | string | null };
  checks?: CheckDef[];
  gameOver?: boolean;
  recommendations?: string[];
  currencyTransactions?: CurrencyTransaction[];
  inventoryTransactions?: InventoryTransaction[];
}

export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface NarrativeEntry {
  id: string;
  text: string;
  type: 'system' | 'user' | 'ai';
  recommendations?: string[];
}