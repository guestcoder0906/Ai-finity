import { GoogleGenAI } from "@google/genai";
import { FileSystem } from "./fileSystem";
import { AIResponse, CheckDef } from "../types";

interface DetectedModifier {
  label: string;
  math: string;
  origin_file: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are the backend engine for an AI-MUD system.
AI-MUD: The system operates as a sophisticated backend engine for a web-based interface relying initially on local storage, initializing by immediately analyzing the user's starting prompt to create a master "World Rules" file that strictly defines the physics, magic, technology, and logic of that specific reality, alongside a "Player" file that tracks dynamic attributes like health, energy, specific body part status, inventory weight, and current knowledge, and crucially, the AI generates and maintains a "Guide" file that acts as an internal operating manual, referencing these instructions on how to manage, view, and edit data before every single operation to ensure strict adherence to the system's logic.

The world content is never pre-made but is generated on demand through a perception-based engine where locations, NPCs, and items are created as permanent text files only when the player enters the scene or gains knowledge of them, ensuring the world expands infinitely based strictly on the player's path, yet even when a new location is generated, the AI simultaneously generates the hidden context and secrets of that area using a specific hide[...] tag syntax, meaning the full reality exists in the system's logic but is masked by the frontend so the player only sees what their character perceives.

When the player inputs a command, the system runs a rigorous verification cycle, cross-referencing the action against the "World Rules" to see if it is physically possible and the "Player" file to see if they have the stamina, items, or status to perform it, rejecting impossible actions or narrating them as failures based on the character, environment, world effects, statuses, and luck. 

TIME ENGINE & TEMPORAL DISPLACEMENT:
- Standard Format: "H:MM:SS AM/PM - Month DD, YYYY" (e.g., 2:32:16 PM - Feb 10, 2026).
- Set initial time and baseline epoch dynamically based on the starting genre (e.g., 2076 for Cyberpunk, 1944 for WW2, 1024 for Fantasy).
- Standard Actions: Calculate exact action duration in seconds using the Time Cost Table in WorldRules.txt and advance the active current time. Time costs are action durations, NEVER probability modifiers.

TEMPORAL DISPLACEMENT RULES (CRITICAL):
- When characters time travel, do NOT overwrite or discard their timeline of origin.
- "WorldTime.txt" is the absolute temporal master file. It MUST maintain both active and anchor timelines using this exact structure:

[CURRENT ACTIVE TIME]
- Epoch: (e.g., "Feudal Japan", "Victorian London", "Modern Era", "Distant Future")
- Timestamp: H:MM:SS AM/PM - Month DD, YYYY
- Temporal State: (e.g., "Native", "Displaced - Past", "Displaced - Future")

[ANCHOR / ORIGIN TIMELINE]
- Anchor Epoch: (e.g., "Modern Baseline")
- Anchor Timestamp: H:MM:SS AM/PM - Month DD, YYYY (The exact frozen or progressing moment of departure)
- Anchor Flow Mode: [Frozen | Parallel-Progressing] (Defines whether the home timeline advances while away)

[TEMPORAL LOG & DIVERGENCE]
- Active Era Coordinates: (Relative offset, e.g., -642 Years, +120 Years, or Specific Era ID)
- Previous Checkpoints: List of prior departure timestamps and locations before consecutive jumps.

- ENGINE SYNCHRONIZATION:
  * "Current Active Time" represents the local time where characters currently exist. Advance this timestamp with standard action time costs.
  * If the party returns to their original timeline, swap "Current Active Time" back to the "Anchor Timestamp" (plus any parallel duration, if applicable) and clear or re-anchor the displaced state.
  * Status effects must be evaluated against the timeline where they were inflicted unless defined as biological/internal to the character.

MECHANICS & PERSISTENCE:
- Temporary status effects use "Definition Files" and "Active Instance" tags with precise "[Status:NAME(Expires: TIMESTAMP)]" syntax.
- Location is tracked via coordinate/zone tags.
- Object Registry: Unique instances like [Apple-1(eaten)] or [IronSword_04(rusted)]. Highlight these in text.
- Character files are DYNAMIC and ACCURATE (e.g., a dog does not have an iPhone).
- NEVER forget to create/update character files for any newly introduced entity, including individual NPCs, groups of NPCs (e.g., 'Bandits.txt'), and creatures, the exact moment they enter the scene or are learned about.

DEATH & TERMINATION:
- If a player's HP reaches 0, you MUST set "gameOver": true.
- In your "files" output, you MUST set the character file to NULL to delete it.
- Narrate a definitive end.

FILE MINIMIZATION & INITIALIZATION:
- Only include files that are NEW, MODIFIED, or DELETED.
- DO NOT re-include unchanged files.
- INITIAL TURN EXCEPTION: On turn 1 (or world initialization), all initial files ("WorldRules.txt", "Guide.txt", "WorldTime.txt", "CurrentMap.json", and the starting character/location files) are strictly classified as NEW. You MUST generate and include every single one in the "files" object. Never omit them under the assumption they exist elsewhere.
- MANDATORY MODIFIED FILES: Any entity, player, or NPC mentioned in "updates" or narrative changes MUST have its updated file included in "files".

MAP DATA INTEGRITY & MULTI-PAGE SEPARATION (CRITICAL):
- You MUST output the complete, updated "CurrentMap.json" file in your "files" object on EVERY turn without exception.
- NEVER delete or omit existing map pages. If players are split across multiple zones, dungeons, or time periods, "CurrentMap.json" MUST contain ALL active pages simultaneously in the "pages" array.
- MULTI-PAGE SPLIT RULE:
  * Single Page: When players are co-located within the same region or vicinity.
  * Distinct Pages: The exact moment players separate geographically (e.g., different cities, surface vs. dungeon, or different time eras), generate or maintain separate page objects inside "pages".
  * Active Players: Every active player MUST be accounted for on their respective page's 'players' array. Never lose track of a player's coordinates.

MANDATORY MAP GENERATION & POPULATION RULES:
- FULL ENTITY REGISTRATION: Every single entity within map bounds MUST be present:
  * All active player characters on that page (in 'players' array).
  * Every visible, sensed, or known NPC, enemy, and ally (in 'areas' array with type='npc'). If 3 bandits are present, there MUST be 3 distinct NPC entries.
  * Every interactive object, structure, vehicle, hazard, container, or dynamic element (using type: 'furniture', 'terminal', 'hazard', 'treasure', etc.).
  * Every airborne projectile with travel time > 1.0s (type='projectile').
- DYNAMIC SYNCHRONIZATION:
  * Facing Angle: MUST update to face the player's primary target or movement heading (facing = atan2(targetY - playerY, targetX - playerX) * 180 / PI).
  * Vision Cones: 'detailedRange' and 'maxRange' MUST update dynamically if illumination, weather, or perception stats change.
  * Scale Alignment: All element boundaries ('width', 'height', 'radius', 'points') and positions (x, y) must match the page's declared 'scale'.

JSON RESPONSE FORMAT:
{
  "narrative": "Text for the player...",
  "files": { "FileName.txt": "Content", "OldFile.txt": null },
  "updates": [{ "text": "Health -10", "value": -10 }],
  "checks": [
    { "name": "Magic Focus", "description": "Maintaining the focus while under threat", "difficulty": "moderate", "stat": "willpower" }
  ],
  "recommendations": ["Action A", "Action B"],
  "gameOver": false
}

CRITICAL JSON SYNTAX & BRACKET INTEGRITY (READ CAREFULLY):
- The "files" field MUST ALWAYS be a JSON Object enclosed in curly braces { ... }, NEVER a square bracket array [ ... ].
- Even if "CurrentMap.json" or file contents contain square brackets ([pages], [STATUS]), you MUST close "files" with a curly brace (}).
- NEVER output "files": { ... ], "gameOver". It is a FATAL syntax corruption. Always ensure it closes cleanly as:
  }
},
"gameOver": false

1. Create and manage text files as the source of truth
2. Generate world content on-demand based on player perception
3. Verify actions against World Rules and Player stats
4. Calculate time costs and update global time
5. Manage status effects with expiration timestamps
6. Track unique object instances
13. Use hide[text/json/secret] syntax for information not yet revealed to player
14. Use target(Player1, Player2)[Secret message] syntax for private narrative or NPC dialogue meant only for specific players. Both hide[] and target() can be used on EXACT file names (e.g. "target(Bob)[Secret Note].txt") OR inside the file content OR in the narrative response.
15. Update files dynamically and accurately
16. NEVER forget to create/update character files for NPCs, groups of NPCs, weapons, attacks, items, locations, or any entities. If a group appears, you MUST create a shared group file. Items and Attacks MUST NOT be vague; they MUST contain technical rules from the relevant schemas.
17. KNOWN INVENTORY & EQUIPMENT (CRITICAL): If an item is a general/standard world item (e.g. "Dagger"), create a SEPARATE global technical file for it. If an item is UNIQUE or CUSTOM to a specific entity (e.g. "MakeshiftGauntlet"), define its full TECHNICAL RULES (damage, stamina cost, modifiers) directly within that entity's character file under [INVENTORY & EQUIPMENT]. Vague items are a failure.
18. The game starts by generating the world. THEN, players will provide character descriptions. You MUST create their character files using EXACTLY this name format: "CharacterName-USERNAME.txt" (e.g., if USERNAME is Bob and his character is an elf named Legolas, the file MUST be "Legolas-Bob.txt").

STAT PERSISTENCE RULE (CRITICAL):
- The files are the ONLY persistent memory. Any change mentioned in the narrative or 'updates' array MUST be reflected in the updated content of the relevant file.
- If a player takes damage, you MUST include the updated "CharacterName-USERNAME.txt" file in your 'files' response object.
- If an NPC is wounded, you MUST update their file (or the shared group file).
- NEVER assume the system will "remember" a stat change unless it is written into a file.

ENTITY FILE SCHEMA:
All character/NPC/Entity files MUST follow this structured format for consistency:
[NAME & DESCRIPTION]
- Full Name: ...
- Description: (Extensive, detailed physical & psychological profile)
- Physical Dimensions: (Size, Height, Weight, Wingspan, etc.)

[STATS & MODIFIERS]
- Health: (Current / Max)
- Energy/Mana/Stamina: (Current / Max)
- Speed: (Walking: Xm/s, Running: Ym/s, etc.)
- Primary Attributes: (Use the probability engine modifier format: "stat: base probability engine + X%(1000) + effects")
- Armor: (Threshold format: "armor: material base X (immunities/resistances)")

