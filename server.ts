import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ClientMessageSchema,
  type LobbyPlayerSlot,
  type RoomSnapshot,
  type ServerMessage,
} from './src/game/protocol';
import {
  applyAction,
  createInitialGameState,
  getPrivatePlayerState,
  sanitizeStateForPublic,
} from './src/game/rules';
import { chooseBotAction } from './src/game/aiBot';
import type { BoardPreset, FactionColor, GameState } from './src/game/types';

const PORT = Number(process.env.PORT ?? 3000);
const ALL_COLORS: FactionColor[] = ['crimson', 'navy', 'forest', 'ivory'];
const BOT_NAMES = ['Capt. Thorne', 'Lady Maris', 'Guildmaster Bram', 'Admiral Sera'];

interface ClientMeta {
  ws: WebSocket;
  roomId: string | null;
  playerId: string | null;
  isHost: boolean;
}

interface RoomRecord {
  roomId: string;
  mode: 'tv_host' | 'quick_play';
  preset: BoardPreset;
  victoryTarget: number;
  status: 'lobby' | 'playing' | 'finished';
  lobbyPlayers: LobbyPlayerSlot[];
  playerTokens: Map<string, string>; // sessionToken -> playerId
  game: GameState | null;
  activePlacementHighlight: RoomSnapshot['activePlacementHighlight'];
  clients: Set<ClientMeta>;
  botTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, RoomRecord>();

function generateRoomPin(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 40; attempt++) {
    let pin = '';
    for (let i = 0; i < 4; i++) {
      pin += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(pin)) return pin;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

function sendJson(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function makeRoomSnapshot(room: RoomRecord): RoomSnapshot {
  return {
    roomId: room.roomId,
    mode: room.mode,
    preset: room.preset,
    victoryTarget: room.victoryTarget,
    status: room.status,
    lobbyPlayers: room.lobbyPlayers,
    game: room.game ? sanitizeStateForPublic(room.game) : null,
    activePlacementHighlight: room.activePlacementHighlight,
  };
}

function broadcastRoom(room: RoomRecord) {
  const snapshot = makeRoomSnapshot(room);
  const publicMsg: ServerMessage = { type: 'ROOM_STATE', room: snapshot };

  for (const client of room.clients) {
    sendJson(client.ws, publicMsg);
    if (room.game && client.playerId) {
      const priv = getPrivatePlayerState(room.game, client.playerId);
      if (priv) {
        sendJson(client.ws, { type: 'PRIVATE_STATE', privateState: priv });
      }
    }
  }
}

function scheduleBotStep(room: RoomRecord) {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  if (!room.game || room.game.phase === 'finished') return;

  const game = room.game;
  let actingBotId: string | null = null;

  if (game.phase === 'discard') {
    actingBotId =
      game.pendingDiscardPlayerIds.find(
        (id) => game.players.find((p) => p.id === id)?.isBot,
      ) ?? null;
  } else {
    const active = game.players[game.activePlayerIndex];
    if (active?.isBot) {
      actingBotId = active.id;
    }
  }

  if (!actingBotId) return;

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!room.game || room.game.phase === 'finished') return;
    const action = chooseBotAction(room.game, actingBotId!);
    if (!action) return;
    const result = applyAction(room.game, action);
    if (result.ok) {
      room.game = result.state;
      if (room.game.phase === 'finished') {
        room.status = 'finished';
      }
      room.activePlacementHighlight = null;
      broadcastRoom(room);
      scheduleBotStep(room);
    }
  }, 550);
}

function pickAvailableColor(
  taken: FactionColor[],
  preferred?: FactionColor,
): FactionColor | null {
  if (preferred && !taken.includes(preferred)) return preferred;
  return ALL_COLORS.find((c) => !taken.includes(c)) ?? null;
}

