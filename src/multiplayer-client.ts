// KNOT — Multiplayer client (PHẦN 9).
// Kết nối WebSocket đến server cùng origin, tạo/tham gia phòng (tối đa 4 người),
// gửi input điều khiển và vẽ các người chơi khác trên canvas.
// Không lưu secret; token dùng "dev" cho chế độ local, production dùng session cookie qua HTTP.

export interface RemotePlayer {
  id: string;
  username: string;
  displayName: string;
  x: number;
  y: number;
  facing: number;
  status: "ready" | "playing" | "dead" | "finished" | "disconnected";
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private roomId: string | null = null;
  private clientId: string | null = null;
  private username: string;
  private remotePlayers = new Map<string, RemotePlayer>();
  private onStateChange: ((players: RemotePlayer[]) => void) | null = null;
  private onJoined: ((roomId: string, clientId: string) => void) | null = null;
  private onMapChange: ((mapId: string) => void) | null = null;
  private onGameStart: ((mapId: string) => void) | null = null;
  private onError: ((message: string) => void) | null = null;

  constructor(username = "Người chơi") {
    this.username = username;
  }

  connect(roomId: string | null, create: boolean): void {
    if (this.ws) this.ws.close();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      if (create) {
        this.ws?.send(
          JSON.stringify({ type: "auth_create", payload: { username: this.username, displayName: this.username } })
        );
      } else if (roomId) {
        this.ws?.send(
          JSON.stringify({ type: "auth_join", payload: { username: this.username, displayName: this.username, roomId } })
        );
      }
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // Bỏ qua tin nhắn không phải JSON.
      }
    });

    this.ws.addEventListener("close", () => {
      this.ws = null;
      this.remotePlayers.clear();
      this.onStateChange?.([]);
    });

    this.ws.addEventListener("error", () => {
      this.onError?.("Không kết nối được máy chủ multiplayer.");
    });
  }

  private handleMessage(msg: { type: string; payload: unknown }): void {
    switch (msg.type) {
      case "auth_ok": {
        const p = (msg.payload as any) ?? {};
        this.roomId = p.roomId ?? null;
        this.clientId = p.clientId ?? null;
        if (p.room && Array.isArray(p.room.players)) {
          for (const pl of p.room.players) {
            if (pl.id !== this.clientId) {
              this.remotePlayers.set(pl.id, {
                id: pl.id,
                username: pl.username,
                displayName: pl.displayName,
                x: pl.x,
                y: pl.y,
                facing: pl.facing,
                status: pl.status,
              });
            }
          }
        }
        this.onJoined?.(this.roomId!, this.clientId!);
        this.onStateChange?.([...this.remotePlayers.values()]);
        break;
      }
      case "state": {
        const s = (msg.payload as any) ?? {};
        if (Array.isArray(s.players)) {
          for (const pl of s.players) {
            if (pl.id !== this.clientId) {
              this.remotePlayers.set(pl.id, {
                id: pl.id,
                username: pl.username,
                displayName: pl.displayName,
                x: pl.x,
                y: pl.y,
                facing: pl.facing,
                status: pl.status,
              });
            }
          }
          // Xóa người chơi không còn trong state.
          for (const id of this.remotePlayers.keys()) {
            if (!s.players.some((p: any) => p.id === id)) {
              this.remotePlayers.delete(id);
            }
          }
        }
        this.onStateChange?.([...this.remotePlayers.values()]);
        break;
      }
      case "player_joined": {
        const pl = (msg.payload as any) ?? {};
        if (pl.player) {
          this.remotePlayers.set(pl.player.id, {
            id: pl.player.id,
            username: pl.player.username,
            displayName: pl.player.displayName,
            x: pl.player.x,
            y: pl.player.y,
            facing: pl.player.facing,
            status: pl.player.status,
          });
        }
        this.onStateChange?.([...this.remotePlayers.values()]);
        break;
      }
      case "player_left": {
        this.remotePlayers.delete((msg.payload as any)?.clientId);
        this.onStateChange?.([...this.remotePlayers.values()]);
        break;
      }
      case "error": {
        const p = (msg.payload as any) ?? {};
        this.onError?.(p.message || p.code || "Lỗi multiplayer không xác định.");
        break;
      }
      case "game_started": {
        const p = (msg.payload as any) ?? {};
        if (typeof p.mapId === "string") this.onGameStart?.(p.mapId);
        break;
      }
      case "map_changed": {
        const p = (msg.payload as any) ?? {};
        if (typeof p.mapId === "string") this.onMapChange?.(p.mapId);
        break;
      }
      case "player_state": {
        const p = (msg.payload as any) ?? {};
        if (p.id && p.id !== this.clientId) {
          const existing = this.remotePlayers.get(p.id);
          if (existing) {
            existing.status = p.status ?? existing.status;
            this.remotePlayers.set(p.id, existing);
            this.onStateChange?.([...this.remotePlayers.values()]);
          }
        }
        break;
      }
    }
  }

  /** Gửi điều khiển lên server (gọi mỗi frame khi đang chơi). */
  sendInput(left: boolean, right: boolean, jump: boolean, bomb: boolean, seq: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "input", payload: { seq, left, right, jump, bomb } }));
    }
  }

  sendSetMap(mapId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "set_map", payload: { mapId } }));
    }
  }

  sendStartGame(mapId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "start_game", payload: { mapId } }));
    }
  }

  getPlayers(): RemotePlayer[] {
    return [...this.remotePlayers.values()];
  }

  getRoomId(): string | null {
    return this.roomId;
  }

  getClientId(): string | null {
    return this.clientId;
  }

  onState(callback: (players: RemotePlayer[]) => void): void {
    this.onStateChange = callback;
  }

  onJoinedRoom(callback: (roomId: string, clientId: string) => void): void {
    this.onJoined = callback;
  }

  onErrorMessage(callback: (message: string) => void): void {
    this.onError = callback;
  }

  onMapChanged(callback: (mapId: string) => void): void {
    this.onMapChange = callback;
  }

  onGameStarted(callback: (mapId: string) => void): void {
    this.onGameStart = callback;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.remotePlayers.clear();
    this.roomId = null;
    this.clientId = null;
  }
}