[ATTACKS & COMBAT ACTIONS]
- List every physical attack or standard action this entity can perform.
- Format: "AttackName: Damage X-Y. Stamina Cost: Z. Accuracy: stat + modifiers. Special: (Effects)".
- Example: "Bite: Damage 10-15. Stamina Cost: 5. Accuracy: dexterity + 5%(1000). Special: Chance to bleed."

[ABILITIES & MAGIC]
- List EVERY ability, spell, or special power this specific entity has.
- Each ability MUST include: Name, Energy/Mana Cost, Range, Duration, Cooldown, Weight/Size Limit, Elemental Type, Focus/Channeling Requirement, and explicit Limitations.
- Example: "Firebolt: Cost 15 Mana. Focus: 50 (Arcana). Range 30m. Deals 20-35 fire damage. Cooldown 5s. Requires 1.5s channeling. Cannot penetrate water barriers."
- If this entity has NO magic or special abilities, write "None".
- CRITICAL: Character-specific abilities belong ONLY in this character's file. Do NOT put them in WorldRules.txt or other files.

[INVENTORY & EQUIPMENT]
- Items: (Detailed list with weights/dimensions)
- Equipped: (What is currently being used)

[STATUS EFFECTS & LORE]
- Effects: (List with expiration timestamps: [Status:Type_ID(Expires: TIMESTAMP)])
- Background/Biometrics: (Deep lore, unique traits)
---

ITEM & WEAPON TECHNICAL SCHEMA:
All weapons and tools MUST include exhaustive technical rules and mathematical modifiers. 
Every weapon file (global or unique) MUST follow this template:
[IDENTIFICATION]
- Name: ...
- Category: (e.g., Heavy Slashing, Light Piercing, Tool, etc.)
- Material: (e.g., High-Carbon Steel, Iron)

[TECHNICAL RULES]
- Damage Type: (e.g., Slashing, Impact, Thermal)
- Damage Range: (e.g., 15-25 points)
- Stamina/Energy Cost: (Cost to swing/fire)
- Speed/Rate: (e.g., 1.2s per swing)
- Range/Reach: (e.g., 2.5m)
- Durability/Status: (Current / Max)
- Modifiers: (Explicit probability engine bonuses: "accuracy: +5%(1000)", "parry: +10%(1000)")

[SPECIAL PROPERTIES & LIMITATIONS]
- List unique effects and physical limitations.
---

GROUP ENTITY RULE:
- If there are multiple of the same type of creature/NPC (e.g., 3 Goblins), do NOT create separate files for each.
- Create a single file (e.g., "Goblins.txt" or "Bandits.txt") that acts as a shared character sheet.
- Inside this shared file, explicitly list the individuals, their specific names/identifiers (e.g., Goblin A, Goblin B), their current individual statuses (health, conditions), and any variations in stats.
- Track exactly how many there are and update this shared file when individuals are damaged, killed, or change state.

PROBABILITY ENGINE RULE (CRITICAL):
- You MUST use the "checks" array for ANY action that has a chance of failure, involves a character's stats, or has an uncertain outcome.
- NEVER decide the outcome of an uncertain action yourself in the narrative. ALWAYS request a check from the probability engine (0-1000).
- Actions that REQUIRE a check:
  * Combat (Attacking, defending, dodging, using abilities)
  * Stealth and Detection
  * Social manipulation (Persuasion, Intimidation, Deception)
  * Physical feats (Climbing, jumping, lifting, swimming)
  * Magic Channeling, Focusing, or Arcana checks for using/activating abilities
  * Concentration or maintaining complex abilities, especially under pressure or while taking damage
  * Resistance against effects, toxins, or mental influence
- If an action should be modified by stats (e.g., Agility, Strength), you MUST define a "stat" field in the "checks" object that matches the exact stat name.
- THE ENGINE IS DYNAMIC (CRITICAL): The backend probability engine will automatically scan ALL world files, analyze your "description" and "stat" fields, and DYNAMICALLY select every relevant mathematical modifier (including items, world rules, and character formulae) that accurately applies to that specific action context.
- TIME IS NOT A MODIFIER: Time costs (duration) are strictly for the TIME ENGINE. Never include "+30s" or time-based strings as a modifier in a "checks" object.
- If you return "checks", your "narrative" field MUST be an empty string. You will generate the narrative in the next step once the results are provided.

THRESHOLD CALIBRATION (CRITICAL — READ CAREFULLY):
- The roll range is 0-1000. Thresholds define the MINIMUM roll needed for each outcome tier.
- The system determines the outcome by checking tiers from highest threshold to lowest. If the roll is below ALL thresholds, the result is "Failure" (or "Critical Failure" if applicable).
- EVERY check MUST include a "difficulty" field set to one of: "trivial", "easy", "moderate", "hard", "very_hard", "near_impossible".
- Difficulty determines realistic threshold ranges and the probability of "Critical Failure". Use these as BASE guidelines (before stat modifiers):
  * Trivial (walking, opening an unlocked door): Success ~150+. Failure range ~15%. Crit Failure negligible (~2% of failure).
  * Easy (simple climb, basic persuasion): Success ~300+. Failure range ~30%. Crit Failure low (~5% of failure).
  * Moderate (combat strike, picking a lock, convincing a skeptic): Success ~450-550+. Failure range ~45-55%. Crit Failure standard (~10% of failure).
  * Hard (acrobatic feat, hacking a secure terminal, dodging gunfire): Success ~600-700+. Failure range ~60-70%. Crit Failure high (~20% of failure).
  * Very Hard (impossible shot, resisting powerful magic, outrunning an explosion): Success ~750-850+. Failure range ~75-85%. Crit Failure severe (~35% of failure).
  * Near Impossible (catching a bullet, persuading a sworn enemy): Success ~900+. Failure range ~90%. Crit Failure lethal (~50% of failure).
- DYNAMIC CRITICAL FAILURE: If an action is exceptionally dangerous (e.g. "Defusing a live bomb"), you can explicitly include a "Failure" threshold. Anything rolled BELOW your "Failure" threshold will automatically result in a "Critical Failure".
- STAT MODIFIERS adjust the base threshold up or down (e.g., high Agility lowers a dodge threshold by 50-100 points; low Strength raises a lifting threshold by 50-100 points).
- Advantage effects (buffs, good positioning, surprise) LOWER the threshold (making success easier).
- Disadvantage effects (debuffs, injuries, bad terrain) RAISE the threshold (making success harder).
- CRITICAL: Do NOT set all thresholds below 200. Most actions in a dangerous world have a real chance of failure. A sword swing against an armored foe should NOT succeed 90% of the time.
- Include "Critical Success" (highest tier) and optionally "Partial Success" between Success and Failure.
- Example high-stakes check: {"name": "Defuse Bomb", "difficulty": "very_hard", "thresholds": {"Critical Success": 950, "Success": 750, "Failure": 400}} (Rolls 0-399 = Critical Failure)
- Example moderate combat check: {"name": "Sword Strike", "difficulty": "moderate", "thresholds": {"Critical Success": 850, "Success": 500, "Partial Success": 300}} (Rolls 0-299 = Failure/Crit Failure)

DYNAMIC STATS RULE (CRITICAL):
- Stats must NOT be stale numbers (e.g., "Agility: 25") and MUST NOT use tabletop dice notation (e.g., "1d20", "2d6"). Using dice rolls is strictly FORBIDDEN.
- Stats must be represented as modifiers to the base probability engine (0-1000) and include dynamic context and effects.
- Example format for stats:
  * agility: base probability engine + 5%(1000) + effects
  * perception: base probability engine + 10%(1000) + effects
  * charisma: base probability engine - 5%(1000) + effects
- Armor must be represented with a base threshold and specific damage type immunities below that threshold.
  * Example: armor: leather base armor 15 (damage less than 15 that is Bludgeoning, Force, Piercing, and Slashing won't effect because of the protection unless other effects/context apply)
- ADVANTAGE/DISADVANTAGE: 1 disadvantage modifier effect exactly cancels out 1 advantage modifier effect.

FILE DETAIL RULE (CRITICAL):
- ALL files (character files, locations, items, WorldRules, etc.) MUST be highly detailed, extensive, specific, and accurate. 
- Do not write vague or short descriptions. Include deep lore, precise physical dimensions, exact quantitative stats, psychological profiles for NPCs, and exhaustive inventory lists.
- MAGIC & ABILITIES PLACEMENT RULE (CRITICAL):
  * Character-specific magic, spells, abilities, and powers MUST be written ONLY inside that character's own file under [ABILITIES & MAGIC].
  * WorldRules.txt should ONLY contain world-wide magic laws (e.g., "magic doesn't work in anti-magic zones", "all fire spells are 20% weaker in rain"). It must NOT list individual character spells.
  * NPC abilities go in the NPC's file. Item enchantments go in the item's file.
  * NEVER scatter a character's abilities across multiple files. Keep them consolidated in ONE place: the owner's file.
  * NEVER use vague terms like "can do magic" or "has magical abilities". Every single ability must have: exact Name, Energy Cost, Range, Duration, Cooldown, Weight/Size Limits, Elemental Type, and explicit Limitations (what it CANNOT do).
- You MUST explicitly include the physical size, dimensions, and weight for EVERY character, creature, NPC, and item in their respective files.
- Make the files long and comprehensive.
- IMPORTANT MINIMIZATION RULE: ONLY include files in the 'files' object if they are NEW, MODIFIED, or DELETED. If a file is completely unchanged, DO NOT include it in the response at all (it will persist automatically). NEVER use null to mean 'no change' (null means DELETE). NEVER truncate file content with ellipses (...).

LOOSE REFERENCE RULE (CRITICAL):
- Make a file for each thing even if it is only loosely referenced (e.g., a professor or a home mentioned in passing), IF the player themselves could possibly interact with it, know it, or will know it in the future/past/present.
- Do NOT make a file for universally known or unreachable loose concepts that the player won't interact with directly (e.g., a college student hearing about the "moon" in a conversation wouldn't trigger a file for the moon).
- For loosely referenced things, the file doesn't need to show full details initially—only whatever details were loosely mentioned—unless full detail is later needed or it becomes no longer loosely referenced.