function detachClientFromRoom(meta: ClientMeta) {
  if (!meta.roomId) return;
  const room = rooms.get(meta.roomId);
  if (!room) return;
  room.clients.delete(meta);

  if (meta.playerId) {
    const stillConnected = Array.from(room.clients).some(
      (c) => c.playerId === meta.playerId,
    );
    if (!stillConnected) {
      const lp = room.lobbyPlayers.find((p) => p.id === meta.playerId);
      if (lp) lp.connected = false;
      const gp = room.game?.players.find((p) => p.id === meta.playerId);
      if (gp) gp.connected = false;
      broadcastRoom(room);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const meta: ClientMeta = { ws, roomId: null, playerId: null, isHost: false };

    ws.on('message', (raw) => {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw.toString());
      } catch {
        sendJson(ws, { type: 'ACTION_ERROR', message: 'Invalid JSON payload.' });
        return;
      }

      const parsed = ClientMessageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        sendJson(ws, { type: 'ACTION_ERROR', message: 'Malformed request.' });
        return;
      }

      const msg = parsed.data;

      if (msg.type === 'CREATE_ROOM') {
        detachClientFromRoom(meta);
        const roomId = generateRoomPin();
        const preset: BoardPreset = msg.preset ?? 'random_balanced';
        const victoryTarget = msg.victoryTarget ?? 10;

        const room: RoomRecord = {
          roomId,
          mode: msg.mode,
          preset,
          victoryTarget,
          status: 'lobby',
          lobbyPlayers: [],
          playerTokens: new Map(),
          game: null,
          activePlacementHighlight: null,
          clients: new Set([meta]),
          botTimer: null,
        };

        meta.roomId = roomId;
        meta.isHost = true;

        if (msg.mode === 'quick_play') {
          const hostPlayerId = `p_${crypto.randomBytes(4).toString('hex')}`;
          const token = crypto.randomBytes(8).toString('hex');
          const hostColor = msg.hostColor ?? 'crimson';

          room.lobbyPlayers.push({
            id: hostPlayerId,
            name: msg.hostName || 'Commander',
            color: hostColor,
            isBot: false,
            connected: true,
          });
          room.playerTokens.set(token, hostPlayerId);
          meta.playerId = hostPlayerId;

          const botCount = msg.botCount ?? 3;
          for (let i = 0; i < botCount; i++) {
            const c = pickAvailableColor(room.lobbyPlayers.map((p) => p.color));
            if (!c) break;
            room.lobbyPlayers.push({
              id: `bot_${i + 1}`,
              name: BOT_NAMES[i % BOT_NAMES.length],
              color: c,
              isBot: true,
              connected: true,
            });
          }

          room.status = 'playing';
          room.game = createInitialGameState({
            roomId,
            preset,
            victoryTarget,
            players: room.lobbyPlayers,
          });

          rooms.set(roomId, room);
          sendJson(ws, {
            type: 'SESSION_ASSIGNED',
            roomId,
            playerId: hostPlayerId,
            sessionToken: token,
            isHost: true,
          });
          broadcastRoom(room);
          scheduleBotStep(room);
          return;
        }

        // TV Host Lobby mode: waits for phone controllers (or optional bots)
        meta.playerId = null;
        rooms.set(roomId, room);
        sendJson(ws, {
          type: 'SESSION_ASSIGNED',
          roomId,
          playerId: null,
          sessionToken: null,
          isHost: true,
        });
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'WATCH_ROOM') {
        const roomId = msg.roomId.toUpperCase();
        const room = rooms.get(roomId);
        if (!room) {
          sendJson(ws, { type: 'ACTION_ERROR', message: `Room ${roomId} not found.` });
          return;
        }
        detachClientFromRoom(meta);
        meta.roomId = roomId;
        meta.isHost = true;
        meta.playerId = null;
        room.clients.add(meta);
        sendJson(ws, {
          type: 'SESSION_ASSIGNED',
          roomId,
          playerId: null,
          sessionToken: null,
          isHost: true,
        });
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'JOIN_ROOM') {
        const roomId = msg.roomId.toUpperCase();
        const room = rooms.get(roomId);
        if (!room) {
          sendJson(ws, { type: 'ACTION_ERROR', message: `Room ${roomId} not found.` });
          return;
        }

        // Check reconnect token first
        if (msg.sessionToken && room.playerTokens.has(msg.sessionToken)) {
          const existingId = room.playerTokens.get(msg.sessionToken)!;
          detachClientFromRoom(meta);
          meta.roomId = roomId;
          meta.playerId = existingId;
          meta.isHost = false;
          room.clients.add(meta);

          const lp = room.lobbyPlayers.find((p) => p.id === existingId);
          if (lp) lp.connected = true;
          const gp = room.game?.players.find((p) => p.id === existingId);
          if (gp) gp.connected = true;

          sendJson(ws, {
            type: 'SESSION_ASSIGNED',
            roomId,
            playerId: existingId,
            sessionToken: msg.sessionToken,
            isHost: false,
          });
          broadcastRoom(room);
          return;
        }

        if (room.status !== 'lobby') {
          sendJson(ws, {
            type: 'ACTION_ERROR',
            message: 'Match already in progress. Use the same device to reconnect.',
          });
          return;
        }

        if (room.lobbyPlayers.length >= 4) {
          sendJson(ws, { type: 'ACTION_ERROR', message: 'Table is full (4 players max).' });
          return;
        }

        const chosenColor = pickAvailableColor(
          room.lobbyPlayers.map((p) => p.color),
          msg.color,
        );
        if (!chosenColor) {
          sendJson(ws, { type: 'ACTION_ERROR', message: 'No faction colors available.' });
          return;
        }

        const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
        const token = crypto.randomBytes(8).toString('hex');

        detachClientFromRoom(meta);
        meta.roomId = roomId;
        meta.playerId = playerId;
        meta.isHost = false;
        room.clients.add(meta);

        room.lobbyPlayers.push({
          id: playerId,
          name: msg.name,
          color: chosenColor,
          isBot: false,
          connected: true,
        });
        room.playerTokens.set(token, playerId);

        sendJson(ws, {
          type: 'SESSION_ASSIGNED',
          roomId,
          playerId,
          sessionToken: token,
          isHost: false,
        });
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'RECONNECT_SESSION') {
        const roomId = msg.roomId.toUpperCase();
        const room = rooms.get(roomId);
        if (!room) {
          sendJson(ws, { type: 'ACTION_ERROR', message: 'Room expired.' });
          return;
        }
        const playerId = room.playerTokens.get(msg.sessionToken);
        if (!playerId) {
          sendJson(ws, { type: 'ACTION_ERROR', message: 'Session not found in room.' });
          return;
        }
        detachClientFromRoom(meta);
        meta.roomId = roomId;
        meta.playerId = playerId;
        meta.isHost = false;
        room.clients.add(meta);

        const lp = room.lobbyPlayers.find((p) => p.id === playerId);
        if (lp) lp.connected = true;
        const gp = room.game?.players.find((p) => p.id === playerId);
        if (gp) gp.connected = true;

        sendJson(ws, {
          type: 'SESSION_ASSIGNED',
          roomId,
          playerId,
          sessionToken: msg.sessionToken,
          isHost: false,
        });
        broadcastRoom(room);
        return;
      }

      const room = rooms.get(msg.roomId.toUpperCase());
      if (!room) {
        sendJson(ws, { type: 'ACTION_ERROR', message: 'Room not found.' });
        return;
      }

      if (msg.type === 'UPDATE_ROOM_SETTINGS') {
        if (room.status !== 'lobby') return;
        if (msg.preset) room.preset = msg.preset;
        if (msg.victoryTarget) room.victoryTarget = msg.victoryTarget;
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'ADD_BOT') {
        if (room.status !== 'lobby' || room.lobbyPlayers.length >= 4) return;
        const c = pickAvailableColor(room.lobbyPlayers.map((p) => p.color));
        if (!c) return;
        const botIdx = room.lobbyPlayers.filter((p) => p.isBot).length;
        room.lobbyPlayers.push({
          id: `bot_${Date.now()}_${botIdx}`,
          name: BOT_NAMES[botIdx % BOT_NAMES.length],
          color: c,
          isBot: true,
          connected: true,
        });
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'REMOVE_PLAYER') {
        if (room.status !== 'lobby') return;
        room.lobbyPlayers = room.lobbyPlayers.filter((p) => p.id !== msg.playerId);
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'START_GAME') {
        if (room.status !== 'lobby') return;
        if (room.lobbyPlayers.length < 2) {
          sendJson(ws, {
            type: 'ACTION_ERROR',
            message: 'Need at least 2 players (or bots) to begin.',
          });
          return;
        }
        room.status = 'playing';
        room.game = createInitialGameState({
          roomId: room.roomId,
          preset: room.preset,
          victoryTarget: room.victoryTarget,
          players: room.lobbyPlayers,
        });
        room.activePlacementHighlight = null;
        broadcastRoom(room);
        scheduleBotStep(room);
        return;
      }

      if (msg.type === 'REMATCH') {
        if (room.lobbyPlayers.length < 2) return;
        room.status = 'playing';
        room.game = createInitialGameState({
          roomId: room.roomId,
          preset: room.preset,
          victoryTarget: room.victoryTarget,
          players: room.lobbyPlayers,
        });
        room.activePlacementHighlight = null;
        broadcastRoom(room);
        scheduleBotStep(room);
        return;
      }

      if (msg.type === 'SET_PLACEMENT_HIGHLIGHT') {
        room.activePlacementHighlight = msg.kind
          ? { playerId: msg.playerId, kind: msg.kind }
          : null;
        broadcastRoom(room);
        return;
      }

      if (msg.type === 'GAME_ACTION') {
        if (!room.game) {
          sendJson(ws, { type: 'ACTION_ERROR', message: 'Game has not started yet.' });
          return;
        }

        // Enforce client identity unless local quick_play host is controlling human seat
        if (!meta.isHost && meta.playerId && msg.action.playerId !== meta.playerId) {
          sendJson(ws, { type: 'ACTION_ERROR', message: 'Unauthorized player action.' });
          return;
        }

        const result = applyAction(room.game, msg.action);
        if (!result.ok) {
          sendJson(ws, { type: 'ACTION_ERROR', message: result.error });
          return;
        }

        room.game = result.state;
        room.activePlacementHighlight = null;
        if (room.game.phase === 'finished') {
          room.status = 'finished';
        }
        broadcastRoom(room);
        scheduleBotStep(room);
      }
    });

    ws.on('close', () => {
      detachClientFromRoom(meta);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Islehold server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
