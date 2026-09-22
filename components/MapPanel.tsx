import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { FileSystem } from '../services/fileSystem';
import { ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { resolveMapEntityName } from '../services/visibilityEngine';

interface MapPanelProps {
  fileSystem: FileSystem;
  files: string[];
  username: string;
  debugMode: boolean;
  syncCount: number;
}

export interface MapPanelHandle {
  captureScreenshot: () => Promise<string | null>;
}

const MapPanel = forwardRef<MapPanelHandle, MapPanelProps>(({ fileSystem, files, username, debugMode, syncCount }, ref) => {
  const [mapData, setMapData] = useState<any>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aimud_map_show_all_labels') === 'true';
    }
    return false;
  });

  const toggleShowAllLabels = () => {
    setShowAllLabels((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('aimud_map_show_all_labels', String(next));
      }
      return next;
    });
  };

  const dragStartPos = useRef({ x: 0, y: 0 });
  const panStartPos = useRef({ x: 0, y: 0 });
  const touchStartRef = useRef<{ x: number; y: number; dist?: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    captureScreenshot: async () => {
      const svgEl = svgRef.current;
      if (!svgEl) return null;

      let url = '';
      try {
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgEl);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        // Add 800ms timeout race to prevent infinite hanging if image load fails to trigger
        const loaded = await Promise.race([
          new Promise<boolean>((resolve) => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
          }),
          new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), 800);
          })
        ]);

        if (!loaded) {
          if (url) URL.revokeObjectURL(url);
          return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (url) URL.revokeObjectURL(url);
          return null;
        }

        // Draw black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(url);
        url = '';
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl.split(',')[1] || null;
      } catch (e) {
        console.error('Failed to capture map screenshot:', e);
        return null;
      } finally {
        if (url) {
          try { URL.revokeObjectURL(url); } catch (_) {}
        }
      }
    }
  }));

  useEffect(() => {
    const content = fileSystem.read('CurrentMap.json');
    if (content) {
      try {
        const parsed = JSON.parse(content);
        setMapData(parsed);

        // Normalize pages to check if active player's page changed
        const currentPages = parsed?.pages && Array.isArray(parsed.pages)
          ? parsed.pages
          : Array.isArray(parsed)
            ? parsed
            : (parsed?.areas ? [parsed] : []);

        // Auto-switch to the page containing this active player if available (prefer latest page where player moved)
        if (username && currentPages.length > 0) {
          const userLower = username.toLowerCase();
          let targetIndex = -1;
          for (let i = currentPages.length - 1; i >= 0; i--) {
            if (currentPages[i].players?.some((pl: any) => (pl.username || pl.name || pl.characterName || '').toLowerCase() === userLower)) {
              targetIndex = i;
              break;
            }
          }
          if (targetIndex !== -1) {
            setCurrentPageIndex(targetIndex);
          }
        }
      } catch (e) {
        console.error("Failed to parse CurrentMap.json", e);
      }
    } else {
      setMapData(null);
    }
  }, [fileSystem, files, syncCount, username]);

  // Robust multi-structure resolution for pages:
  let pages: any[] = [];
  if (mapData?.pages && Array.isArray(mapData.pages)) {
    pages = mapData.pages;
  } else if (Array.isArray(mapData)) {
    pages = mapData;
  } else if (mapData?.areas) {
    pages = [{ name: 'World Map', ...mapData }];
  }

  // Cross-page deduplication guard: Ensure each player is only on ONE map page
  // If the AI or stale state forgot to remove the player's last position on the previous map,
  // scanning from latest page (highest index) to earliest page preserves the active new position
  // and purges the duplicate from earlier map pages.
  if (pages.length > 1) {
    const seenPlayerKeys = new Set<string>();
    for (let pIdx = pages.length - 1; pIdx >= 0; pIdx--) {
      const p = pages[pIdx];
      if (Array.isArray(p.players)) {
        p.players = p.players.filter((pl: any) => {
          const key = (pl.username || pl.name || pl.characterName || '').trim().toLowerCase();
          if (!key) return true;
          if (seenPlayerKeys.has(key)) {
            return false; // Drop duplicate player from older map page
          }
          seenPlayerKeys.add(key);
          return true;
        });
      }
    }
  }

  // Intra-page deduplication guard: Ensure no player has multiple entries on the same page
  for (const p of pages) {
    if (Array.isArray(p.players) && p.players.length > 1) {
      const pageSeen = new Set<string>();
      const deduped: any[] = [];
      for (let i = p.players.length - 1; i >= 0; i--) {
        const pl = p.players[i];
        const key = (pl.username || pl.name || pl.characterName || '').trim().toLowerCase();
        if (key && pageSeen.has(key)) continue;
        if (key) pageSeen.add(key);
        deduped.unshift(pl);
      }
      p.players = deduped;
    }
  }

  // Ensure every player and NPC with a character file is represented on the map
  if (pages.length > 0) {
    const allUsernamesOnMap = new Set<string>();
    const allNpcNamesOnMap = new Set<string>();

    pages.forEach(p => {
      (p.players || []).forEach((pl: any) => {
        const u = (pl.username || pl.name || pl.characterName || '').trim().toLowerCase();
        if (u) allUsernamesOnMap.add(u);
      });
      (p.npcs || []).forEach((n: any) => {
        const nName = (n.name || '').trim().toLowerCase();
        if (nName) {
          allNpcNamesOnMap.add(nName);
          allNpcNamesOnMap.add(nName.replace(/-npc$/, ''));
        }
      });
    });

    const playerFiles: { filename: string; charName: string; username: string }[] = [];
    const npcFiles: { filename: string; charName: string }[] = [];

    (files || []).forEach(f => {
      if (!f.endsWith('.txt')) return;
      if (f.startsWith('World') || f.startsWith('Guide') || f.startsWith('Log') || f.startsWith('History') || f.startsWith('Event') || f.startsWith('Combat')) return;

      const base = f.replace(/\.txt$/, '');
      const lower = f.toLowerCase();

      if (lower.endsWith('-npc') || lower.endsWith('_npc') || lower.includes(' npc')) {
        const charName = base.replace(/[-_]npc$/i, '').trim();
        npcFiles.push({ filename: f, charName: charName || base });
      } else if (f.includes('-')) {
        const parts = base.split('-');
        const suffix = parts[parts.length - 1].trim();
        const charName = parts.slice(0, -1).join('-').trim();
        if (suffix.toLowerCase() === 'npc' || suffix.toLowerCase() === 'bot' || suffix.toLowerCase() === 'ai') {
          npcFiles.push({ filename: f, charName: charName || base });
        } else {
          playerFiles.push({ filename: f, charName: charName || suffix, username: suffix });
        }
      } else {
        const content = fileSystem.read(f);
        if (content && (content.includes('[NAME & DESCRIPTION]') || content.includes('[STATS & MODIFIERS]') || content.includes('[CURRENTLY HOLDING]'))) {
          npcFiles.push({ filename: f, charName: base });
        }
      }
    });

    playerFiles.forEach(pf => {
      if (pf.username && !allUsernamesOnMap.has(pf.username.toLowerCase()) && !allUsernamesOnMap.has(pf.charName.toLowerCase())) {
        if (!pages[0].players) pages[0].players = [];
        const offset = pages[0].players.length;
        pages[0].players.push({
          username: pf.username,
          characterName: pf.charName || pf.username,
          x: 10 + (offset * 8),
          y: 15 + (offset * 6),
          facing: 0
        });
        allUsernamesOnMap.add(pf.username.toLowerCase());
      }
    });

    npcFiles.forEach(nf => {
      const checkKey = nf.charName.toLowerCase();
      if (!allNpcNamesOnMap.has(checkKey) && !allNpcNamesOnMap.has(`${checkKey}-npc`)) {
        if (!pages[0].npcs) pages[0].npcs = [];
        const offset = pages[0].npcs.length;
        const displayName = nf.charName.toLowerCase().endsWith('-npc') ? nf.charName : `${nf.charName}-npc`;
        pages[0].npcs.push({
          name: displayName,
          type: 'npc',
          x: 15 + (offset * 7) % 60,
          y: 18 + (offset * 5) % 60,
          description: `NPC from ${nf.filename}`
        });
        allNpcNamesOnMap.add(checkKey);
        allNpcNamesOnMap.add(`${checkKey}-npc`);
      }
    });
  }

  const safePageIndex = pages.length > 0 ? Math.max(0, Math.min(currentPageIndex, pages.length - 1)) : 0;

  // Auto-reset pan and zoom when changing pages
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [safePageIndex]);

  // Window listeners to prevent stuck dragging state
  useEffect(() => {
    const handleGlobalUp = () => {
      setIsDragging(false);
    };
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, []);

  // Non-passive wheel event listener attached directly to the DOM node
  // This completely resolves the "Unable to preventDefault inside passive event listener invocation" error
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom((prev) => Math.max(0.2, Math.min(8, +(prev * zoomFactor).toFixed(2))));
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheelNative);
    };
  }, [pages.length, safePageIndex]);

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 italic p-6 text-center gap-4 bg-black">
        <div className="w-12 h-12 border-2 border-dashed border-gray-800 rounded-full animate-spin-slow flex items-center justify-center text-xl">🗺️</div>
        <div>
          <p className="font-bold text-gray-400 not-italic">NO ACTIVE MAP DATA</p>
          <p className="mt-1 text-[10px]">The AI engine generates the world as you move.</p>
        </div>
      </div>
    );
  }

  const currentPage = pages[safePageIndex];
  if (currentPage) {
    // Only inherit root-level entities to page 0 if it is a single-page map
    if (pages.length === 1 && safePageIndex === 0) {
      if ((!currentPage.players || currentPage.players.length === 0) && Array.isArray(mapData?.players) && mapData.players.length > 0) {
        currentPage.players = mapData.players;
      }
      if ((!currentPage.items || currentPage.items.length === 0) && Array.isArray(mapData?.items) && mapData.items.length > 0) {
        currentPage.items = mapData.items;
      }
      if ((!currentPage.landmarks || currentPage.landmarks.length === 0) && Array.isArray(mapData?.landmarks) && mapData.landmarks.length > 0) {
        currentPage.landmarks = mapData.landmarks;
      }
    }
  }
  // Aggregate all NPCs across pages, creatures, entities, and NPC-type areas
  const rawNpcList = [
    ...(Array.isArray(currentPage?.npcs) ? currentPage.npcs : []),
    ...(Array.isArray(currentPage?.creatures) ? currentPage.creatures : []),
    ...(Array.isArray(currentPage?.entities) ? currentPage.entities : []),
    ...(Array.isArray(currentPage?.areas) ? currentPage.areas.filter((a: any) => a && /npc|enemy|ally|creature|boss/i.test(a.type || '')) : []),
    ...(pages.length === 1 && safePageIndex === 0 && Array.isArray(mapData?.npcs) ? mapData.npcs : []),
    ...(pages.length === 1 && safePageIndex === 0 && Array.isArray(mapData?.creatures) ? mapData.creatures : [])
  ];

  const activeNpcs: any[] = [];
  const seenNpcKeys = new Set<string>();

  for (const n of rawNpcList) {
    if (!n) continue;
    let name = (n.name || n.id || 'NPC').trim();
    if (!name.toLowerCase().endsWith('-npc')) {
      name = `${name}-npc`;
    }
    const key = name.toLowerCase();
    if (!seenNpcKeys.has(key)) {
      seenNpcKeys.add(key);
      activeNpcs.push({
        ...n,
        name
      });
    }
  }

  // Pan and Zoom Handlers
  const handleResetPanZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(8, +(prev * 1.3).toFixed(2)));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.2, +(prev / 1.3).toFixed(2)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary button
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panStartPos.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    const svgEl = svgRef.current;
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect();
      const viewBoxWidth = mapWidth + padding * 2;
      const viewBoxHeight = mapHeight + padding * 2;
      const scaleX = (viewBoxWidth / (rect.width || 1)) / zoom;
      const scaleY = (viewBoxHeight / (rect.height || 1)) / zoom;
      setPan({
        x: panStartPos.current.x + dx * scaleX,
        y: panStartPos.current.y + dy * scaleY
      });
    } else {
      setPan({
        x: panStartPos.current.x + dx,
        y: panStartPos.current.y + dy
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartPos.current = { ...pan };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        dist
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      const svgEl = svgRef.current;
      if (svgEl) {
        const rect = svgEl.getBoundingClientRect();
        const viewBoxWidth = mapWidth + padding * 2;
        const viewBoxHeight = mapHeight + padding * 2;
        const scaleX = (viewBoxWidth / (rect.width || 1)) / zoom;
        const scaleY = (viewBoxHeight / (rect.height || 1)) / zoom;
        setPan({
          x: panStartPos.current.x + dx * scaleX,
          y: panStartPos.current.y + dy * scaleY
        });
      }
    } else if (e.touches.length === 2 && touchStartRef.current.dist) {
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = newDist / touchStartRef.current.dist;
      setZoom((prev) => Math.max(0.2, Math.min(8, +(prev * factor).toFixed(2))));
      touchStartRef.current.dist = newDist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  if (!currentPage) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 italic p-4 text-center bg-black">
        Map data unavailable. The AI engine is generating the world...
      </div>
    );
  }

  if (!currentPage.areas) {
    currentPage.areas = [];
  }

  const parseName = (name: string) => {
    if (!name) return 'Unknown Area';
    const res = resolveMapEntityName(name, username, debugMode);
    return res.displayName;
  };

  const parseNpcName = (name: string) => {
    if (!name) return 'NPC-npc';
    const res = resolveMapEntityName(name, username, debugMode);
    let displayName = res.displayName;
    if (displayName && !displayName.toLowerCase().endsWith('-npc')) {
      displayName = `${displayName}-npc`;
    }
    return displayName;
  };

  const isEntityHidden = (name: string) => {
    if (!name) return false;
    const res = resolveMapEntityName(name, username, debugMode);
    return res.isHidden;
  };

  // Calculate bounds to scale the map dynamically
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (currentPage.areas && currentPage.areas.length > 0) {
    currentPage.areas.forEach((area: any) => {
      const isHidden = isEntityHidden(area.name);
      if (isHidden) return;

      const ax = Number(area.x ?? area.cx) || 0;
      const ay = Number(area.y ?? area.cy) || 0;
      const aw = Number(area.width) || 10;
      const ah = Number(area.height) || 10;
      const ar = Number(area.radius) || (aw / 2);
      const rx = Number(area.rx ?? area.radiusX ?? (aw / 2)) || 15;
      const ry = Number(area.ry ?? area.radiusY ?? (ah / 2)) || 10;

      if (area.shape === 'circle') {
        if (ax - ar < minX) minX = ax - ar;
        if (ay - ar < minY) minY = ay - ar;
        if (ax + ar > maxX) maxX = ax + ar;
        if (ay + ar > maxY) maxY = ay + ar;
      } else if (area.shape === 'ellipse' || area.shape === 'oblong') {
        const rot = Number(area.rotation) || 0;
        const rad = (rot * Math.PI) / 180;
        const dx = Math.sqrt(rx * rx * Math.cos(rad) * Math.cos(rad) + ry * ry * Math.sin(rad) * Math.sin(rad));
        const dy = Math.sqrt(rx * rx * Math.sin(rad) * Math.sin(rad) + ry * ry * Math.cos(rad) * Math.cos(rad));
        if (ax - dx < minX) minX = ax - dx;
        if (ay - dy < minY) minY = ay - dy;
        if (ax + dx > maxX) maxX = ax + dx;
        if (ay + dy > maxY) maxY = ay + dy;
      } else if (area.shape === 'polygon' && area.points) {
        const pts = String(area.points).split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n));
        const numPoints = Math.floor(pts.length / 2);
        for (let j = 0; j < numPoints * 2; j += 2) {
          const px = pts[j];
          const py = pts[j + 1];
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
        }
      } else if (area.shape === 'path' && area.d) {
        const matches = String(area.d).match(/-?\d+(\.\d+)?/g);
        if (matches) {
          const nums = matches.map(Number);
          for (let j = 0; j < nums.length - 1; j += 2) {
            const px = nums[j];
            const py = nums[j + 1];
            if (!isNaN(px) && px < minX) minX = px;
            if (!isNaN(py) && py < minY) minY = py;
            if (!isNaN(px) && px > maxX) maxX = px;
            if (!isNaN(py) && py > maxY) maxY = py;
          }
        }
      } else {
        if (ax < minX) minX = ax;
        if (ay < minY) minY = ay;
        if (ax + aw > maxX) maxX = ax + aw;
        if (ay + ah > maxY) maxY = ay + ah;
      }
    });
  }

  // Also include players in bounds calculation
  if (currentPage.players && currentPage.players.length > 0) {
    currentPage.players.forEach((p: any) => {
      const px = Number(p.x) || 0;
      const py = Number(p.y) || 0;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    });
  }

  // Also include top-level items and landmarks if present
  if (currentPage.items && Array.isArray(currentPage.items)) {
    currentPage.items.forEach((it: any) => {
      if (isEntityHidden(it.name)) return;
      const ix = Number(it.x) || 0;
      const iy = Number(it.y) || 0;
      if (ix < minX) minX = ix;
      if (iy < minY) minY = iy;
      if (ix > maxX) maxX = ix;
      if (iy > maxY) maxY = iy;
    });
  }
  if (currentPage.landmarks && Array.isArray(currentPage.landmarks)) {
    currentPage.landmarks.forEach((lm: any) => {
      if (isEntityHidden(lm.name)) return;
      const lx = Number(lm.x) || 0;
      const ly = Number(lm.y) || 0;
      if (lx < minX) minX = lx;
      if (ly < minY) minY = ly;
      if (lx > maxX) maxX = lx;
      if (ly > maxY) maxY = ly;
    });
  }
  if (activeNpcs && activeNpcs.length > 0) {
    activeNpcs.forEach((npc: any) => {
      if (isEntityHidden(npc.name)) return;
      const nx = Number(npc.x) || 0;
      const ny = Number(npc.y) || 0;
      if (nx < minX) minX = nx;
      if (ny < minY) minY = ny;
      if (nx > maxX) maxX = nx;
      if (ny > maxY) maxY = ny;
    });
  }
  if (currentPage.notes && Array.isArray(currentPage.notes)) {
    currentPage.notes.forEach((note: any) => {
      const nx = Number(note.x) || 0;
      const ny = Number(note.y) || 0;
      if (nx < minX) minX = nx;
      if (ny < minY) minY = ny;
      if (nx > maxX) maxX = nx;
      if (ny > maxY) maxY = ny;
    });
  }

  // Fallback defaults if bounds calculation yields no points
  if (minX === Infinity || isNaN(minX) || isNaN(maxX) || isNaN(minY) || isNaN(maxY)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }

  const mapWidth = Math.max(maxX - minX, 100);
  const mapHeight = Math.max(maxY - minY, 100);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const finalMinX = cx - mapWidth / 2;
  const finalMinY = cy - mapHeight / 2;

  const padding = 20;
  const viewBox = `${finalMinX - padding} ${finalMinY - padding} ${mapWidth + padding * 2} ${mapHeight + padding * 2}`;

  const getAreaColor = (type: string, visible: boolean) => {
    if (visible === false) {
      return 'fill-neutral-900/50 stroke-neutral-800';
    }
    switch (type?.toLowerCase()) {
      case 'market':
      case 'bazaar':
      case 'square':
      case 'plaza':
        return 'fill-amber-950/40 stroke-amber-500/80';
      case 'stall':
      case 'shop':
      case 'store':
      case 'merchant':
      case 'counter':
        return 'fill-amber-700/60 stroke-amber-400';
      case 'building':
      case 'house':
      case 'structure':
      case 'inn':
      case 'tavern':
        return 'fill-neutral-700/70 stroke-neutral-400';
      case 'wall':
      case 'gate':
      case 'fence':
      case 'barrier':
        return 'fill-neutral-600/80 stroke-neutral-300';
      case 'road':
      case 'path':
      case 'trail':
      case 'street':
      case 'bridge':
      case 'corridor':
      case 'hallway':
        return 'fill-stone-800/60 stroke-stone-500';
      case 'field':
      case 'forest':
      case 'wood':
      case 'jungle':
      case 'grove':
        return 'fill-emerald-950/60 stroke-emerald-700';
      case 'tree':
      case 'bush':
      case 'vegetation':
        return 'fill-green-800/60 stroke-green-500';
      case 'clearing':
      case 'meadow':
      case 'grass':
        return 'fill-green-950/40 stroke-green-700';
      case 'water':
      case 'river':
      case 'lake':
      case 'pond':
      case 'ocean':
      case 'stream':
        return 'fill-blue-900/50 stroke-blue-500';
      case 'room':
      case 'dungeon':
      case 'chamber':
        return 'fill-neutral-800/80 stroke-neutral-500';
      case 'obstacle':
        return 'fill-neutral-600/80 stroke-neutral-400';
      case 'furniture':
        return 'fill-amber-900/60 stroke-amber-700';
      case 'npc':
      case 'enemy':
      case 'ally':
      case 'creature':
      case 'boss':
        return 'fill-purple-900/70 stroke-purple-400';
      case 'vehicle':
      case 'cart':
      case 'wagon':
        return 'fill-slate-700/80 stroke-slate-400';
      case 'projectile':
        return 'fill-red-500/80 stroke-red-300';
      case 'fire':
      case 'lava':
        return 'fill-orange-600/60 stroke-orange-400 animate-pulse';
      case 'poison':
      case 'acid':
        return 'fill-lime-600/40 stroke-lime-400';
      case 'treasure':
      case 'loot':
      case 'item':
      case 'weapon':
      case 'equipment':
        return 'fill-yellow-400/70 stroke-yellow-200';
      case 'landmark':
      case 'monument':
      case 'statue':
      case 'fountain':
      case 'shrine':
        return 'fill-indigo-900/60 stroke-indigo-400';
      case 'tech':
      case 'terminal':
        return 'fill-cyan-900/60 stroke-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.5)]';
      case 'magic':
      case 'portal':
        return 'fill-purple-900/60 stroke-purple-400 animate-pulse';
      case 'nature':
      case 'hazard':
        return 'fill-amber-950/40 stroke-amber-800';
      default:
        return 'fill-neutral-800/40 stroke-neutral-600';
    }
  };

  const createConePath = (x: number, y: number, facing: number, paramAngle: number, radius: number) => {
    let angle = Math.abs(paramAngle) / 2;
    if (angle >= 180) angle = 179.99;

    const startAngle = (facing - angle) * Math.PI / 180;
    const endAngle = (facing + angle) * Math.PI / 180;

    const startX = x + radius * Math.cos(startAngle);
    const startY = y + radius * Math.sin(startAngle);

    const endX = x + radius * Math.cos(endAngle);
    const endY = y + radius * Math.sin(endAngle);

    const largeArcFlag = angle * 2 > 180 ? 1 : 0;

    return `M ${x} ${y} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
  };

  // Text scale counteracts zoom to keep text labels the exact same screen size regardless of zooming in/out
  const textScale = zoom > 0 ? +(1 / zoom).toFixed(4) : 1;

  return (
    <div
      ref={mapContainerRef}
      id="map-viewport"
      className={`flex flex-col h-full w-full bg-black relative overflow-hidden select-none touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleResetPanZoom}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Left Pages Bar */}
      {pages.length > 1 && (
        <div className="absolute top-2 left-2 flex gap-1 z-20 pointer-events-auto flex-wrap max-w-[calc(100%-260px)]">
          {pages.map((p, idx) => {
            const pagePlayerCount = p.players?.length || 0;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentPageIndex(idx)}
                className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors flex items-center gap-1 ${idx === safePageIndex
                  ? 'bg-blue-900/50 border-blue-500 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.3)] font-bold'
                  : 'bg-black/70 border-neutral-800 text-gray-400 hover:bg-neutral-800'
                  }`}
              >
                <span>{p.name || `Page ${idx + 1}`}</span>
                {pagePlayerCount > 0 && (
                  <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1 rounded-full border border-blue-500/40">
                    {pagePlayerCount}👤
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Top Right Zoom, Pan and Labels Controls with Scale Directly Underneath */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-20 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/85 backdrop-blur-sm border border-neutral-800 rounded-lg p-1 px-1.5 shadow-lg select-none pointer-events-auto">
          <button
            type="button"
            id="map-zoom-out-btn"
            onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
            title="Zoom Out (-)"
            className="p-1 rounded text-gray-300 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-gray-300 min-w-[36px] text-center font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            id="map-zoom-in-btn"
            onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
            title="Zoom In (+)"
            className="p-1 rounded text-gray-300 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3.5 bg-neutral-700 mx-0.5" />
          <button
            type="button"
            id="map-reset-btn"
            onClick={(e) => { e.stopPropagation(); handleResetPanZoom(); }}
            title="Reset Pan & Zoom (100% / Centered)"
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-blue-400 hover:text-blue-200 hover:bg-blue-900/40 rounded border border-blue-900/40 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <div className="w-[1px] h-3.5 bg-neutral-700 mx-0.5" />
          <button
            type="button"
            id="map-toggle-labels-btn"
            onClick={(e) => { e.stopPropagation(); toggleShowAllLabels(); }}
            title={showAllLabels ? "Labels: Always showing all (click to switch to hover-only)" : "Labels: Showing on hover only (click to show all labels)"}
            className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
              showAllLabels
                ? 'bg-blue-950/80 text-blue-300 border-blue-600/70 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border-neutral-800'
            }`}
          >
            {showAllLabels ? <Eye className="w-3 h-3 text-blue-400" /> : <EyeOff className="w-3 h-3 text-neutral-400" />}
            <span>{showAllLabels ? 'All Text' : 'Hover Text'}</span>
          </button>
        </div>

        {/* Meters Scale: Positioned under the map buttons so it is never hidden */}
        <div className="bg-black/90 text-[10px] text-blue-400 font-mono px-2 py-0.5 rounded border border-blue-900/60 backdrop-blur-xs shadow-md flex items-center gap-1.5 select-none pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
          <span>Scale: {currentPage.scale || 'Unknown'}</span>
        </div>
      </div>

      {/* Bottom Hint on Drag/Zoom */}
      <div className="absolute bottom-2 right-2 z-10 pointer-events-none bg-black/75 text-[9px] font-mono text-gray-400 px-2 py-0.5 rounded border border-neutral-800/80 backdrop-blur-xs">
        {showAllLabels ? 'Showing all labels • Scroll to zoom' : 'Hover elements for text labels • Scroll to zoom'}
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <g
          id="map-transform-layer"
          transform={`translate(${cx}, ${cy}) translate(${pan.x * zoom}, ${pan.y * zoom}) scale(${zoom}) translate(${-cx}, ${-cy})`}
        >
          {/* Draw Areas & Structures */}
          {currentPage.areas?.map((area: any, i: number) => {
            const isHidden = isEntityHidden(area.name);
            if (isHidden) return null;
            const parsedName = parseName(area.name);

            const ax = Number(area.x ?? area.cx) || 0;
            const ay = Number(area.y ?? area.cy) || 0;
            const aw = Number(area.width) || 10;
            const ah = Number(area.height) || 10;
            const ar = Number(area.radius) || (aw / 2);
            const rx = Number(area.rx ?? area.radiusX ?? (aw / 2)) || 15;
            const ry = Number(area.ry ?? area.radiusY ?? (ah / 2)) || 10;

            let textX = ax + aw / 2;
            let textY = ay + ah / 2;

            if (area.shape === 'circle') {
              textX = ax;
              textY = ay;
            } else if (area.shape === 'ellipse' || area.shape === 'oblong') {
              textX = ax;
              textY = ay;
            } else if (area.shape === 'polygon' && area.points) {
              const pts = String(area.points).split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n));
              const numPoints = Math.floor(pts.length / 2);
              if (numPoints >= 1) {
                let sumX = 0, sumY = 0;
                for (let j = 0; j < numPoints * 2; j += 2) {
                  sumX += pts[j];
                  sumY += pts[j + 1];
                }
                textX = sumX / numPoints;
                textY = sumY / numPoints;
              }
            } else if (area.shape === 'path' && area.d) {
              const matches = String(area.d).match(/-?\d+(\.\d+)?/g);
              if (matches && matches.length >= 2) {
                const nums = matches.map(Number);
                let sumX = 0, sumY = 0, count = 0;
                for (let j = 0; j < nums.length - 1; j += 2) {
                  if (!isNaN(nums[j]) && !isNaN(nums[j + 1])) {
                    sumX += nums[j];
                    sumY += nums[j + 1];
                    count++;
                  }
                }
                if (count > 0) {
                  textX = sumX / count;
                  textY = sumY / count;
                }
              }
            }

            const areaTypeLower = area.type?.toLowerCase();
            const isItemType = areaTypeLower === 'item' || areaTypeLower === 'loot' || areaTypeLower === 'weapon' || areaTypeLower === 'treasure';

            return (
              <g key={area.id || i} className="group">
                {area.shape === 'circle' ? (
                  <circle
                    cx={ax}
                    cy={ay}
                    r={ar}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={2}
                  />
                ) : (area.shape === 'ellipse' || area.shape === 'oblong') ? (
                  <ellipse
                    cx={ax}
                    cy={ay}
                    rx={rx}
                    ry={ry}
                    transform={area.rotation ? `rotate(${area.rotation} ${ax} ${ay})` : undefined}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={2}
                  />
                ) : area.shape === 'polygon' && area.points ? (
                  <polygon
                    points={area.points}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={2}
                  />
                ) : area.shape === 'path' && area.d ? (
                  <path
                    d={area.d}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={Number(area.strokeWidth) || 2}
                    fill={area.fill || 'none'}
                  />
                ) : (
                  <rect
                    x={ax}
                    y={ay}
                    width={aw}
                    height={ah}
                    rx={Number(area.rx) || 0}
                    ry={Number(area.ry) || 0}
                    transform={area.rotation ? `rotate(${area.rotation} ${ax + aw / 2} ${ay + ah / 2})` : undefined}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={2}
                  />
                )}

                {/* Status/Effect glow for active elements (e.g. lit torches, fire, active magic) */}
                {(() => {
                  const statusText = area.status || area.condition || (Array.isArray(area.effects) && area.effects.length > 0 ? area.effects.join(', ') : '');
                  const isLit = String(statusText || area.type || '').toLowerCase().includes('lit') || String(statusText || '').toLowerCase().includes('fire') || String(statusText || '').toLowerCase().includes('burning');
                  if (!isLit) return null;
                  return (
                    <circle
                      cx={textX}
                      cy={textY}
                      r={7}
                      className="fill-amber-400/25 stroke-amber-400/50 animate-pulse pointer-events-none"
                      strokeWidth={0.75}
                    />
                  );
                })()}

                {/* Highlight marker for loose items/weapons on ground */}
                {isItemType && (
                  <polygon
                    points={`${textX},${textY - 3} ${textX + 3},${textY} ${textX},${textY + 3} ${textX - 3},${textY}`}
                    className="fill-yellow-300 stroke-yellow-500 animate-pulse pointer-events-none"
                    strokeWidth={1}
                  />
                )}

                {/* Tooltip on hover */}
                {(() => {
                  const statusText = area.status || area.condition || (Array.isArray(area.effects) && area.effects.length > 0 ? area.effects.join(', ') : '');
                  return (
                    <title>{`${parsedName}${area.type ? ` (${area.type})` : ''}${statusText ? ` [${statusText}]` : ''}`}</title>
                  );
                })()}

                {/* Area Label - shows on hover over area or text, or always if showAllLabels is active; scale(textScale) keeps size constant on zoom */}
                {parsedName && (() => {
                  const statusText = area.status || area.condition || (Array.isArray(area.effects) && area.effects.length > 0 ? area.effects.join(', ') : '');
                  const isLit = String(statusText || area.type || '').toLowerCase().includes('lit') || String(statusText || '').toLowerCase().includes('fire');
                  const isBroken = String(statusText || '').toLowerCase().includes('broken') || String(statusText || '').toLowerCase().includes('jammed');

                  return (
                    <g
                      transform={`translate(${textX}, ${textY}) scale(${textScale})`}
                      className={`pointer-events-auto transition-opacity duration-150 ${
                        showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={`text-[6px] font-mono font-medium select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${
                          isItemType
                            ? 'fill-yellow-300 font-bold'
                            : 'fill-gray-200'
                        }`}
                        style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                      >
                        {parsedName}
                        {statusText && (
                          <tspan className={isLit ? "fill-amber-300 font-semibold" : isBroken ? "fill-red-300 italic" : "fill-cyan-300"}>
                            {` [${statusText}]`}
                          </tspan>
                        )}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Draw Top-Level Items (if separately registered on page) */}
          {currentPage.items?.map((item: any, i: number) => {
            if (isEntityHidden(item.name)) return null;
            const ix = Number(item.x) || 0;
            const iy = Number(item.y) || 0;
            const iName = parseName(item.name || 'Item');
            const itemStatus = item.status || item.condition || (Array.isArray(item.effects) && item.effects.length > 0 ? item.effects.join(', ') : '');
            const isLit = String(itemStatus || item.name || '').toLowerCase().includes('lit') || String(itemStatus || '').toLowerCase().includes('fire') || String(itemStatus || '').toLowerCase().includes('burning');

            return (
              <g key={`page-item-${i}`} className="group cursor-crosshair">
                {isLit && (
                  <circle
                    cx={ix}
                    cy={iy}
                    r={6}
                    className="fill-amber-400/30 stroke-amber-400/60 animate-pulse pointer-events-none"
                    strokeWidth={0.75}
                  />
                )}
                <polygon
                  points={`${ix},${iy - 3.5} ${ix + 3.5},${iy} ${ix},${iy + 3.5} ${ix - 3.5},${iy}`}
                  className="fill-yellow-400 stroke-yellow-200 animate-pulse"
                  strokeWidth={1}
                />
                <title>{`${iName}${itemStatus ? ` [${itemStatus}]` : ''} (Item: ${item.description || ''})`}</title>
                <g
                  transform={`translate(${ix}, ${iy}) scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={-6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-yellow-300 text-[5px] font-mono font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {iName}
                    {itemStatus && (
                      <tspan className={isLit ? "fill-amber-300 font-semibold" : "fill-cyan-300"}>
                        {` [${itemStatus}]`}
                      </tspan>
                    )}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Draw Top-Level Landmarks (if separately registered on page) */}
          {currentPage.landmarks?.map((lm: any, i: number) => {
            if (isEntityHidden(lm.name)) return null;
            const lx = Number(lm.x) || 0;
            const ly = Number(lm.y) || 0;
            const lName = parseName(lm.name || 'Landmark');
            const lmStatus = lm.status || lm.condition || (Array.isArray(lm.effects) && lm.effects.length > 0 ? lm.effects.join(', ') : '');
            const isBroken = String(lmStatus || '').toLowerCase().includes('broken') || String(lmStatus || '').toLowerCase().includes('ruined') || String(lmStatus || '').toLowerCase().includes('jammed');
            const isLit = String(lmStatus || '').toLowerCase().includes('lit') || String(lmStatus || '').toLowerCase().includes('active');

            return (
              <g key={`page-lm-${i}`} className="group cursor-crosshair">
                <circle
                  cx={lx}
                  cy={ly}
                  r={4}
                  className="fill-indigo-900/80 stroke-indigo-400"
                  strokeWidth={1.5}
                />
                <title>{`${lName}${lmStatus ? ` [${lmStatus}]` : ''} (Landmark: ${lm.description || ''})`}</title>
                <g
                  transform={`translate(${lx}, ${ly}) scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={-7}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-indigo-300 text-[5px] font-mono font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {lName}
                    {lmStatus && (
                      <tspan className={isBroken ? "fill-red-300 italic" : isLit ? "fill-amber-300 font-semibold" : "fill-cyan-300"}>
                        {` [${lmStatus}]`}
                      </tspan>
                    )}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Draw NPCs / Creatures / Entities */}
          {activeNpcs.map((npc: any, i: number) => {
            if (isEntityHidden(npc.name)) return null;
            const nx = Number(npc.x) || 0;
            const ny = Number(npc.y) || 0;
            const nName = parseNpcName(npc.name || 'NPC');
            const nType = npc.type || 'npc';
            const isHostile = /enemy|monster|hostile|boss|bandit/i.test(nType);

            return (
              <g key={`page-npc-${i}`} className="group cursor-crosshair">
                <circle
                  cx={nx}
                  cy={ny}
                  r={3.8}
                  className={isHostile ? "fill-red-900/80 stroke-red-400" : "fill-purple-900/80 stroke-purple-400"}
                  strokeWidth={1.5}
                />
                <title>{`${nName} (${nType}${npc.description ? `: ${npc.description}` : ''})`}</title>
                <g
                  transform={`translate(${nx}, ${ny}) scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={-7}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`${isHostile ? 'fill-red-300' : 'fill-purple-300'} text-[5px] font-mono font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]`}
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {nName}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Draw Players */}
          {currentPage.players?.map((player: any, i: number) => {
            const px = Number(player.x) || 0;
            const py = Number(player.y) || 0;
            const pfacing = Number(player.facing) || 0;
            const isMe = String(player.username).toLowerCase() === String(username).toLowerCase();

            return (
              <g key={player.username || i} className="group cursor-pointer">
                {/* Vision Cones */}
                {player.vision && (
                  <>
                    {/* Max Range (Peripheral) */}
                    <path
                      d={createConePath(px, py, pfacing, Number(player.vision.peripheralAngle) || 90, Number(player.vision.maxRange) || 100)}
                      className="fill-white/5 pointer-events-none"
                    />
                    {/* Detailed Range (Main) */}
                    <path
                      d={createConePath(px, py, pfacing, Number(player.vision.mainAngle) || 66, Number(player.vision.detailedRange) || 50)}
                      className="fill-white/10 pointer-events-none"
                    />
                  </>
                )}

                {/* Player Triangle */}
                <polygon
                  points="-4,-4 6,0 -4,4"
                  fill={isMe ? "#3b82f6" : "#ef4444"}
                  transform={`translate(${px}, ${py}) rotate(${pfacing})`}
                />
                <g
                  transform={`translate(${px}, ${py}) scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={-8}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-white text-[5.5px] font-mono font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {player.characterName && player.characterName !== player.username ? `${player.characterName} (${player.username})` : player.username}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Draw Notes/Annotations */}
          {currentPage.notes?.map((note: any, i: number) => {
            const nx = Number(note.x) || 0;
            const ny = Number(note.y) || 0;
            const isDanger = note.type === 'danger';
            const isDiscovery = note.type === 'discovery';

            return (
              <g key={`note-${i}`} transform={`translate(${nx}, ${ny})`} className="group cursor-pointer">
                {/* Invisible larger hit circle for comfortable hover */}
                <circle r={4} className="fill-transparent" />
                <circle r={1.5} className={isDanger ? "fill-red-500" : isDiscovery ? "fill-yellow-400" : "fill-blue-400"} />
                <g
                  transform={`scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={-5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`text-[4.5px] font-bold font-mono select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${
                      isDanger ? "fill-red-400" : isDiscovery ? "fill-yellow-300" : "fill-blue-300"
                    }`}
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {note.text}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
});

export default MapPanel;