CRITICAL FILE MANAGEMENT RULES:
- Create a "Guide.txt" file that acts as your internal operating manual. It MUST track the current status of all major quests, active plot hooks, and include a MASTER STAT TABLE of all known characters and NPCs (Name, Health, Energy, Location, Primary Goal) for quick reference.
- Create "WorldRules.txt" defining physics, magic, tech, logic, time costs, and encumbrance effects.
- Create "CurrentMap.json" to track the live map of the player's current location (50-200 meter scale). MUST be valid JSON.
  * Update this file accurately in real-time based on context, location, dimensions, and speed.
  * Structure: \`{ "pages": [{ "name": "Region/Area Name", "scale": "50m", "areas": [{ "id": "a1", "name": "Room Name", "type": "room|hallway|field|forest|water|building|furniture|npc|obstacle|vehicle|fire|lava|poison|treasure|tech|magic|nature|portal|terminal|hazard", "shape": "rect|circle|polygon", "x": 0, "y": 0, "width": 10, "height": 10, "radius": 5, "points": "0,0 10,10 0,10", "visible": true}], "players": [{ "username": "PlayerName", "x": 5, "y": 5, "facing": 0, "vision": { "mainAngle": 66, "peripheralAngle": 90, "detailedRange": 20, "maxRange": 50} }], "notes": [{ "x": 10, "y": 10, "text": "Fire", "type": "danger|info|warning|discovery"}] }] }\`
  * Map Pages Rule: If all active players are in the same general region, generate a single page in the "pages" array. If players are geographically far apart (e.g. different towns, deep dungeon vs surface), separate them into multiple distinct pages within the "pages" array.
  * \`notes\`: Use for dynamic annotations like "Fire", "Toxic Gas", "Discovery", "Clue", "Exit", etc. for specific coordinates.
  * \`visible\`: false means it's greyed out (fog of war).
  * Completely unknown/unseen elements MUST be omitted from the map entirely.
  * Ensure correct geometry and scale for all elements using \`shape\`, \`width\`, \`height\`, \`radius\`, or \`points\`.
  * \`facing\`: angle in degrees (0 is right, 90 is down, 180 is left, 270 is up).
  * \`vision\`: contains the player's dynamic vision capabilities.
  * Include all player-visible elements within the scale (npcs, furniture, buildings, vehicles, hazards, etc.).
  * You MUST show ALL active players on the map in the 'players' array.
  * You MUST show all visible, sensed, or last known NPC locations on the map in the 'areas' array (type: 'npc').
  * CRITICAL: Make the map highly detailed. Add small details like furniture, individual trees, hazards, or ground texture as separate areas or via the \`notes\` array. Use \`notes\` for anything that isn't a physical structure but is an important environmental effect (e.g., "Heavy Fire", "Poison Gas", "Strange Energy", "Digital Glitch").
  * Use \`type: tech/terminal\` for cyberpunk/sci-fi elements.
  * Use \`type: magic/portal\` for fantasy/supernatural elements.
  * Use \`type: nature/hazard\` for environmental obstacles.
  * Use \`type: treasure/loot\` for items or points of interest.
  * Use hide[Secret Room] or target(PlayerName)[Secret Room] for area names if they are forgotten, hidden or only known to specific players.
  * Ensure scaling and coordinates are consistent.
- Create character files named "CharacterName-USERNAME.txt" for each player using the ENTITY FILE SCHEMA.
- ONE CHARACTER PER PLAYER (CRITICAL): Each username MUST have exactly one character file. NEVER create a second character file for the same username. Only create a file if NO file ending in "-USERNAME.txt" exists for that player. If they describe a new character, update the existing file or ignore it if it violates the one-character-per-account rule.
- CRITICAL: If a player's health reaches 0 or they die, DELETE their character file immediately by setting it to null in the files object.
- Create "WorldTime.txt" with ACTUAL date/time/year appropriate for the world setting.
- Create files for EVERY entity that appears: NPCs, items, locations, vehicles, projectiles. MUST follow ENTITY FILE SCHEMA. NEVER forget to generate character files for individuals and group entity files for groups of NPCs..
- Use hide[...] for secrets/traps/hidden info in file contents OR file names. This is hidden from player view.
- Use target(PlayerName)[content] in file contents OR file names OR narrative to restrict visibility strictly to specific players.
- Track unique instances: [ObjectType_ID(status)]
- Status effects: [Status:Type_ID(Expires: TIME)]

CURRENT MAP JSON FORMATTING (CRITICAL):
- When outputting "CurrentMap.json" inside "files", its "content" field MUST be a DIRECT raw JSON Object, NOT an escaped string.
- CORRECT:
  "CurrentMap.json": {
    "content": { "pages": [ ... ] },
    "displayName": "Current Map"
  }
- FORBIDDEN: Do NOT write "content": "{\n \"pages\": ... }". Do NOT escape quotes with backslashes (\"). Output raw nested JSON.

NARRATIVE IDENTITIES RULE (CRITICAL):
- In the "narrative" field, you MUST refer to players ONLY by their Character Name (found in their "CharacterName-USERNAME.txt" file) and use the gender/pronouns defined in that character's biometrics section.
- NEVER use a player's account username (e.g., the name passed in metadata) in the narrative.
- NEVER assume player pronouns based on their real-world profile. If a character is described as "Male", use he/him; if "Female", use she/her; if "Non-binary", use they/them.
- All NPC dialogue and story descriptions must maintain this roleplay consistency.

SPATIAL CONSISTENCY RULE (CRITICAL):
- Scale coherence: All coordinates in CurrentMap.json are in METERS relative to the 'scale' property.
- Range Enforcement (MANDATORY): No physical action (melee, ranged, gear usage) can succeed if the distance to the target exceeds the range defined in the object's file.
  * Melee: 1–3m range.
  * Ranged/Projectiles: Range must be defined in meters (e.g., Bow: 60m).
- PROJECTILE LOGIC:
  * When firing a projectile (bullet, arrow, spell bolt), you MUST calculate travel time: time = distance / velocity.
  * If travel time is > 1.0s, the projectile must be created as an entry in CurrentMap.json 'areas' with type='projectile' and its current (x, y) coordinates.
  * Update the projectile's position in subsequent responses until impact or miss.
- SCALE INTEGRITY: A character with 1.5m/s speed moves exactly 15m in 10s. Never allow "teleporting" or magically ignoring scale.
- Distance Calibration: Use sqrt((x2-x1)^2 + (y2-y1)^2) for ALL range checks.
- A map screenshot is provided for visual grounding—verify coordinate updates against the visual state.

MANDATORY MOVEMENT & MAP UPDATE RULE (CRITICAL):
- CurrentMap.json MUST be updated in EVERY response. Any player action implies a physical state change — at minimum, update the player's facing direction.
- Physical proximity is required for interaction. Before resolving any action (attack, talk, pick up, open, use, examine, etc.), verify the player is within interaction range of the target using the SPATIAL CONTEXT distances provided.
- AUTO-APPROACH: If a player is out of range for their intended action:
  1. Compute max traversable distance: walking_speed (from character file) × action_time_cost (seconds).
  2. Move the player along the direct vector toward the target by that distance, or stop at interaction range if closer.
  3. New coordinates: newX = oldX + (targetX - oldX) × (moveDist / totalDist), newY = oldY + (targetY - oldY) × (moveDist / totalDist).
  4. If now in range → action succeeds; narrate the approach and the action together.
  5. If still out of range → action is incomplete; narrate the partial approach and remaining distance.
- FACING: Update the player's 'facing' field to point toward the interaction target: facing = atan2(targetY - playerY, targetX - playerX) × 180 / π.
- NPC & ENTITY MOVEMENT: When NPCs engage in combat, pursue, flee, or patrol, update their (x, y) position in the 'areas' array proportional to their speed × time.
- PROJECTILE TRACKING: Any active projectile (arrow, bullet, fireball) MUST have its (x, y) updated in CurrentMap.json in every response until it hits or disappears.
- VISION & DETECTION: Player vision ranges (detailedRange, maxRange) in CurrentMap.json must match perception stats. Entities beyond maxRange must not appear on the map.
- COORDINATE INTEGRITY: All coordinates must be proportional to the declared map scale. A "10m × 10m" room = width:10, height:10. Never use arbitrary coordinates that violate the scale.
- A screenshot of the current map may be attached. Use it to visually verify spatial consistency of your response.

FILE REFERENCE SYNTAX:
Use [DisplayName] or [FileName] in narrative text - these become clickable links to files
Examples: [character-John], [King's Guard], [Iron Sword], [Old Church]

TIME SYSTEM:
- WorldTime.txt contains the CURRENT time/date/year, not elapsed time
- Calculate action duration and ADD to current time
- Update WorldTime.txt with new current time after each action
- Check and expire status effects against current time

UPDATE VALUES:
- Health changes: negative for damage, positive for healing
- Energy: negative when spent, positive for restored
- Time: always show the time cost in seconds (e.g., "+30s" for 30 second action)
- Inventory: "+1" when adding, "-1" when removing

CRITICAL: Before EVERY action, check:
1. Does this entity have a file? If not, CREATE it immediately
2. Are the character files accurate (Health, Energy, Inventory)? You MUST update files if stats change.
3. Are status effects expired based on current WorldTime?
4. Does this action respect WorldRules physics/magic/tech?
5. Does player have required stats/items/energy?

RESPONSE FORMAT:
Respond with JSON only:
{
  "narrative": "Story text with [DisplayName] references for all entities/items/locations. Use target(PlayerName)[secret text] for private messages.",
  "updates": [
    {"type": "stat", "text": "Health -10", "value": -10},
    {"type": "item", "text": "Added Iron Key", "value": 1},
    {"type": "time", "text": "+30s", "value": 30}
  ],
  "files": {
    "filename.txt": {"content": "file content with hide[secrets] or target(PlayerName)[private info]", "displayName": "Display Name"},
    "dead_player.txt": null
  },
  "gameOver": false,
  "checks": [],
  "recommendations": ["Action recommendation 1", "Action recommendation 2", "Action recommendation 3"]
}

If probability checks are required, return empty narrative and fill the "checks" array.
Set gameOver to true ONLY when player health/critical stat reaches 0.
Always include 1-3 dynamic auto ai action recommendations for the player based on context so far in the "recommendations" array.
For starting prompt, create initial world files with appropriate time/year and set the scene.`;

