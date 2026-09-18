import { FileMap, FileMetadata } from '../types';

export class FileSystem {
  private files: FileMap = {};
  private metadata: FileMetadata = {};
  private readonly STORAGE_KEY_FILES = 'aimud_files';
  private readonly STORAGE_KEY_META = 'aimud_metadata';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_FILES);
      if (stored) {
        this.files = JSON.parse(stored);
      }
      const storedMeta = localStorage.getItem(this.STORAGE_KEY_META);
      if (storedMeta) {
        this.metadata = JSON.parse(storedMeta);
      }
    } catch (e) {
      console.error('Failed to load files from storage:', e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify(this.files));
      localStorage.setItem(this.STORAGE_KEY_META, JSON.stringify(this.metadata));
    } catch (e: any) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('Storage quota exceeded. Evicting volatile cache entries...');
        this.pruneVolatileStorage();
      } else {
        console.error('Failed to save files:', e);
      }
    }
  }

  /**
   * If local storage fills up (due to multi-page maps or rich logs),
   * evicts transient snapshots while strictly protecting core world and player files.
   */
  private pruneVolatileStorage() {
    try {
      const protectedFiles = new Set(['WorldRules.txt', 'Guide.txt', 'WorldTime.txt', 'CurrentMap.json']);
      
      // Retain player files
      for (const key of Object.keys(this.files)) {
        if (key.endsWith('.txt') && key.includes('-')) {
          protectedFiles.add(key);
        }
      }

      // Evict old debug logs or temporary snapshots if any exist
      for (const key of Object.keys(this.files)) {
        if (!protectedFiles.has(key) && (key.startsWith('debug_') || key.startsWith('temp_'))) {
          delete this.files[key];
          delete this.metadata[key];
        }
      }

      localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify(this.files));
      localStorage.setItem(this.STORAGE_KEY_META, JSON.stringify(this.metadata));
    } catch (e) {
      console.error('Critical: Storage quota could not be resolved.', e);
    }
  }

  write(filename: string, content: string | any, displayName: string | null = null) {
    const stringified = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    this.files[filename] = stringified;

    if (displayName) {
      this.metadata[filename] = { displayName };
    } else if (!this.metadata[filename]) {
      this.metadata[filename] = { displayName: this.generateDisplayName(filename) };
    }
    this.saveToStorage();
  }

  private generateDisplayName(filename: string): string {
    let name = filename.replace(/\.(txt|json)$/, '');
    name = name.replace(/_/g, ' ');
    name = name.replace(/\s+\d+$/, '');
    return name;
  }

  getDisplayName(filename: string): string {
    let base = filename.replace(/\.txt|\.json/g, '');
    base = base.replace(/target\(.*?\)(?:\[(.*?)\])?/g, (_, inner) => inner || '');
    base = base.replace(/hide\[(.*?)\]/g, '$1');
    return base.trim() || filename;
  }

  read(filename: string): string | null {
    return this.files[filename] || null;
  }

  exists(filename: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, filename);
  }

  delete(filename: string) {
    delete this.files[filename];
    delete this.metadata[filename];
    this.saveToStorage();
  }

  list(): string[] {
    return Object.keys(this.files).sort();
  }

  getAll(): FileMap {
    return { ...this.files };
  }

  exportState(): { files: FileMap; metadata: FileMetadata } {
    return { files: { ...this.files }, metadata: { ...this.metadata } };
  }

  importState(state: { files: FileMap; metadata: FileMetadata }) {
    if (!state) return;
    this.files = { ...(state.files || {}) };
    this.metadata = { ...(state.metadata || {}) };
    this.saveToStorage();
  }

  clear() {
    this.files = {};
    this.metadata = {};
    localStorage.removeItem(this.STORAGE_KEY_FILES);
    localStorage.removeItem(this.STORAGE_KEY_META);
  }

  findFileByReference(ref: string): string | null {
    if (!ref) return null;
    let cleanRef = ref.trim().replace(/^\[+|\]+$/g, '').trim();
    // Strip accidental .txt or .json extensions from search
    cleanRef = cleanRef.replace(/\.(txt|json)$/i, '').trim();
    if (!cleanRef) return null;

    // 1. Direct match on filename
    if (this.exists(cleanRef)) return cleanRef;
    if (this.exists(cleanRef + '.txt')) return cleanRef + '.txt';
    if (this.exists(cleanRef + '.json')) return cleanRef + '.json';

    const refLower = cleanRef.toLowerCase();

    // 2. Case-insensitive exact match on filename (with or without extension)
    for (const filename of Object.keys(this.files)) {
      const fLower = filename.toLowerCase();
      const fBaseLower = fLower.replace(/\.(txt|json)$/, '');
      if (fBaseLower === refLower || fLower === refLower) {
        return filename;
      }
    }

    // 3. Case-insensitive exact match on display name
    for (const [filename, meta] of Object.entries(this.metadata)) {
      if (meta.displayName) {
        const dLower = meta.displayName.toLowerCase().replace(/\.(txt|json)$/, '').trim();
        if (dLower === refLower) {
          return filename;
        }
      }
    }

    // 4. Slugified match on filename
    const refSlug = refLower.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (refSlug.length > 2) {
      for (const filename of Object.keys(this.files)) {
        const fileSlug = filename.toLowerCase().replace(/\.(txt|json)$/, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (fileSlug === refSlug) {
          return filename;
        }
      }
    }

    // 5. Safe partial match on display name
    for (const [filename, meta] of Object.entries(this.metadata)) {
      if (meta.displayName) {
        const displayLower = meta.displayName.toLowerCase();
        if (displayLower === refLower) return filename;
        if (refLower.length >= 4 && displayLower.includes(refLower)) {
          return filename;
        }
      }
    }

    // 6. Safe partial match on filename
    for (const filename of Object.keys(this.files)) {
      const nameWithoutExt = filename.toLowerCase().replace(/\.(txt|json)$/, '');
      if (refLower.length >= 4 && nameWithoutExt.includes(refLower)) {
        return filename;
      }
    }

    // 7. Search WITHIN file contents (e.g. unique items, weapons, attacks, abilities, or character names defined within files)
    if (cleanRef.length >= 2) {
      const escaped = cleanRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // 7a. High-priority structured match within content:
      // Look for line starting with entity or attack/ability/item/character declaration
      // e.g. "Full Name: X", "- X:", "AttackName: X", "[X]"
      const highPriorityRegex = new RegExp(`(?:^|[\\r\\n])[\\s\\-\\*]*(?:Full Name:\\s*)?(?:\\[)?${escaped}(?:\\])?[\\s]*[:\\-\\r\\n]`, 'i');
      for (const [filename, content] of Object.entries(this.files)) {
        if (typeof content === 'string' && highPriorityRegex.test(content)) {
          return filename;
        }
      }

      // 7b. General entity name occurrence within content as whole phrase/word boundary
      if (cleanRef.length >= 3) {
        const wordBoundaryRegex = new RegExp(`\\b${escaped}\\b`, 'i');
        for (const [filename, content] of Object.entries(this.files)) {
          if (typeof content === 'string' && wordBoundaryRegex.test(content)) {
            return filename;
          }
        }
      }
    }

    return null;
  }
}
