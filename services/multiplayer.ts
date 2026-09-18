/// <reference types="vite/client" />
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { FileSystem } from './fileSystem';

export class MultiplayerService {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private roomId: string | null = null;
  private currentUsername: string | null = null;
  private syncQueue: Promise<any> = Promise.resolve();

  private fileSystem: FileSystem;
  private onStateUpdate: (state: any) => void;
  private onExecuteTurn: (inputs: Record<string, string>) => void;
  private onHostCreateCharacter: (data: { username: string; description: string }) => void;
  private onKicked: () => void;
  private onAdventureDeleted: () => void;

  constructor(
    fileSystem: FileSystem,
    onStateUpdate: (state: any) => void,
    onExecuteTurn: (inputs: Record<string, string>) => void,
    onHostCreateCharacter: (data: { username: string; description: string }) => void,
    onKicked: () => void,
    onAdventureDeleted: () => void
  ) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase credentials in Vite env");
    }
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);

    this.fileSystem = fileSystem;
    this.onStateUpdate = onStateUpdate;
    this.onExecuteTurn = onExecuteTurn;
    this.onHostCreateCharacter = onHostCreateCharacter;
    this.onKicked = onKicked;
    this.onAdventureDeleted = onAdventureDeleted;
  }

  private generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createRoom(username: string): Promise<string> {
    const roomId = this.generateRoomCode();
    this.roomId = roomId;
    this.currentUsername = username;

    const initialState = {
      id: roomId,
      hostUsername: username,
      players: [{ username, status: 'active', isReady: false, hasCharacter: false }],
      gameState: 'waiting_for_world',
      fileSystemState: { files: {}, metadata: {} },
      narrative: [],
      updates: [],
      pendingInputs: {},
      worldTime: ''
    };

    const { error } = await this.supabase
      .from('rooms')
      .insert({ id: roomId, host_username: username, state: initialState });

    if (error) {
      console.error("Failed to create room in DB", error);
      throw new Error("Unable to contact database");
    }

    await this.setupChannel(roomId, username, true);
    this.onStateUpdate(initialState);
    return roomId;
  }

  async joinRoom(roomId: string, username: string): Promise<any> {
    const { data: room, error } = await this.supabase
      .from('rooms')
      .select('state')
      .eq('id', roomId)
      .single();

    if (error || !room) {
      throw new Error('Room not found');
    }

    const state = room.state;
    this.roomId = roomId;
    this.currentUsername = username;

    await this.setupChannel(roomId, username, false);
    if (state.fileSystemState) {
      this.fileSystem.importState(state.fileSystemState);
    }
    return state;
  }

  private async setupChannel(roomId: string, username: string, isHost: boolean) {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
    }

    this.channel = this.supabase.channel(`room:${roomId}`, {
      config: {
        presence: { key: username }
      }
    });

    this.channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        const newState = payload.new.state;

        // Non-host players sync files strictly from DB updates
        if (this.currentUsername !== newState.hostUsername && newState.fileSystemState) {
          this.fileSystem.importState(newState.fileSystemState);
        }

        this.onStateUpdate(newState);
      })
      .on('broadcast', { event: 'submit_action' }, (payload: any) => {
        if (this.currentUsername === payload.payload.host) {
          this.handlePlayerActionAsHost(payload.payload.username, payload.payload.action);
        }
      })
      .on('broadcast', { event: 'execute_turn' }, (payload: any) => {
        if (this.currentUsername === payload.payload.host) {
          this.onExecuteTurn(payload.payload.inputs);
        }
      })
      .on('broadcast', { event: 'create_character' }, (payload: any) => {
        if (this.currentUsername === payload.payload.host) {
          this.onHostCreateCharacter({ username: payload.payload.username, description: payload.payload.description });
        }
      })
      .on('broadcast', { event: 'kick_player' }, (payload: any) => {
        if (this.currentUsername === payload.payload.username) {
          this.leaveRoom();
          this.onKicked();
        }
      })
      .on('broadcast', { event: 'adventure_deleted' }, () => {
        this.leaveRoom();
        this.onAdventureDeleted();
      });

    this.channel.on('presence', { event: 'sync' }, () => {
      const presenceState = this.channel?.presenceState() || {};
      const activeUsernames = Object.keys(presenceState);

      if (this.currentUsername) {
        this.syncQueue = this.syncQueue.then(async () => {
          const { data } = await this.supabase.from('rooms').select('state, host_username').eq('id', roomId).single();
          if (data && data.host_username === this.currentUsername) {
            const state = data.state;
            let changed = false;

            state.players.forEach((p: any) => {
              const isActive = activeUsernames.some(u => u.toLowerCase() === p.username.toLowerCase());
              if (p.status !== (isActive ? 'active' : 'inactive')) {
                p.status = isActive ? 'active' : 'inactive';
                changed = true;
              }
            });

            activeUsernames.forEach((u: string) => {
              if (!state.players.find((p: any) => p.username.toLowerCase() === u.toLowerCase())) {
                state.players.push({ username: u, status: 'active', isReady: false, hasCharacter: false });
                changed = true;
              }
            });

            if (changed) {
              await this.supabase.from('rooms').update({ state }).eq('id', roomId);
              this.checkTurnForHost(state);
            }
          }
        });
      }
    });

    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.channel?.track({ user: username, online_at: new Date().toISOString() });
      }
    });
  }

  async leaveRoom() {
    if (this.channel) {
      await this.channel.untrack();
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.roomId = null;
    this.currentUsername = null;
  }

  async submitAction(action: string) {
    if (!this.roomId || !this.channel) return;

    const { data } = await this.supabase.from('rooms').select('host_username').eq('id', this.roomId).single();
    if (data) {
      if (this.currentUsername === data.host_username) {
        this.handlePlayerActionAsHost(this.currentUsername, action);
      } else {
        this.channel.send({
          type: 'broadcast',
          event: 'submit_action',
          payload: { username: this.currentUsername, action, host: data.host_username }
        });
      }
    }
  }

  private async handlePlayerActionAsHost(username: string, action: string) {
    if (!this.roomId) return;
    this.syncQueue = this.syncQueue.then(async () => {
      const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
      if (data) {
        const state = data.state;
        state.pendingInputs[username] = action;
        const player = state.players.find((p: any) => p.username.toLowerCase() === username.toLowerCase());
        if (player) player.isReady = true;

        await this.supabase.from('rooms').update({ state }).eq('id', this.roomId);
        this.checkTurnForHost(state);
      }
    });
  }

  private checkTurnForHost(state: any) {
    if (state.gameState === 'character_creation') {
      const activePlayers = state.players.filter((p: any) => p.status === 'active');
      const allHaveCharacters = activePlayers.length > 0 && activePlayers.every((p: any) => p.hasCharacter);

      if (allHaveCharacters) {
        state.gameState = 'playing';
        this.supabase.from('rooms').update({ state }).eq('id', this.roomId).then(() => {});
      }
      return;
    }

    if (state.gameState !== 'playing') return;
    const activePlayers = state.players.filter((p: any) => p.status === 'active' && p.hasCharacter);
    if (activePlayers.length > 0 && activePlayers.every((p: any) => p.isReady)) {
      this.onExecuteTurn(state.pendingInputs);

      this.channel?.send({
        type: 'broadcast',
        event: 'execute_turn',
        payload: { host: this.currentUsername, inputs: state.pendingInputs }
      });
    }
  }

  async createCharacter(description: string) {
    if (!this.roomId || !this.channel) return;
    const { data } = await this.supabase.from('rooms').select('host_username').eq('id', this.roomId).single();
    if (data && this.currentUsername) {
      if (this.currentUsername === data.host_username) {
        this.onHostCreateCharacter({ username: this.currentUsername, description });
      } else {
        this.channel.send({
          type: 'broadcast',
          event: 'create_character',
          payload: { username: this.currentUsername, description, host: data.host_username }
        });
      }
    }
  }

  /**
   * Extracts the active time string safely regardless of whether WorldTime.txt
   * is using the legacy flat format or the temporal displacement schema.
   */
  private parseActiveWorldTime(files: Record<string, string>): string {
    const rawTime = files['WorldTime.txt'];
    if (!rawTime) return '';

    // Temporal Displacement Schema: extract timestamp under [CURRENT ACTIVE TIME]
    const activeBlockMatch = rawTime.match(/\[CURRENT ACTIVE TIME\][\s\S]*?Timestamp:\s*([^\n\r]+)/i);
    if (activeBlockMatch && activeBlockMatch[1]) {
      return activeBlockMatch[1].trim();
    }

    // Fallback: match standard timestamp string pattern
    const fallbackMatch = rawTime.match(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*-\s*[A-Za-z]+\s+\d{1,2},\s*\d{4}/i);
    if (fallbackMatch) {
      return fallbackMatch[0].trim();
    }

    return rawTime.trim().split('\n')[0] || '';
  }

  async syncState(partialState: any) {
    return new Promise<void>((resolve) => {
      this.syncQueue = this.syncQueue.then(async () => {
        if (!this.roomId) return resolve();

        const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
        if (!data) return resolve();

        const state = { ...data.state, ...partialState };

        // Guarantee fileSystemState matches current filesystem exports if not explicitly passed
        if (!partialState.fileSystemState) {
          state.fileSystemState = this.fileSystem.exportState();
        }

        // Synchronize dynamic active world time into global state
        if (state.fileSystemState?.files) {
          const activeTime = this.parseActiveWorldTime(state.fileSystemState.files);
          if (activeTime) {
            state.worldTime = activeTime;
          }
        }

        // Update hasCharacter based on exact naming convention format: CharacterName-USERNAME.txt
        if (state.players && state.fileSystemState?.files) {
          const fileKeys = Object.keys(state.fileSystemState.files);
          state.players.forEach((p: any) => {
            const uLower = p.username.toLowerCase();
            p.hasCharacter = fileKeys.some(f => {
              const lowerF = f.toLowerCase();
              return (
                lowerF.endsWith(`-${uLower}.txt`) ||
                lowerF.endsWith(`_${uLower}.txt`) ||
                lowerF.endsWith(` ${uLower}.txt`)
              );
            });
          });
        }

        if (state.turnProcessed) {
          if (state.players) state.players.forEach((p: any) => (p.isReady = false));
          state.pendingInputs = {};
          state.turnProcessed = false;
        }

        if (state.gameState === 'character_creation' && state.players) {
          const activePlayers = state.players.filter((p: any) => p.status === 'active');
          const allHaveCharacters = activePlayers.length > 0 && activePlayers.every((p: any) => p.hasCharacter);
          if (allHaveCharacters) {
            state.gameState = 'playing';
          }
        }

        await this.supabase.from('rooms').update({ state }).eq('id', this.roomId);
        this.checkTurnForHost(state);
        resolve();
      });
    });
  }

  async forceTurn() {
    if (!this.roomId) return;
    const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
    if (data && this.channel) {
      this.onExecuteTurn(data.state.pendingInputs);

      this.channel.send({
        type: 'broadcast',
        event: 'execute_turn',
        payload: { host: this.currentUsername, inputs: data.state.pendingInputs }
      });
    }
  }

  kickPlayer(username: string) {
    this.channel?.send({
      type: 'broadcast',
      event: 'kick_player',
      payload: { username }
    });
  }

  async deleteAdventure() {
    if (!this.roomId) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'adventure_deleted'
    });
    await this.supabase.from('rooms').delete().eq('id', this.roomId);
    this.leaveRoom();
  }
}