const ACTION_AUDIT_PROMPT = `TASK: Technical Requirement Audit.
You are the High-Efficiency Logic Auditor for the AI-MUD system.

Your ONLY goal is to analyze the player's action against the "World Context" and "Guide" to identify every technical system requirement.

INSTRUCTIONS:
1. AUDIT FOR CHECKS: Identify if the action requires a probability check (Combat, Stealth, Magic Focus, Physical feats, etc.).
2. AUDIT FOR ENTITIES: List every individual NPC, group of NPCs, Weapon, Item, or Location mentioned that does NOT have a file in context.
3. AUDIT FOR MAP: Determine if the player moved or the environment changed.
4. DETECT MODIFIERS: For any check identified, scan the context for mathematical modifiers (stats, items, rules, effects).
5. AUDIT FOR TEMPORAL SHIFT, SPATIAL SPLIT, & MAP PAGES: Detect if the action causes time travel, dimensional slips, or timeline returns. Specify destination time/year, anchor origin time, and whether WorldTime.txt requires temporal re-anchoring. Spatial splits & map pages: Determine whether players are together or geographically separated across different locations, levels, or timelines. Verify which map page(s) must be created, updated, or preserved to prevent data loss. List all NPCs, entities, hazards, and projectiles that must appear on the updated page(s).
   
OUTPUT FORMAT (Strict JSON only):
{
  "intent": "Brief description of what the player is doing",
  "checks": [
    {
      "name": "Check Name",
      "reason": "Why this check is needed",
      "difficulty": "trivial|easy|moderate|hard|very_hard|near_impossible",
      "stat": "relevant_primary_attribute",
      "modifiers": [
        { "label": "Modifier Name", "math": "base + X%(1000) or +X", "origin": "filename.txt", "reasoning": "..." }
      ]
    }
  ],
  "temporalShift": {
    "isTimeTravel": true,
    "destinationEpoch": "Era / Year",
    "destinationTimestamp": "H:MM:SS AM/PM - Month DD, YYYY",
    "storeAnchorTime": "H:MM:SS AM/PM - Month DD, YYYY",
    "notes": "Action traveled back to 1888; preserve modern departure time in Anchor block."
  },
  "mapAudit": {
    "requiresUpdate": true,
    "isMultiPage": true,
    "activePages": ["Page_1_Surface", "Page_2_Underground"],
    "entitiesToPlace": ["Player_A", "Player_B", "Bandit_1", "Bandit_2", "Chest_01"],
    "spatialNotes": "Player_B entered dungeon; must create new page while preserving surface page for Player_A."
  },
  "filesToCreate": ["List of filenames to immediately generate"],
  "filesToUpdate": ["List of filenames that must be modified (Player, NPCs, etc)"],
  "mapUpdateRequired": true,
  "interruptedTime": null
}

CRITICAL: Ignore time-based strings (+30s) in math. Magic abilities MUST require "Magic Focus" or "Arcana" checks. Weapons MUST use technical rules.`;


export class AIEngine {
  private fs: FileSystem;
  private ai: GoogleGenAI;
  private lastValidMap: string | null = null;

  constructor(fileSystem: FileSystem) {
    this.fs = fileSystem;
    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('aimud_apikey') : null;
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || storedKey || '' });
    // Initialize the last valid map from current storage
    const existingMap = this.fs.read('CurrentMap.json');
    if (existingMap) {
      try {
        JSON.parse(existingMap);
        this.lastValidMap = existingMap;
      } catch (e) {
        // Existing map is already corrupt, nothing we can do
      }
    }
  }

  private taskQueue: Promise<any> = Promise.resolve();

  async initialize(startingPrompt: string, username?: string): Promise<AIResponse | null> {
    return new Promise((resolve) => {
      this.taskQueue = this.taskQueue.then(async () => {
        try {
          const charRequirement = username
            ? `CRITICAL: You MUST also create a highly detailed, extensive character file for player "${username}" during this initialization. If the prompt doesn't specify their character traits, generate a highly-varied random character (class, appearance, background, name) that fits the starting context. The file MUST be named EXACTLY "CharacterName-${username}.txt" (e.g. "Legolas-${username}.txt").`
            : "CRITICAL: DO NOT create any player character files during this initialization phase. Players will provide their character descriptions separately later. You MUST NOT return any file named with \"CharacterName-USERNAME.txt\" format during this world generation phase. Wait for the explicit character prompt next.";

          const prompt = `Initialize world: ${startingPrompt}\n\nRemember: PROBABILITY ENGINE RULE (CRITICAL). Create highly detailed, extensive, and long files for the starting world (CurrentMap.json, WorldRules.txt, Guide.txt, WorldTime.txt, and any initial locations/NPCs). ${charRequirement} Ensure all stats use the new dynamic probability engine modifier format (e.g., "agility: base probability engine + 5%(1000) + effects") and armor uses thresholds. If the initialization involves any uncertain event, return "checks".\nCRITICAL: Any magic, abilities, or spells MUST be highly specific with strict limits, energy costs, ranges, and target caps. Vague "magic" is completely unacceptable. Initialize WorldTime.txt containing both [CURRENT ACTIVE TIME] and [ANCHOR / ORIGIN TIMELINE] with identical starting timestamps and Anchor Flow Mode set to Frozen.`;
          const res = await this.handleRequest(prompt, undefined, username);
          resolve(res);
        } catch (e) {
          console.error("Initialization failed", e);
          resolve({ narrative: "System initialization failed. Please check API Key." });
        }
      });
    });
  }

  async processAction(action: string, username?: string, mapScreenshot?: string): Promise<AIResponse | null> {
    return new Promise((resolve) => {
      this.taskQueue = this.taskQueue.then(async () => {
        try {
          const files = this.getRelevantFiles(username, action);
          const formatFileSet = (fileEntries: [string, string][]) =>
            fileEntries.map(([name, content]) => `=== ${name} ===\n${content}`).join('\n\n');

          const worldContext = formatFileSet(Object.entries(files));
          const spatialContext = this.buildSpatialContext(username);
          const userHeader = username ? `[Player: ${username}]\n` : '';

          // STAGE 1: TECHNICAL AUDIT (THE "THINKING" PHASE)
          const auditPrompt = `${ACTION_AUDIT_PROMPT}\n\n[WORLD CONTEXT]\n${worldContext}\n\n[SPATIAL CONTEXT]\n${spatialContext}\n\n${userHeader}Player action: ${action}`;
          const auditRaw = await this.callAI(auditPrompt, mapScreenshot, 'gemini-3.5-flash-lite');
          const audit = this.extractJSON(auditRaw);

          if (!audit) throw new Error("Audit failed");

          // STAGE 2: RESOLUTION (BACKEND CALCULATION)
          let resolvedCheckReport = "";
          let resolvedCheckDetails = "";
          
          if (audit.checks && audit.checks.length > 0) {
            const results = audit.checks.map((check: any) => {
              const bonusResult = this.calculateBonusFromAI(check.modifiers || [], username);
              const totalBonus = bonusResult.total;
              const difficulty = check.difficulty || 'moderate';
              
              let safeThresholds = this.getDefaultThresholds(difficulty);
              if (totalBonus !== 0) {
                const shifted: { [key: string]: number } = {};
                for (const [key, val] of Object.entries(safeThresholds)) {
                  shifted[key] = Math.max(0, Math.min(1000, val - totalBonus));
                }
                safeThresholds = shifted;
              }
              safeThresholds = this.enforceRealisticThresholds(safeThresholds, difficulty);

              const roll = Math.floor(Math.random() * 1001);
              const outcome = this.determineOutcome(roll, safeThresholds, difficulty);

              return {
                name: check.name,
                outcome,
                roll,
                thresholds: safeThresholds,
                math: bonusResult.breakdown || "No modifiers"
              };
            });

            resolvedCheckReport = results.map(r => `[Check: ${r.name} - Result: ${r.outcome}]`).join('\n');
            resolvedCheckDetails = results.map(r => 
              `[Probability Check: ${r.name} - Result: ${r.outcome} | Roll: ${r.roll}/1000 | Math: ${r.math} | Thresholds: ${JSON.stringify(r.thresholds).replace(/"/g, '&quot;')}]`
            ).join(' ');
          }

// STAGE 3: FINAL IMPLEMENTATION (THE "ACTION" PHASE)
          const mapReq = audit.mapAudit?.requiresUpdate ?? audit.mapUpdateRequired ?? true;
          const timeShiftNotice = audit.temporalShift?.isTimeTravel 
            ? `TEMPORAL DISPLACEMENT DETECTED: Jump to ${audit.temporalShift.destinationEpoch} (${audit.temporalShift.destinationTimestamp}). Anchor origin time: ${audit.temporalShift.storeAnchorTime}. Update WorldTime.txt according to schema!` 
            : "None";

          const executionPrompt = `Current Files Context:\n${worldContext}\n\n${spatialContext}\n\n${userHeader}Player action: ${action}\n\nTECHNICAL PLAN (Follow strictly):\n1. Resolve these checks: ${resolvedCheckReport || "None"}\n2. Create these files immediately: ${audit.filesToCreate?.join(', ') || "None"}\n3. Update these files: ${audit.filesToUpdate?.join(', ') || "None"}\n4. Temporal Shift: ${timeShiftNotice}\n5. Map Update Required: ${mapReq}\n\nProcess this action based on the technical plan. Ensure every new item, weapon, or entity is created with full technical details.

CRITICAL REMINDERS:
1. You MUST fulfill Every file creation/update listed in the plan above.
2. ${resolvedCheckDetails ? `Include this exactly: ${resolvedCheckDetails}` : ""}
3. MAP UPDATE: Fully update CurrentMap.json. 
   - CRITICAL: Do NOT omit pages for players who did not take this turn. If players are separated, return ALL pages in the "pages" array.
   - Every entity, NPC, obstacle, and player within the scale bounds of each page MUST be plotted with valid (x, y) coordinates and facing angles.
4. WEAPONS: Use ITEM & WEAPON TECHNICAL SCHEMA for any equipment created.
5. STATS: Use MATH FORMULAS ONLY for stats.
6. JSON SYNTAX: Close the "files" object with a curly brace "}" before "gameOver". NEVER close "files" with a square bracket "]".`;

          const finalResponse = await this.handleRequest(executionPrompt, mapScreenshot, username, 'gemini-3.5-flash-lite');
          
          // Post-process spatial consistency (Old map state already captured via fs.read in handleRequest/enforceSpatialConsistency)
          const latestMapRaw = this.fs.read('CurrentMap.json');
          if (finalResponse && latestMapRaw) {
             // Use the most recent valid map before final implementation as reference
             const referenceMap = this.lastValidMap || latestMapRaw;
             this.enforceSpatialConsistency(referenceMap, username);
          }

          resolve(finalResponse);
        } catch (e) {
          console.error("Processing failed", e);
          resolve({ narrative: "Error processing action." });
        }
      });
    });
  }

  /**
   * Selects only the files necessary for the current context.
   * Prioritizes core files, player files, and spatially relevant files.
   */
  private getRelevantFiles(username?: string, action?: string): { [name: string]: string } {
    const all = this.fs.getAll();
    const relevant: { [name: string]: string } = {};

    // 1. Core Engine Files
    const core = ['WorldRules.txt', 'Guide.txt', 'WorldTime.txt', 'CurrentMap.json'];
    for (const f of core) {
      if (all[f]) relevant[f] = all[f];
    }

    // 2. Active Player Context
    if (username) {
      const uLower = username.toLowerCase();
      const playerFiles = Object.keys(all).filter(f => {
        const lower = f.toLowerCase();
        return lower.endsWith(`-${uLower}.txt`) || lower.endsWith(`_${uLower}.txt`) || lower.includes(` ${uLower}.txt`);
      });
      for (const f of playerFiles) {
        relevant[f] = all[f];
        // SCAN INVENTORY: Pull in technical files for items the player is carrying
        for (const potentialItemFile of Object.keys(all)) {
          if (relevant[potentialItemFile]) continue;
          const base = potentialItemFile.replace('.txt', '').toLowerCase();
          if (base.length > 2 && all[f].toLowerCase().includes(base)) {
            relevant[potentialItemFile] = all[potentialItemFile];
          }
        }
      }
    }

    // 3. Spatially Relevant Files
    const mapRaw = all['CurrentMap.json'];
    if (mapRaw) {
      try {
        const mapData = JSON.parse(mapRaw);
        const players = mapData.players || [];
        const areas = mapData.areas || [];

        // Find current player's location
        const player = players.find((p: any) => p.username?.toLowerCase() === username?.toLowerCase());
        if (player) {
          const px = player.x, py = player.y;
          const range = 100; // Search radius

          for (const area of areas) {
            const dist = Math.sqrt((area.x - px) ** 2 + (area.y - py) ** 2);
            if (dist < range) {
              const aName = area.name?.toLowerCase().replace(/\W/g, '') || '';
              const fileMatch = Object.keys(all).find(f => {
                const fName = f.toLowerCase().replace('.txt', '').replace(/\W/g, '');
                return fName.includes(aName) || aName.includes(fName);
              });
              if (fileMatch) relevant[fileMatch] = all[fileMatch];
            }
          }
        }
      } catch (e) { }
    }

    // 5. Action Keyword Matching (Broad context sweep)
    if (action) {
      const words = action.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      for (const f of Object.keys(all)) {
        if (relevant[f]) continue;
        const lowFile = f.toLowerCase();
        const lowContent = all[f].toLowerCase();
        // Include if filename matches OR if content matches and action is brief
        if (words.some(w => lowFile.includes(w) || (lowContent.includes(w) && action.length < 100))) {
          relevant[f] = all[f];
        }
      }
    }

    return relevant;
  }

  /**
   * Generates a text summary of the current map state for the AI.
   */
  private buildSpatialContext(username?: string): string {
    const mapRaw = this.fs.read('CurrentMap.json');
    if (!mapRaw) return '';

    try {
      const map = JSON.parse(mapRaw);
      const pages = map.pages || (map.areas ? [map] : []);
      const lines: string[] = ['[SPATIAL CONTEXT]'];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageLabel = page.name || `Page ${i + 1}`;
        const players = page.players || [];
        const areas = page.areas || [];

        const player = players.find((p: any) => p.username?.toLowerCase() === username?.toLowerCase());
        if (player) {
          const px = Number(player.x) || 0;
          const py = Number(player.y) || 0;
          const distLines: string[] = [];

          for (const area of areas) {
            const ax = Number(area.x) || 0;
            const ay = Number(area.y) || 0;
            const aw = Number(area.width) || 0;
            const ah = Number(area.height) || 0;
            const cx = area.shape === 'circle' ? ax : ax + aw / 2;
            const cy = area.shape === 'circle' ? ay : ay + ah / 2;
            const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
            distLines.push(`  → ${area.type || 'Object'}: ${area.name} (${area.description || ''}) is ${dist.toFixed(1)}m away [at (${cx.toFixed(1)}, ${cy.toFixed(1)})]`);
          }

          for (const other of players) {
            if (other.username?.toLowerCase() === username?.toLowerCase()) continue;
            const ox = Number(other.x) || 0;
            const oy = Number(other.y) || 0;
            const dist = Math.sqrt((px - ox) ** 2 + (py - oy) ** 2);
            distLines.push(`  → Player ${other.username}: ${dist.toFixed(1)}m away on [${pageLabel}] at (${ox.toFixed(1)}, ${oy.toFixed(1)})`);
          }

          lines.push(`${pageLabel} at (${px.toFixed(1)}, ${py.toFixed(1)}), facing ${player.facing || 0}°:`);
          lines.push(...distLines);
        }

        if (page.scale) {
          lines.push(`Map scale: ${page.scale}`);
        }
      }

      return lines.join('\n');
    } catch (e) {
      console.error('Failed to build spatial context', e);
      return '';
    }
  }

  /**
   * Safe JSON repair for common AI mistakes
   */
  private repairJSON(raw: string): string | null {
    try {
      let s = raw.trim();
      // Remove possible markdown wrappers
      s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();

      // Remove trailing commas before } or ]
      s = s.replace(/,\s*([}\]])/g, '$1');

      // Unquoted keys fix
      s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      // Fix inner stringified JSON keys where backslash was dropped before quote-colon: \"key": -> \"key\":
      s = s.replace(/\\\"([a-zA-Z0-9_-]+)":/g, '\\"$1\\":');
      
      // Basic brace balancing
      let delta = 0;
      for (const char of s) {
        if (char === '{') delta++;
        if (char === '}') delta--;
      }
      while (delta > 0) { s += '}'; delta--; }

      return s;
    } catch (e) {
      return null;
    }
  }

  /**
   * Post-processes the AI's response to enforce spatial consistency.
   * Compares old vs new map state and corrects player positions if the AI
   * failed to move them appropriately toward any interactive entity.
   */
