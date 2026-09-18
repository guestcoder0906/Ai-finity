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

export interface UpdateItem {
  /** The category of update (e.g. Health change, Item gained) */
  type: 'stat' | 'item' | 'time' | 'location' | 'status' | 'misc';
  /** Human readable description (e.g. "Health -10") */
  text: string;
  /** Numeric value associated with the update (e.g. -10) */
  value: number;
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