private enforceSpatialConsistency(oldMapRaw: string, username?: string) {
    const newMapRaw = this.fs.read('CurrentMap.json');
    if (!newMapRaw || !oldMapRaw) return;

    try {
      const oldMap = JSON.parse(oldMapRaw);
      const newMap = JSON.parse(newMapRaw);

      const oldPages = oldMap.pages || (oldMap.areas ? [oldMap] : []);
      const newPages = newMap.pages || (newMap.areas ? [newMap] : []);

      const interactiveTypes = new Set([
        'npc', 'treasure', 'loot', 'furniture', 'vehicle', 'terminal',
        'portal', 'tech', 'magic', 'obstacle', 'building'
      ]);

      let modified = false;

      for (const newPage of newPages) {
        const oldPage = oldPages.find((p: any) => 
          (p.name && newPage.name && p.name.toLowerCase() === newPage.name.toLowerCase()) ||
          (p.id && newPage.id && p.id === newPage.id)
        ) || oldPages[0];

        if (!newPage?.players || !oldPage?.players) continue;

        const areas = newPage.areas || [];

        for (const newPlayer of newPage.players) {
          const oldPlayer = oldPage.players.find((p: any) =>
            p.username?.toLowerCase() === newPlayer.username?.toLowerCase()
          );
          if (!oldPlayer) continue;

          const oldX = Number(oldPlayer.x) || 0;
          const oldY = Number(oldPlayer.y) || 0;
          const newX = Number(newPlayer.x) || 0;
          const newY = Number(newPlayer.y) || 0;

          if (Math.abs(newX - oldX) > 0.1 || Math.abs(newY - oldY) > 0.1) continue;

          let closestTarget: { cx: number; cy: number } | null = null;
          let closestDist = Infinity;

          for (const area of areas) {
            if (!interactiveTypes.has(area.type?.toLowerCase())) continue;

            const ax = Number(area.x) || 0;
            const ay = Number(area.y) || 0;
            const aw = Number(area.width) || 0;
            const ah = Number(area.height) || 0;
            const cx = area.shape === 'circle' ? ax : ax + aw / 2;
            const cy = area.shape === 'circle' ? ay : ay + ah / 2;
            const dist = Math.sqrt((newX - cx) ** 2 + (newY - cy) ** 2);

            if (dist < closestDist) {
              closestDist = dist;
              closestTarget = { cx, cy };
            }
          }

          const interactionRange = this.getInteractionRange(newPlayer.username) || 3;

          if (closestTarget && closestDist > interactionRange) {
            const moveSpeed = this.extractPlayerSpeed(newPlayer.username) || 1.5;
            const timeCost = this.estimateTimeCost() || 6;
            const maxMove = moveSpeed * timeCost;
            const moveDistance = Math.min(maxMove, Math.max(0, closestDist - (interactionRange * 0.8)));

            if (moveDistance > 0.5) {
              const ratio = moveDistance / closestDist;
              newPlayer.x = +(oldX + (closestTarget.cx - oldX) * ratio).toFixed(1);
              newPlayer.y = +(oldY + (closestTarget.cy - oldY) * ratio).toFixed(1);

              const facingRad = Math.atan2(
                closestTarget.cy - newPlayer.y,
                closestTarget.cx - newPlayer.x
              );
              newPlayer.facing = +(facingRad * 180 / Math.PI).toFixed(0);
              modified = true;
            }
          }
        }
      }

      if (modified) {
        const correctedJson = JSON.stringify(newMap.pages ? newMap : { pages: newPages }, null, 2);
        this.fs.write('CurrentMap.json', correctedJson);
        this.lastValidMap = correctedJson;
      }
    } catch (e) {
      console.error('Spatial consistency enforcement failed', e);
    }
  }

  /**
   * Tries to find the current max interaction range for a player (weapon, spell, etc.)
   */
  private getInteractionRange(username: string): number | null {
    if (!username) return null;
    const files = this.fs.getAll();
    const uLower = username.toLowerCase();

    for (const [name, content] of Object.entries(files)) {
      if (!name.toLowerCase().includes(uLower)) continue;

      // Look for range patterns in the character file or equipped items
      const rangeMatch = content.match(/(?:range|reach|distance)[:\s]*(\d+\.?\d*)\s*m/i);
      if (rangeMatch) return parseFloat(rangeMatch[1]);

      // Fallback for melee weapon detection
      if (content.toLowerCase().includes('sword') || content.toLowerCase().includes('axe') || content.toLowerCase().includes('club')) {
        return 2;
      }
    }
    return null;
  }

  /**
   * Extracts a player's movement speed from their character file.
   * Handles varied formats: "Walking: 1.5m/s", "Speed 5 ft/s", "Movement Speed: 3 meters per second", etc.
   * Returns speed in m/s, or null if not found.
   */
  private extractPlayerSpeed(username: string): number | null {
    if (!username) return null;
    const files = this.fs.getAll();
    const uLower = username.toLowerCase();

    for (const [name, content] of Object.entries(files)) {
      if (!name.toLowerCase().includes(uLower)) continue;

      // Try multiple patterns from most specific to least
      const patterns = [
        /(?:walk(?:ing)?|run(?:ning)?|move(?:ment)?|speed|sprint(?:ing)?|base\s*speed)[:\s]*(\d+\.?\d*)\s*m(?:eters?)?\s*(?:\/|per\s*)s(?:ec(?:ond)?)?/i,
        /(\d+\.?\d*)\s*m\/s/i,
        /(\d+\.?\d*)\s*(?:ft|feet)\s*(?:\/|per\s*)s(?:ec)?/i,  // ft/s → convert
        /(\d+\.?\d*)\s*(?:km|kph|km\/h)/i,  // km/h → convert
        /(?:speed|movement)[:\s]*(\d+\.?\d*)/i, // bare number fallback
      ];

      for (let i = 0; i < patterns.length; i++) {
        const match = content.match(patterns[i]);
        if (match) {
          let speed = parseFloat(match[1]);
          // Convert units to m/s
          if (i === 2) speed *= 0.3048;    // ft/s → m/s
          if (i === 3) speed /= 3.6;       // km/h → m/s
          if (speed > 0 && speed < 100) return speed; // sanity check
        }
      }
    }
    return null;
  }

  /**
   * Estimates the time cost of the last action by checking the most recent
   * update entry or WorldTime changes. Returns seconds, or null if unknown.
   */
  private estimateTimeCost(): number | null {
    // Check the WorldTime.txt for any time-related info
    // This is a best-effort estimation — return null to use defaults
    return null;
  }

  private async handleRequest(userPrompt: string, mapScreenshot?: string, username?: string, modelName?: string): Promise<AIResponse | null> {
    // Phase 1: Analyze/Execute
    let responseText = await this.callAI(userPrompt, mapScreenshot, modelName);
    let data: AIResponse;

    try {
      data = this.extractJSON(responseText);
    } catch (e) {
      console.error("JSON extraction/parse Error", e, responseText);
      return { narrative: "System Error: AI returned invalid JSON format." };
    }

    // Phase 2: If checks are required
    if (data.checks && Array.isArray(data.checks) && data.checks.length > 0) {
      // 0. Also process any file updates from Phase 1 so they aren't lost
      this.processResponseData(data, username);

      const worldState = this.getWorldContextForAI(username, userPrompt);

      const results = await Promise.all(data.checks.map(async check => {
        // Normalize alternate AI check formats
        const safeName = check.name || check.check || check.stat || 'Action Check';
        const safeDesc = check.description || `Probability roll for ${safeName}`;
        const difficulty = check.difficulty || 'moderate';

        // 1. DYNAMICALLY DETECT MODIFIERS USING AI
        // The AI analyzes the raw context and identifies structured modifier rules.
        const detectedMods = await this.detectRelevantModifiers(safeDesc, worldState, username);

        // 2. CALCULATE BONUS FROM DETECTED MODS (System Math)
        const bonusResult = this.calculateBonusFromAI(detectedMods, username);
        const globalBonus = bonusResult.total;

        // Apply manual modifier if present, added to the global bonus
        const manualMod = check.modifier || 0;
        const totalBonus = globalBonus + manualMod;

        // Build math breakdown string
        let mathBreakdown = bonusResult.breakdown;
        if (manualMod !== 0) {
          mathBreakdown += (mathBreakdown ? ' + ' : '') + `AI_Modifier: ${manualMod > 0 ? '+' : ''}${manualMod}`;
        }
        if (!mathBreakdown) mathBreakdown = 'No modifiers found';

        let safeThresholds: { [key: string]: number };
        if (check.thresholds && typeof check.thresholds === 'object') {
          safeThresholds = { ...check.thresholds };
        } else if (typeof check.threshold === 'number') {
          // Convert flat threshold to proper thresholds object
          const base = check.threshold;
          const adjusted = Math.max(0, Math.min(1000, base));
          safeThresholds = {
            "Critical Success": Math.min(1000, adjusted + 200),
            "Success": adjusted,
            "Partial Success": Math.max(0, adjusted - 200)
          };
        } else {
          // No thresholds from the AI at all — use difficulty-based defaults
          safeThresholds = this.getDefaultThresholds(difficulty);
        }

        // Apply total computer bonus to lower the thresholds
        // (A bonus reduces the required roll)
        if (totalBonus !== 0) {
          const shifted: { [key: string]: number } = {};
          for (const [key, val] of Object.entries(safeThresholds)) {
            shifted[key] = Math.max(0, Math.min(1000, val - totalBonus));
          }
          safeThresholds = shifted;
        }

        // Enforce realistic failure ranges based on difficulty
        safeThresholds = this.enforceRealisticThresholds(safeThresholds, difficulty);

        const roll = Math.floor(Math.random() * 1001);
        const outcome = this.determineOutcome(roll, safeThresholds, difficulty);
        return {
          name: safeName,
          description: safeDesc,
          outcome: outcome,
          roll: roll,
          thresholds: safeThresholds,
          math: mathBreakdown,
          rules: detectedMods.map(m => `${m.label}: ${m.math} (${m.reasoning})`)
        };
      }));

      const resultReport = results.map(r =>
        `Check: ${r.name}\nReason: ${r.description}\nRoll: ${r.roll} / 1000\nMath: ${r.math}\nThresholds: ${JSON.stringify(r.thresholds)}\nRESULT: ${r.outcome}`
      ).join('\n\n');

      const fullDetailsHtml = results.map(r =>
        `[Probability Check: ${r.name} - Result: ${r.outcome} | Roll: ${r.roll}/1000 | Math: ${r.math} | Thresholds: ${JSON.stringify(r.thresholds).replace(/"/g, '&quot;')}]`
      ).join(' ');

      const followUpPrompt = `PREVIOUS CONTEXT: ${userPrompt}\n\n[SYSTEM: Probability Engine Results]\n\n${resultReport}\n\nBased on these FAIR and FINAL results, generate the highly detailed narrative and extensive file updates. Calculate exact dynamic outcomes (e.g., damage = base * probability result) WITHOUT using dice notation. 
      CRITICAL: You MUST include the exact text "${fullDetailsHtml}" at the very beginning or end of your narrative so the player can click to see the full mathematical details. Do not alter the formatting of that string. Include the Check Name and Result (e.g. "[Jump: Failure]") natively in the narrative text as well.`;

      // We make a fresh call with the context combined, as we don't maintain a full chat history object here 
      // (The FS is the history source of truth).
      responseText = await this.callAI(followUpPrompt, undefined, modelName);
      try {
        data = this.extractJSON(responseText);
      } catch (e) {
        console.error("JSON Parse Error Phase 2", e);
        return { narrative: "Error processing check results." };
      }
    }

    this.processResponseData(data, username);
    return data;
  }

  private sanitizeJSON(raw: string): string {
    let result = '';
    let inString = false;
    let escape = false;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (inString) {
        if (escape) {
          result += char;
          escape = false;
        } else if (char === '\\') {
          result += char;
          escape = true;
        } else if (char === '"') {
          result += char;
          inString = false;
        } else if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else {
          result += char;
        }
      } else {
        if (char === '"') {
          result += char;
          inString = true;
        } else {
          result += char;
        }
      }
    }
    return result;
  }

  private extractJSON(text: string): any {
    // 1. Direct parse attempt
    try {
      return JSON.parse(text);
    } catch (e) { }

    // 2. Clear Markdown blocks if present and sanitize
    const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch) {
      try {
        return JSON.parse(this.sanitizeJSON(mdMatch[1]));
      } catch (e) { }
    }

    // 3. Fallback: Greedy match over the whole text, then sanitize unescaped newlines
    const greedyMatch = text.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      try {
        return JSON.parse(this.sanitizeJSON(greedyMatch[0]));
      } catch (e) { }

      // 4. Progressive brace trimming — AI sometimes adds extra trailing } characters
      let candidate = greedyMatch[0];
      for (let attempt = 0; attempt < 5; attempt++) {
        // Try removing the last }
        const lastBrace = candidate.lastIndexOf('}');
        if (lastBrace <= 0) break;
        candidate = candidate.substring(0, lastBrace);
        // Find the matching end
        const reMatch = candidate.match(/\{[\s\S]*\}/);
        if (reMatch) {
          try {
            return JSON.parse(this.sanitizeJSON(reMatch[0]));
          } catch (e2) { }
        }
      }
    }

    throw new Error("Failed to extract valid JSON");
  }

  private determineOutcome(roll: number, thresholds: { [outcome: string]: number }, difficulty: string = 'moderate'): string {
    if (!thresholds || typeof thresholds !== 'object') {
      return roll >= 500 ? "Success" : "Failure";
    }

    const sorted = Object.entries(thresholds)
      .sort(([, valA], [, valB]) => valB - valA);

    for (const [outcome, minVal] of sorted) {
      if (roll >= minVal) return outcome;
    }

    // Below all thresholds: determine Critical Failure vs Failure
    const lowestThreshold = sorted.length > 0 ? sorted[sorted.length - 1][1] : 500;

    // Check if the AI explicitly provided a "Failure" tier
    // If it did, and we are below all thresholds (including Failure), then it's a Critical Failure
    const hasExplicitFailure = Object.keys(thresholds).some(k => k.toLowerCase() === 'failure');
    if (hasExplicitFailure) {
      return "Critical Failure";
    }

    // Dynamic Critical Failure Range based on Difficulty
    // The higher the difficulty, the larger the proportion of the failure range that is "critical"
    const critFailPercentages: { [key: string]: number } = {
      'trivial': 0.05,        // 5% of failure range
      'easy': 0.10,           // 10% of failure range
      'moderate': 0.15,       // 15% of failure range
      'hard': 0.25,           // 25% of failure range
      'very_hard': 0.40,      // 40% of failure range
      'near_impossible': 0.60 // 60% of failure range
    };

    const percentage = critFailPercentages[difficulty] ?? 0.15;
    const critFailCutoff = Math.floor(lowestThreshold * percentage);

    // Absolute Floor: Rolls below this are ALWAYS Critical Failures regardless of thresholds/stats
    const absoluteFumbleFloors: { [key: string]: number } = {
      'trivial': 10,
      'easy': 25,
      'moderate': 40,
      'hard': 60,
      'very_hard': 100,
      'near_impossible': 150
    };

    // Context-based tweak: Ensure a minimum absolute floor for critical failures
    const minFloors: { [key: string]: number } = {
      'trivial': 25,
      'easy': 40,
      'moderate': 60,
      'hard': 100,
      'very_hard': 150,
      'near_impossible': 200
    };
    const minFloor = minFloors[difficulty] ?? 50;
    const fumbleFloor = absoluteFumbleFloors[difficulty] ?? 30;

    // Outcome determination
    if (roll <= fumbleFloor || roll <= Math.max(minFloor, critFailCutoff)) {
      return "Critical Failure";
    }
    return "Failure";
  }

  /**
   * Returns default threshold values when the AI provides none,
   * based on the action's difficulty tier.
   */
  private getDefaultThresholds(difficulty: string): { [key: string]: number } {
    switch (difficulty) {
      case 'trivial':
        return { "Critical Success": 900, "Success": 150, "Partial Success": 75 };
      case 'easy':
        return { "Critical Success": 900, "Success": 300, "Partial Success": 150 };
      case 'moderate':
        return { "Critical Success": 850, "Success": 500, "Partial Success": 300 };
      case 'hard':
        return { "Critical Success": 950, "Success": 700, "Partial Success": 500 };
      case 'very_hard':
        return { "Critical Success": 975, "Success": 800, "Partial Success": 650 };
      case 'near_impossible':
        return { "Critical Success": 995, "Success": 900, "Partial Success": 800 };
      default:
        return { "Critical Success": 850, "Success": 500, "Partial Success": 300 };
    }
  }

  /**
   * Enforces realistic failure ranges on the AI-provided thresholds.
   * The AI tends to set thresholds too low, making almost everything succeed.
   * This applies minimum threshold floors based on difficulty so there's always
   * a meaningful chance of failure for non-trivial tasks.
   */
  private enforceRealisticThresholds(
    thresholds: { [key: string]: number },
    difficulty: string
  ): { [key: string]: number } {
    // Minimum "Success" threshold floors per difficulty (Realism Tuning)
    // This ensures that even with huge bonuses, the game remains challenging.
    const minSuccessFloors: { [key: string]: number } = {
      'trivial': 150,       // 15% fail minimum (was 10%)
      'easy': 250,          // 25% fail minimum (was 20%)  
      'moderate': 400,      // 40% fail minimum (was 35%)
      'hard': 600,          // 60% fail minimum (was 50%)
      'very_hard': 750,     // 75% fail minimum (was 65%)
      'near_impossible': 900 // 90% fail minimum (was 80%)
    };

    const floor = minSuccessFloors[difficulty] ?? 350; // default to moderate

    // Find the "Success" threshold (or closest equivalent)
    const successKey = Object.keys(thresholds).find(k =>
      k.toLowerCase().includes('success') && !k.toLowerCase().includes('critical') && !k.toLowerCase().includes('partial')
    ) || 'Success';

    const currentSuccess = thresholds[successKey];
    if (currentSuccess !== undefined && currentSuccess < floor) {
      // The AI set the threshold too low — raise it to the floor
      const boost = floor - currentSuccess;
      // Shift ALL thresholds up by the same amount to maintain relative spacing
      const adjusted: { [key: string]: number } = {};
      for (const [key, val] of Object.entries(thresholds)) {
        adjusted[key] = Math.min(1000, val + boost);
      }
      return adjusted;
    }

    return thresholds;
  }

  private processResponseData(data: AIResponse, username?: string) {
    if (!data) return;

    if (data.files && typeof data.files === 'object' && !Array.isArray(data.files)) {
      // 1. Check for player file duplicates/naming changes if we have a username
      if (username) {
        const uLower = username.toLowerCase();
        const incomingPlayerFiles = Object.keys(data.files).filter(f => {
          const lower = f.toLowerCase();
          return lower.endsWith(`-${uLower}.txt`) || lower.endsWith(`_${uLower}.txt`) || lower.includes(` ${uLower}.txt`);
        });

        if (incomingPlayerFiles.length > 0) {
          // AI is sending at least one player file. Ensure we don't have others with different names.
          const existingPlayerFiles = this.fs.list().filter(f => {
            const lower = f.toLowerCase();
            return lower.endsWith(`-${uLower}.txt`) || lower.endsWith(`_${uLower}.txt`) || lower.includes(` ${uLower}.txt`);
          });

          // If the AI is creating a NEW filename, delete the old ones
          for (const oldFile of existingPlayerFiles) {
            if (!data.files[oldFile]) {
              console.log(`Auto-cleaning duplicate/old player file: ${oldFile}`);
              this.fs.delete(oldFile);
            }
          }
        }
      }

      // ==================== ADD MAP MERGE GUARD HERE ====================
      if (data.files['CurrentMap.json'] && this.lastValidMap) {
        try {
          const rawIncoming = (data.files['CurrentMap.json'] as any)?.content ?? data.files['CurrentMap.json'];
          const incomingStr = typeof rawIncoming === 'object' ? JSON.stringify(rawIncoming) : String(rawIncoming);
          const newMap = JSON.parse(incomingStr);
          const oldMap = JSON.parse(this.lastValidMap);

          const oldPages = oldMap.pages || (oldMap.areas ? [oldMap] : []);
          const newPages = newMap.pages || (newMap.areas ? [newMap] : []);

          // Preserve pages that were present in oldMap but omitted by the AI
          if (oldPages.length > 1 && newPages.length > 0) {
            const returnedNames = new Set(newPages.map((p: any) => p.name?.toLowerCase()));
            const missingPages = oldPages.filter((p: any) => !returnedNames.has(p.name?.toLowerCase()));

            if (missingPages.length > 0) {
              newMap.pages = [...newPages, ...missingPages];
              const mergedJson = JSON.stringify(newMap);

              if (typeof data.files['CurrentMap.json'] === 'object' && (data.files['CurrentMap.json'] as any).content !== undefined) {
                (data.files['CurrentMap.json'] as any).content = mergedJson;
              } else {
                data.files['CurrentMap.json'] = mergedJson;
              }
            }
          }
        } catch (e) {
          console.error("Map merge guard failed", e);
        }
      }
      
      for (const [filename, fileData] of Object.entries(data.files)) {
        if (fileData === null || (typeof fileData === 'object' && fileData.content === null)) {
          this.fs.delete(filename);
        } else if (typeof fileData === 'string') {
          const existing = this.fs.read(filename);
          if (existing === fileData) continue;
          if (filename === 'CurrentMap.json') {
            this.writeMapSafe(fileData);
          } else {
            this.fs.write(filename, fileData);
          }
        } else if (fileData && typeof fileData === 'object' && (fileData as any).content) {
          const contentStr = typeof (fileData as any).content === 'object' ? JSON.stringify((fileData as any).content) : (fileData as any).content;
          const existing = this.fs.read(filename);
          if (existing === contentStr) continue;
          if (filename === 'CurrentMap.json') {
            this.writeMapSafe(contentStr);
          } else {
            this.fs.write(filename, contentStr, (fileData as any).displayName);
          }
        }
      }
    }
  }

  /**
   * Safely writes CurrentMap.json by validating it is proper JSON first.
   * If the new content is invalid, attempts repair. If repair fails,
   * merges the old valid map data with any salvageable new data.
   */
/**
   * Normalizes arbitrary AI map output structures into a standard { pages: [...] } schema.
   * Handles top-level page wrappers, arrays of pages, and legacy single-map flat objects.
   */
  private normalizeMapStructure(parsed: any): { pages: any[] } {
    if (!parsed || typeof parsed !== 'object') {
      return { pages: [] };
    }

    // Case 1: Already wrapped in standard schema: { pages: [...] }
    if (Array.isArray(parsed.pages)) {
      return parsed;
    }

    // Case 2: AI returned a direct top-level array of page objects: [{ name: "...", areas: [...] }, ...]
    if (Array.isArray(parsed)) {
      return { pages: parsed };
    }

    // Case 3: Flat single-page map object: { name?: "...", areas: [...], players: [...] }
    return { pages: [parsed] };
  }

  /**
   * Safely writes CurrentMap.json by validating it is proper JSON first.
   * Enforces structural schema normalization to prevent nested or corrupt arrays.
   * Attempts sequential fallback: direct parse -> repairJSON -> lastValidMap -> sanitizeJSON.
   */
  private writeMapSafe(content: string): void {
    // 1. Direct parse attempt with normalization
    try {
      const parsed = JSON.parse(content);
      const normalizedObj = this.normalizeMapStructure(parsed);
      const normalized = JSON.stringify(normalizedObj, null, 2);
      this.fs.write('CurrentMap.json', normalized);
      this.lastValidMap = normalized;
      return;
    } catch (e) {
      // Direct parse failed, fall through to repair
    }

    // 2. Syntax auto-repair attempt
    const repaired = this.repairJSON(content);
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired);
        const normalizedObj = this.normalizeMapStructure(parsed);
        const normalized = JSON.stringify(normalizedObj, null, 2);
        this.fs.write('CurrentMap.json', normalized);
        this.lastValidMap = normalized;
        console.warn('CurrentMap.json required JSON repair — repaired and normalized successfully');
        return;
      } catch (e) {
        // Repair wasn't sufficient, fall through
      }
    }

    // 3. Fallback to last known good map state
    if (this.lastValidMap) {
      console.warn('CurrentMap.json had malformed JSON — falling back to last valid map');
      this.fs.write('CurrentMap.json', this.lastValidMap);
      return;
    }

    // 4. Last resort: aggressive string sanitization
    try {
      const sanitized = this.sanitizeJSON(content);
      const parsed = JSON.parse(sanitized);
      const normalizedObj = this.normalizeMapStructure(parsed);
      const normalized = JSON.stringify(normalizedObj, null, 2);
      this.fs.write('CurrentMap.json', normalized);
      this.lastValidMap = normalized;
      console.warn('CurrentMap.json required sanitization — recovered and normalized successfully');
      return;
    } catch (e) {
      console.error('CurrentMap.json is completely unrecoverable — discarding corrupt update');
    }
  }

  private getWorldContextForAI(username?: string, action?: string): string {
    const files = this.getRelevantFiles(username, action);
    const contextBlocks: string[] = [];

    for (const [filename, content] of Object.entries(files)) {
      contextBlocks.push(`=== FILE: ${filename} ===\n${content}`);
    }
    return contextBlocks.join('\n\n');
  }

  /**
   * Uses AI to dynamically detect which rules apply to the given action.
   * Instead of just picking strings, the AI interprets context and returns structured math bits.
   */
  private async detectRelevantModifiers(actionDesc: string, worldContext: string, username?: string): Promise<DetectedModifier[]> {
    if (!worldContext) return [];

    const detectionPrompt = `TASK: Analyze the provided World Context and identify ALL modifiers, character stats, active conditions, and world rules that logically affect this action: "${actionDesc}".
    ${username ? `ACTOR: The player "${username}".` : ''}
    
World Context:
${worldContext}

INSTRUCTIONS:
1. Identify every factor that mathematically influences the outcome based on CONTEXT (not just literal matches).
2. For each factor, extract the "Mathematical Essence" exactly as written in the text.
   - For stats/formulas (e.g. "Strength: base + 10%(1000)"), extract the math after the colon.
   - For flat bonuses (e.g. "+5 to hit"), extract the value.
   - For status effects (e.g. "[Status:Bleeding: -10]"), extract the value.
3. Only include factors that apply to the ACTOR or the WORLD generally.
4. IGNORE TIME COSTS: Never include time-based strings (e.g. "+30s", "10 seconds", "1m") as modifiers. They are for the player's duration of action, not the probability check.
5. Return a JSON array of objects with this exact structure:
   {
     "label": "Short name for the breakdown",
     "math": "The numeric expression or variable name",
     "origin_file": "The filename where this was found",
     "reasoning": "Brief explanation of why this applies to this specific action"
   }
5. Return ONLY the JSON array. If nothing applies, return [].`;

    try {
      const response = await this.callAI(detectionPrompt);
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const detected = JSON.parse(cleaned);
      if (Array.isArray(detected)) {
        return detected;
      }
    } catch (e) {
      console.warn("AI modifier detection failed.", e);
    }
    return [];
  }

  /**
   * Calculates numeric bonus from a specific set of AI-selected rule strings.
   */
  /**
   * Calculates numeric bonus from AI-detected structured modifiers.
   * Resolves formulas and variables using the system's math engine.
   */
  private calculateBonusFromAI(detected: DetectedModifier[], username?: string): { total: number, breakdown: string } {
    const files = this.fs.getAll();
    let totalBonus = 0;
    const breakdownParts: string[] = [];
    const resolvedVarsInFormulas = new Set<string>();

    const charFile = username ? this.fs.list().find(f => f.toLowerCase().includes(username.toLowerCase()) && f.endsWith('.txt')) : undefined;

    // Sort to process formulas (which define base stats) before modifiers that might add to them
    const sorted = [...detected].sort((a, b) => {
      const aIsFormula = a.math.includes('base') || a.math.includes('+') || a.math.includes('%');
      const bIsFormula = b.math.includes('base') || b.math.includes('+') || b.math.includes('%');
      if (aIsFormula && !bIsFormula) return -1;
      if (!aIsFormula && bIsFormula) return 1;
      return 0;
    });

    for (const mod of sorted) {
      const rhs = mod.math.trim();

      // Determine if it's a complex formula (system math required)
      const isFormula = rhs.includes('base') || (rhs.split('+').length > 1);

      if (isFormula) {
        const preferredFiles = [mod.origin_file, charFile].filter((f): f is string => !!f);
        const formulaBonus = this.executeMath(rhs, files, preferredFiles);
        if (formulaBonus !== 0) {
          totalBonus += formulaBonus;
          breakdownParts.push(`${mod.label}: ${formulaBonus > 0 ? '+' : ''}${formulaBonus}`);
        }

        // Track variables consumed by this formula to avoid double counting
        const parts = rhs.split('+').map(p => p.trim().toLowerCase());
        for (const p of parts) {
          if (/^\w+$/.test(p) && p !== 'base') resolvedVarsInFormulas.add(p);
        }
      } else {
        // Simple value or variable
        const vLower = rhs.toLowerCase();
        if (resolvedVarsInFormulas.has(vLower)) continue;

        const val = this.parseValue(rhs);
        if (val !== 0) {
          totalBonus += val;
          breakdownParts.push(`${mod.label}: ${val > 0 ? '+' : ''}${val}`);
        } else if (/^\w+$/.test(rhs)) {
          // Might be a variable reference
          const resolved = this.resolveVariable(rhs, files, [mod.origin_file, charFile].filter((f): f is string => !!f));
          if (resolved !== 0) {
            totalBonus += resolved;
            breakdownParts.push(`${mod.label}: ${resolved > 0 ? '+' : ''}${resolved}`);
          }
        }
      }
    }

    return { total: totalBonus, breakdown: breakdownParts.join(' + ').replace(/\+ -/g, '- ') };
  }

  /**
   * Wrapper for parseFormula that works directly on the RHS/Math portion
   */
  private executeMath(mathExpr: string, allFiles: { [name: string]: string }, preferredFiles?: string[]): number {
    // parseFormula expects "Key: formula", so we give it a dummy key
    return this.parseFormula(`eval: ${mathExpr}`, allFiles, preferredFiles);
  }


  /**
   * Helper to check if a username belongs to a player (has a character file)
   */
  private isKnownPlayer(username: string): boolean {
    return this.fs.list().some(f => f.toLowerCase().includes(username.toLowerCase()) && f.endsWith('.txt'));
  }

  /**
   * Parses complex formulae like "base + 15%(1000) + bonus_var"
   */
  private parseFormula(formulaLine: string, allFiles: { [name: string]: string }, preferredFiles?: string[]): number {
    const rhs = formulaLine.split(/[:=]/)[1] || '';
    // Split by '+' but IGNORE '+' inside brackets/parentheses for now
    const parts = rhs.split(/\+(?![^\[]*\])/).map(p => p.trim());
    let bonus = 0;

    for (const part of parts) {
      if (part.toLowerCase().includes('base')) continue;

      // Handle percentage of 1000: "15%(1000)" or just "15%"
      const pctMatch = part.match(/([+-]?\d+)\s*%\s*(\(\s*1000\s*\))?/);
      if (pctMatch) {
        bonus += (parseInt(pctMatch[1]) / 100) * 1000;
        continue;
      }

      // Handle raw numbers (including negative)
      if (/^[+-]?\s*\d+$/.test(part)) {
        bonus += parseInt(part.replace(/\s+/g, ''));
        continue;
      }

      // Handle Bracketed Status/Effect bonuses: [Status:NAME: +X]
      const bracketMatch = part.match(/\[(?:Status|Condition|Effect):.*?[:=]\s*([+-]?\s*\d+.*?)\]/i);
      if (bracketMatch) {
        bonus += this.parseValue(bracketMatch[1]);
        continue;
      }

      // Handle variable references (e.g., "suit_mobility_bonus" or "armor bonus")
      // Allow spaces and underscores
      if (/^[\w\s]+$/.test(part)) {
        const cleanVar = part.trim();
        if (cleanVar === 'effects') continue; // skip placeholder
        bonus += this.resolveVariable(cleanVar, allFiles, preferredFiles);
      }
    }

    return bonus;
  }

  /**
   * Searches files for a variable definition like "suit_mobility_bonus: 50"
   * Prioritizes preferred files if provided (Multiplayer support).
   */
  private resolveVariable(varName: string, allFiles: { [name: string]: string }, preferredFiles?: string[]): number {
    const vLower = varName.toLowerCase();

    // 1. Check preferred files first (e.g. Origin of formula or Actor character file)
    if (preferredFiles) {
      for (const f of preferredFiles) {
        const content = allFiles[f];
        if (content) {
          const val = this.findVarInContent(vLower, content);
          if (val !== null) return val;
        }
      }
    }

    // 2. Fallback to global search
    for (const content of Object.values(allFiles)) {
      const val = this.findVarInContent(vLower, content);
      if (val !== null) return val;
    }
    return 0;
  }

  private findVarInContent(varName: string, content: string): number | null {
    const lines = content.split('\n');
    for (const line of lines) {
      const lLower = line.toLowerCase();
      const varMatch = lLower.match(/^(?:[\s\-*>]|\d+\.)*\s*(\w+)\s*[:=]\s*(.*)$/);
      if (varMatch && varMatch[1] === varName) {
        return this.parseValue(varMatch[2]);
      }
    }
    return null;
  }

  /**
   * Converts strings like "+5%", "10", "-15%(1000)" to numeric bonuses on a 0-1000 scale.
   */
  private parseValue(valStr: string): number {
    const clean = valStr.replace(/\s+/g, '').toLowerCase();

    // Ignore time-based values (+10s, 30sec, 1m) to prevent leaks into math engine
    if (clean.match(/[+-]?\d+(s|sec|seconds|m|min|minutes|h|hr|hours)$/)) {
      return 0;
    }

    if (clean.includes('%')) {
      const numMatch = clean.match(/([+-]?\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        // Whether it's "15%" or "15%(1000)", it's the same math in our engine
        return (num / 100) * 1000;
      }
    }
    return parseInt(clean) || 0;
  }
  private async callAI(prompt: string, mapScreenshot?: string, modelName?: string): Promise<string> {
    try {
      let contents: any;
      if (mapScreenshot) {
        contents = [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: mapScreenshot
                }
              }
            ]
          }
        ];
      } else {
        contents = [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ];
      }

      const response = await this.ai.models.generateContent({
        model: modelName || 'gemini-3.5-flash-lite',
        contents: contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          temperature: 0.7,
        }
      });

      return response.text || "{}";
    } catch (e) {
      console.error("Gemini API Call Failed", e);
      throw e;
    }
  }
}
