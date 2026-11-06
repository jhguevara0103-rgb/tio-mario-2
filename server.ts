import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const portArgIndex = process.argv.indexOf('--port');
const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? Number(process.argv[portArgIndex + 1]) : null;
const hostArgIndex = process.argv.indexOf('--host');
const cliHost = hostArgIndex !== -1 && process.argv[hostArgIndex + 1] ? process.argv[hostArgIndex + 1] : null;

const PORT = cliPort || Number(process.env.PORT || 3000);
const HOST = cliHost || process.env.HOST || '0.0.0.0';
const ROOT = process.cwd();
const STATE_FILE = path.resolve(process.env.LUDITO_STATE_FILE || path.join(ROOT, '.ludito-state.json'));
const ADMIN_PASSWORD = process.env.LUDITO_ADMIN_PASSWORD || 'tiomario#2026Admin$*';
const COLORS = new Set(['Morado', 'Amarillo', 'Celeste', 'Rojo', 'Verde', 'Naranja']);

interface User {
  name: string;
  role: 'client' | 'host';
  lastActive?: number;
}

interface OrderItem {
  color: string;
  quantity: number;
}

interface LuditoEvent {
  id: string;
  type: 'order' | 'round_closed' | 'round_started';
  name?: string;
  items?: OrderItem[];
  color?: string;
  quantity?: number;
  round: number;
  timestamp: string;
}

interface ChatMessage {
  id: string;
  name: string;
  color?: string;
  text: string;
  timestamp: string;
  senderId?: string;
  isRegistered?: boolean;
  role?: 'host' | 'registered' | 'guest';
}

interface VoicePreference {
  voiceURI: string;
  lang: string;
  name: string;
  volume: number;
}

interface LuditoState {
  events: LuditoEvent[];
  chat: ChatMessage[];
  voicePreference: VoicePreference | null;
  round: number;
  accepting: boolean;
  roundCapacity: number | null;
  resetTimestamp?: number;
}

export interface Participant {
  id: string;
  name: string;
  color?: string;
  pin?: string;
  deviceId?: string;
  isBlocked?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

interface BlockedRecord {
  id: string;
  identifier: string;
  name: string;
  senderId?: string;
  participantId?: string;
  deviceId?: string;
  type: 'participant' | 'guest';
  blockedAt: string;
}

const BLOCKED_FILE = path.resolve(path.join(ROOT, '.ludito-blocked.json'));
const BLOCKED_RECORDS_FILE = path.resolve(path.join(ROOT, '.ludito-blocked-records.json'));

const blockedUsers = new Set<string>();

function readBlockedRecords(): BlockedRecord[] {
  const records: BlockedRecord[] = [];
  try {
    if (fs.existsSync(BLOCKED_RECORDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(BLOCKED_RECORDS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach((r) => records.push(r));
      }
    } else if (fs.existsSync(BLOCKED_FILE)) {
      const data = JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach((item) => {
          records.push({
            id: crypto.randomUUID(),
            identifier: String(item).toLowerCase(),
            name: String(item),
            type: 'guest',
            blockedAt: new Date().toISOString(),
          });
        });
      }
    }
  } catch (err) {
    console.error('Error reading blocked records file:', err);
  }

  // Populate fast-lookup set
  blockedUsers.clear();
  records.forEach((r) => {
    if (r.identifier) blockedUsers.add(r.identifier.toLowerCase());
    if (r.name && r.name.toLowerCase() !== 'invitado') blockedUsers.add(r.name.toLowerCase());
    if (r.senderId) blockedUsers.add(r.senderId.toLowerCase());
    if (r.participantId) blockedUsers.add(r.participantId.toLowerCase());
    if (r.deviceId) blockedUsers.add(r.deviceId.toLowerCase());
  });

  return records;
}

let blockedRecords: BlockedRecord[] = readBlockedRecords();

async function persistBlockedRecords(): Promise<void> {
  try {
    await fs.promises.writeFile(BLOCKED_RECORDS_FILE, JSON.stringify(blockedRecords, null, 2), 'utf8');
    blockedUsers.clear();
    blockedRecords.forEach((r) => {
      if (r.identifier) blockedUsers.add(r.identifier.toLowerCase());
      if (r.name && r.name.toLowerCase() !== 'invitado') blockedUsers.add(r.name.toLowerCase());
      if (r.senderId) blockedUsers.add(r.senderId.toLowerCase());
      if (r.participantId) blockedUsers.add(r.participantId.toLowerCase());
      if (r.deviceId) blockedUsers.add(r.deviceId.toLowerCase());
    });
    await fs.promises.writeFile(BLOCKED_FILE, JSON.stringify(Array.from(blockedUsers), null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write blocked records file:', err);
  }
}


const PARTICIPANTS_FILE = path.resolve(process.env.LUDITO_PARTICIPANTS_FILE || path.join(ROOT, '.ludito-participants.json'));

function readParticipants(): Participant[] {
  try {
    if (fs.existsSync(PARTICIPANTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PARTICIPANTS_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('Error reading participants file:', err);
  }
  const initial: Participant[] = [
    { id: 'p-1', name: 'Invitado', pin: '0412', createdAt: '2026-10-28T05:00:00.000Z' },
    { id: 'p-2', name: 'María P.', pin: '1234', createdAt: '2026-10-28T05:00:00.000Z' },
    { id: 'p-3', name: 'Esther', pin: '5678', createdAt: '2026-10-28T05:00:00.000Z' },
  ];
  try {
    fs.writeFileSync(PARTICIPANTS_FILE, JSON.stringify(initial, null, 2), 'utf8');
  } catch (_) {}
  return initial;
}

let participantsList: Participant[] = readParticipants();

async function persistParticipants(): Promise<void> {
  try {
    await fs.promises.writeFile(PARTICIPANTS_FILE, JSON.stringify(participantsList, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write participants file:', err);
  }
}

function generateUniquePin(excludePin?: string): string {
  const existingPins = new Set(participantsList.map((p) => p.pin));
  if (excludePin) existingPins.delete(excludePin);
  for (let attempt = 0; attempt < 5000; attempt++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    if (!existingPins.has(pin)) {
      return pin;
    }
  }
  return String(Date.now()).slice(-4);
}

const SESSIONS_FILE = path.resolve(path.join(ROOT, '.ludito-sessions.json'));

function readInitialSessions(): Map<string, User> {
  const map = new Map<string, User>();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      for (const [token, user] of Object.entries(data)) {
        map.set(token, user as User);
      }
    }
  } catch (err) {
    console.error('Error reading sessions file:', err);
  }
  return map;
}

const sessions = readInitialSessions();
const listeners = new Set<Response>();

async function persistSessions() {
  try {
    const obj: Record<string, User> = {};
    for (const [token, user] of sessions.entries()) {
      obj[token] = user;
    }
    await fs.promises.writeFile(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write sessions file:', err);
  }
}

function readInitialState(): LuditoState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (Array.isArray(saved.events)) {
        return {
          events: saved.events.slice(-250),
          chat: Array.isArray(saved.chat) ? saved.chat.slice(-150) : [],
          voicePreference: saved.voicePreference || null,
          round: Number.isInteger(saved.round) && saved.round > 0 ? saved.round : 1,
          accepting: saved.accepting !== false,
          roundCapacity: typeof saved.roundCapacity === 'number' && saved.roundCapacity > 0 ? saved.roundCapacity : null,
          resetTimestamp: typeof saved.resetTimestamp === 'number' ? saved.resetTimestamp : 0,
        };
      }
    }
  } catch (err) {
    console.error('Error reading initial state:', err);
  }
  return { events: [], chat: [], voicePreference: null, round: 1, accepting: true, roundCapacity: null, resetTimestamp: 0 };
}

let state: LuditoState = readInitialState();

// ============================================================================
// CONFIGURACIÓN VISUAL MODULAR DE LA VISTA DEL CLIENTE (index.html)
// ============================================================================
const CLIENT_VIEW_FILE = path.resolve(path.join(ROOT, '.ludito-client-view.json'));

export interface PromoItem {
  id: string;
  name: string;
  type: 'banner' | 'button' | 'text';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  actionUrl?: string;
  buttonText?: string;
  bgColor?: string;
  textColor?: string;
}

export interface ClientDecoration {
  id: string;
  name: string;
  imageUrl: string;
  zone: string;
  x: number;
  y: number;
  width: number;
  height: number;
  chromaKey?: boolean;
  chromaColor?: string;
  chromaTolerance?: number;
}

export interface ClientViewConfig {
  background: {
    type: string;
    color: string;
    imageUrl: string;
  };
  videoFrame: {
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    glow: boolean;
  };
  offline: {
    videoUrl: string;
    enabled: boolean;
    headline: string;
    note: string;
    textColor: string;
    textStyle: string;
  };
  chatFrame: {
    borderColor: string;
    borderRadius: number;
    background: string;
  };
  promoSection: {
    enabled: boolean;
    items: PromoItem[];
  };
  decorations: ClientDecoration[];
}

const DEFAULT_CLIENT_VIEW_CONFIG: ClientViewConfig = {
  background: {
    type: 'preset',
    color: '#0a0e12',
    imageUrl: '',
  },
  videoFrame: {
    borderColor: '#fed100',
    borderWidth: 2,
    borderRadius: 16,
    glow: true,
  },
  offline: {
    videoUrl: '',
    enabled: false,
    headline: '¡EN BREVE INICIAMOS EL LIVE!',
    note: 'Transmisión en directo con El Tío Mario. Prepara tus jugadas.',
    textColor: '#fed100',
    textStyle: 'mario',
  },
  chatFrame: {
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    background: 'rgba(14, 20, 28, 0.9)',
  },
  promoSection: {
    enabled: true,
    items: [
      {
        id: 'promo-1',
        name: 'Premios y Promociones',
        type: 'banner',
        title: '🎉 ¡Grandes Premios en Cada Ronda!',
        subtitle: 'Sigue la transmisión en vivo y participa escribiendo tu nombre en el chat',
        bgColor: 'linear-gradient(135deg, rgba(229, 37, 33, 0.2), rgba(254, 209, 0, 0.15))',
        textColor: '#fed100',
      },
    ],
  },
  decorations: [],
};

function readClientViewConfig(): ClientViewConfig {
  try {
    if (fs.existsSync(CLIENT_VIEW_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLIENT_VIEW_FILE, 'utf8'));
      return { ...DEFAULT_CLIENT_VIEW_CONFIG, ...data };
    }
  } catch (err) {
    console.error('Error reading client view config:', err);
  }
  return DEFAULT_CLIENT_VIEW_CONFIG;
}

let clientViewConfig: ClientViewConfig = readClientViewConfig();

async function persistClientViewConfig(): Promise<void> {
  try {
    await fs.promises.writeFile(CLIENT_VIEW_FILE, JSON.stringify(clientViewConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write client view config:', err);
  }
}

const ADMIN_INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutos de inactividad
const PARTICIPANT_INACTIVITY_LIMIT_MS = 3 * 60 * 60 * 1000; // 3 horas de inactividad

function currentUser(req: Request): User | undefined {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const user = sessions.get(token);
  if (!user) return undefined;

  const now = Date.now();
  if (user.role === 'host') {
    const lastActive = user.lastActive || now;
    if (now - lastActive > ADMIN_INACTIVITY_LIMIT_MS) {
      sessions.delete(token);
      persistSessions().catch(() => {});
      return undefined;
    }
    user.lastActive = now;
  } else if (user.role === 'client') {
    const lastActive = user.lastActive || now;
    if (now - lastActive > PARTICIPANT_INACTIVITY_LIMIT_MS) {
      sessions.delete(token);
      persistSessions().catch(() => {});
      return undefined;
    }
    user.lastActive = now;
  }

  return user;
}

function matchesAdminPassword(candidate?: string): boolean {
  try {
    const expectedHash = crypto.createHash('sha256').update(ADMIN_PASSWORD, 'utf8').digest();
    const candidateHash = crypto.createHash('sha256').update(String(candidate || ''), 'utf8').digest();
    return crypto.timingSafeEqual(candidateHash, expectedHash);
  } catch {
    return false;
  }
}

async function persistAndBroadcast(): Promise<void> {
  try {
    await fs.promises.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write state file:', err);
  }
  const message = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const client of listeners) {
    try {
      client.write(message);
    } catch {
      listeners.delete(client);
    }
  }
}

function appendEvent(event: LuditoEvent): void {
  state.events.push(event);
  state.events = state.events.slice(-250);
  if (event.type === 'round_closed' && event.round === state.round) {
    state.accepting = false;
  }
  if (event.type === 'round_started' && event.round > state.round) {
    state.round = event.round;
    state.accepting = true;
  }
}

function getRoundOrderedQuantity(round: number, color: string): number {
  let total = 0;
  for (const event of state.events) {
    if (event.type === 'order' && event.round === round && Array.isArray(event.items)) {
      for (const item of event.items) {
        if (item.color === color) {
          total += item.quantity;
        }
      }
    }
  }
  return total;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '64kb' }));

  // Allow camera, microphone, and display capture permissions for OBS and streaming
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=*, microphone=*, display-capture=*');
    next();
  });

  // Live Stream WebRTC Signaling State
  let hostWs: WebSocket | null = null;
  const adminSockets = new Set<WebSocket>();
  const viewerSockets = new Map<string, WebSocket>();
  const streamState = {
    isLive: false,
    source: 'none',
    viewersCount: 0,
  };

  const wss = new WebSocketServer({ server, path: '/api/stream-ws' });

  function broadcastToViewers(payload: any) {
    const data = JSON.stringify(payload);
    for (const ws of viewerSockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  function notifyAllViewersCount() {
    streamState.viewersCount = viewerSockets.size;
    const payload = JSON.stringify({
      type: 'viewers-count',
      count: viewerSockets.size,
    });
    for (const adminWs of adminSockets) {
      if (adminWs.readyState === WebSocket.OPEN) {
        adminWs.send(payload);
      }
    }
    for (const ws of viewerSockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    let role = 'viewer';
    let currentViewerId = crypto.randomUUID();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'register-host') {
          role = 'host';
          adminSockets.add(ws);

          // Si el admin entrante está activamente transmitiendo, o todavía no hay host asignado
          if (msg.isLive) {
            hostWs = ws;
            streamState.isLive = true;
            streamState.source = msg.source || 'obs';
            broadcastToViewers({
              type: 'host-stream-status',
              isLive: streamState.isLive,
              source: streamState.source,
            });
          } else if (!hostWs || hostWs.readyState !== WebSocket.OPEN) {
            hostWs = ws;
          }

          // Enviar el estado actual al admin conectado (para que no interrumpa el live activo de otro host)
          ws.send(JSON.stringify({
            type: 'host-stream-status',
            isLive: streamState.isLive,
            source: streamState.source,
          }));
          notifyAllViewersCount();
        } else if (msg.type === 'register-viewer') {
          role = 'viewer';
          currentViewerId = msg.viewerId || currentViewerId;
          viewerSockets.set(currentViewerId, ws);
          ws.send(
            JSON.stringify({
              type: 'host-stream-status',
              isLive: streamState.isLive,
              source: streamState.source,
            }),
          );
          notifyAllViewersCount();
        } else if (msg.type === 'host-stream-started') {
          role = 'host';
          adminSockets.add(ws);
          hostWs = ws;
          streamState.isLive = true;
          streamState.source = msg.source || 'obs';
          broadcastToViewers({
            type: 'host-stream-status',
            isLive: true,
            source: streamState.source,
          });
          for (const adminWs of adminSockets) {
            if (adminWs.readyState === WebSocket.OPEN) {
              adminWs.send(JSON.stringify({
                type: 'host-stream-status',
                isLive: true,
                source: streamState.source,
              }));
            }
          }
        } else if (msg.type === 'host-stream-stopped') {
          // Solo detener el stream si la solicitud proviene del host que realmente está transmitiendo
          if (ws === hostWs) {
            streamState.isLive = false;
            streamState.source = 'none';
            broadcastToViewers({
              type: 'host-stream-status',
              isLive: false,
              source: 'none',
            });
            for (const adminWs of adminSockets) {
              if (adminWs.readyState === WebSocket.OPEN) {
                adminWs.send(JSON.stringify({
                  type: 'host-stream-status',
                  isLive: false,
                  source: 'none',
                }));
              }
            }
          }
        } else if (msg.type === 'request-stream') {
          if (hostWs && hostWs.readyState === WebSocket.OPEN) {
            hostWs.send(
              JSON.stringify({
                type: 'request-stream',
                viewerId: msg.viewerId || currentViewerId,
              }),
            );
          }
        } else if (msg.type === 'offer' && msg.viewerId) {
          const target = viewerSockets.get(msg.viewerId);
          if (target && target.readyState === WebSocket.OPEN) {
            target.send(
              JSON.stringify({
                type: 'offer',
                sdp: msg.sdp,
              }),
            );
          }
        } else if (msg.type === 'answer') {
          if (hostWs && hostWs.readyState === WebSocket.OPEN) {
            hostWs.send(
              JSON.stringify({
                type: 'answer',
                viewerId: msg.viewerId || currentViewerId,
                sdp: msg.sdp,
              }),
            );
          }
        } else if (msg.type === 'candidate') {
          if (msg.target === 'host') {
            if (hostWs && hostWs.readyState === WebSocket.OPEN) {
              hostWs.send(
                JSON.stringify({
                  type: 'candidate',
                  viewerId: msg.viewerId || currentViewerId,
                  candidate: msg.candidate,
                }),
              );
            }
          } else if (msg.viewerId) {
            const target = viewerSockets.get(msg.viewerId);
            if (target && target.readyState === WebSocket.OPEN) {
              target.send(
                JSON.stringify({
                  type: 'candidate',
                  candidate: msg.candidate,
                }),
              );
            }
          }
        }
      } catch (err) {
        console.error('Error in stream websocket:', err);
      }
    });

    ws.on('close', () => {
      adminSockets.delete(ws);
      if (ws === hostWs) {
        // Solo si el host emisor activo se desconecta
        hostWs = null;
        streamState.isLive = false;
        streamState.source = 'none';
        broadcastToViewers({
          type: 'host-stream-status',
          isLive: false,
          source: 'none',
        });
        for (const adminWs of adminSockets) {
          if (adminWs.readyState === WebSocket.OPEN) {
            adminWs.send(JSON.stringify({
              type: 'host-stream-status',
              isLive: false,
              source: 'none',
            }));
          }
        }
      } else {
        viewerSockets.delete(currentViewerId);
        if (hostWs && hostWs.readyState === WebSocket.OPEN) {
          hostWs.send(
            JSON.stringify({
              type: 'viewer-disconnected',
              viewerId: currentViewerId,
            }),
          );
        }
      }
      notifyAllViewersCount();
    });
  });

  // API Config
  app.get('/api/config', (_req, res) => {
    res.json({
      streamUrl: process.env.LUDITO_STREAM_URL || '',
      whatsappNumber: process.env.LUDITO_WHATSAPP_NUMBER || '',
    });
  });

  // Stream Live Status
  app.get('/api/stream/status', (_req, res) => {
    res.json(streamState);
  });

  // Client View Modular Customization Config (index.html)
  app.get('/api/client-view-config', (_req, res) => {
    res.json(clientViewConfig);
  });

  // API State
  app.get('/api/state', (_req, res) => {
    res.json(state);
  });

  // SSE Stream
  app.get('/api/events', (_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`);
    listeners.add(res);

    _req.on('close', () => {
      listeners.delete(res);
    });
  });

  // Participant Auth by PIN / Password (Dynamic Database)
  app.post('/api/auth', async (req, res) => {
    const { pin } = req.body;
    const cleanPin = String(pin || '').trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      res.status(401).json({ error: 'La contraseña de participante debe tener cuatro dígitos.' });
      return;
    }
    const participant = participantsList.find((p) => p.pin === cleanPin);
    if (!participant) {
      res.status(401).json({ error: 'Contraseña de participante no encontrada en el registro. Solicítala al administrador.' });
      return;
    }
    const user: User = { name: participant.name, role: 'client', lastActive: Date.now() };
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, user);
    await persistSessions();

    participant.lastLoginAt = new Date().toISOString();
    await persistParticipants();

    res.json({ token, user: user.name, role: user.role, pin: participant.pin });
  });

  // Check Participant Session (Auto-login / 3 horas de persistencia)
  app.get('/api/session', (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'client') {
      res.status(401).json({ error: 'La sesión de participante expiró por inactividad (3 horas).' });
      return;
    }
    res.json({ user: user.name, role: user.role });
  });

  // Database API: List registered participants
  app.get('/api/participants', (_req, res) => {
    res.json({ participants: participantsList });
  });

  // Database API: Register new participant (Lista Blanca)
  app.post('/api/admin/participants', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el administrador puede registrar participantes.' });
      return;
    }
    const { name, deviceId, pin, color } = req.body;
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      res.status(400).json({ error: 'El nombre del participante es obligatorio.' });
      return;
    }
    const cleanDeviceId = typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : undefined;
    const cleanColor = typeof color === 'string' && color.trim() ? color.trim() : undefined;
    let finalPin = String(pin || '').trim();
    if (finalPin && !/^\d{4}$/.test(finalPin)) {
      finalPin = generateUniquePin();
    } else if (!finalPin) {
      finalPin = generateUniquePin();
    }

    const newParticipant: Participant = {
      id: crypto.randomUUID(),
      name: cleanName,
      color: cleanColor,
      deviceId: cleanDeviceId,
      pin: finalPin,
      createdAt: new Date().toISOString(),
    };
    participantsList.unshift(newParticipant);
    await persistParticipants();

    // Actualizar retroactivamente todos los mensajes enviados por este usuario
    if (cleanDeviceId) {
      let updatedCount = 0;
      for (const msg of state.chat) {
        if (msg.senderId === cleanDeviceId) {
          msg.name = cleanName;
          msg.color = cleanColor;
          msg.isRegistered = true;
          msg.role = 'registered';
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        await persistAndBroadcast();
      }
    }

    res.status(201).json({ participant: newParticipant });
  });

  // Database API: Update participant name, color or regenerate PIN
  app.put('/api/admin/participants/:id', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el administrador puede editar participantes.' });
      return;
    }
    const { id } = req.params;
    const participant = participantsList.find((p) => p.id === id);
    if (!participant) {
      res.status(404).json({ error: 'Participante no encontrado.' });
      return;
    }
    const { name, color, pin, regeneratePin } = req.body;
    const oldName = participant.name;
    if (typeof name === 'string' && name.trim()) {
      participant.name = name.trim();
    }
    if (color !== undefined) {
      participant.color = typeof color === 'string' && color.trim() ? color.trim() : undefined;
    }
    if (regeneratePin) {
      participant.pin = generateUniquePin(participant.pin);
    } else if (typeof pin === 'string' && pin.trim()) {
      const cleanPin = pin.trim();
      if (!/^\d{4}$/.test(cleanPin)) {
        res.status(400).json({ error: 'El PIN debe ser de 4 dígitos numéricos.' });
        return;
      }
      if (participantsList.some((p) => p.id !== id && p.pin === cleanPin)) {
        res.status(409).json({ error: `El código ${cleanPin} ya está asignado a otra persona.` });
        return;
      }
      participant.pin = cleanPin;
    }
    await persistParticipants();

    // Actualizar retroactivamente todos los mensajes de este participante en el chat
    let updatedChatCount = 0;
    for (const msg of state.chat) {
      if ((participant.deviceId && msg.senderId === participant.deviceId) || msg.senderId === participant.id || msg.name === oldName) {
        msg.name = participant.name;
        msg.color = participant.color;
        msg.isRegistered = true;
        msg.role = 'registered';
        updatedChatCount++;
      }
    }
    if (updatedChatCount > 0) {
      await persistAndBroadcast();
    }

    res.json({ participant });
  });

  // Database API: Delete participant
  app.delete('/api/admin/participants/:id', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el administrador puede eliminar participantes.' });
      return;
    }
    const { id } = req.params;
    const index = participantsList.findIndex((p) => p.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Participante no encontrado.' });
      return;
    }
    const removed = participantsList.splice(index, 1)[0];
    await persistParticipants();
    res.json({ ok: true, removed });
  });

  // Moderación de Chat: Eliminar mensaje individual
  app.delete('/api/admin/chat/:id', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el administrador puede moderar mensajes.' });
      return;
    }
    const { id } = req.params;
    const initialLen = state.chat.length;
    state.chat = state.chat.filter((msg) => msg.id !== id);
    if (state.chat.length !== initialLen) {
      await persistAndBroadcast();
      res.json({ ok: true, id });
    } else {
      res.status(404).json({ error: 'Mensaje no encontrado.' });
    }
  });

  // Moderación: Bloqueo de usuario y purga masiva automática de todos sus mensajes
  app.post('/api/admin/users/block', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el administrador puede bloquear usuarios.' });
      return;
    }
    const { senderId, participantId, name } = req.body;
    const cleanSenderId = typeof senderId === 'string' ? senderId.trim().toLowerCase() : '';
    const cleanParticipantId = typeof participantId === 'string' ? participantId.trim().toLowerCase() : '';
    const cleanName = typeof name === 'string' ? name.trim().toLowerCase() : '';

    if (!cleanSenderId && !cleanParticipantId && !cleanName) {
      res.status(400).json({ error: 'Se requiere identificador o nombre para bloquear.' });
      return;
    }

    if (cleanSenderId) blockedUsers.add(cleanSenderId);
    if (cleanParticipantId) blockedUsers.add(cleanParticipantId);
    if (cleanName && cleanName !== 'invitado') blockedUsers.add(cleanName);

    // Marcar al participante en la lista si existe
    let matchedP: Participant | undefined = undefined;
    if (cleanParticipantId || cleanSenderId) {
      matchedP = participantsList.find((item) =>
        (cleanParticipantId && item.id.toLowerCase() === cleanParticipantId) ||
        (cleanSenderId && item.deviceId && item.deviceId.toLowerCase() === cleanSenderId)
      );
      if (matchedP) {
        matchedP.isBlocked = true;
        await persistParticipants();
      }
    }

    // Registrar en blockedRecords
    const primaryIdent = cleanParticipantId || cleanSenderId || cleanName;
    const displayName = (matchedP ? matchedP.name : (name || senderId || 'Invitado')).trim();

    blockedRecords = blockedRecords.filter((r) =>
      r.identifier !== primaryIdent &&
      (!cleanSenderId || r.senderId !== cleanSenderId) &&
      (!cleanParticipantId || r.participantId !== cleanParticipantId)
    );

    const record: BlockedRecord = {
      id: crypto.randomUUID(),
      identifier: primaryIdent,
      name: displayName,
      senderId: cleanSenderId || undefined,
      participantId: cleanParticipantId || (matchedP ? matchedP.id : undefined),
      deviceId: cleanSenderId || (matchedP ? matchedP.deviceId : undefined),
      type: matchedP ? 'participant' : 'guest',
      blockedAt: new Date().toISOString(),
    };
    blockedRecords.unshift(record);
    await persistBlockedRecords();

    // Invalidar sesiones activas de dicho usuario
    for (const [token, u] of sessions.entries()) {
      if (cleanName && u.name.toLowerCase() === cleanName) {
        sessions.delete(token);
      }
    }
    await persistSessions();

    // PURGA MASIVA: Eliminar todos los mensajes previos de ese usuario
    const beforeCount = state.chat.length;
    state.chat = state.chat.filter((msg) => {
      const msgSender = (msg.senderId || '').toLowerCase();
      const msgName = (msg.name || '').toLowerCase();
      if (cleanSenderId && msgSender === cleanSenderId) return false;
      if (cleanParticipantId && msgSender === cleanParticipantId) return false;
      if (cleanName && cleanName !== 'invitado' && msgName === cleanName) return false;
      return true;
    });
    const purgedCount = beforeCount - state.chat.length;

    await persistAndBroadcast();
    res.json({ ok: true, purgedCount, record, blocked: { senderId, participantId, name } });
  });

  // Lista de usuarios bloqueados (Lista Negra)
  app.get('/api/admin/users/blocked', (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el administrador puede ver la lista negra.' });
      return;
    }
    res.json({ blocked: blockedRecords });
  });

  // Desbloqueo de usuario: recupera acceso y permite escribir de inmediato
  app.post('/api/admin/users/unblock', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el administrador puede desbloquear usuarios.' });
      return;
    }
    const { id, identifier, name, senderId, participantId } = req.body;

    const targetRecord = blockedRecords.find((r) =>
      (id && r.id === id) ||
      (identifier && r.identifier.toLowerCase() === String(identifier).toLowerCase()) ||
      (participantId && r.participantId && r.participantId.toLowerCase() === String(participantId).toLowerCase()) ||
      (senderId && r.senderId && r.senderId.toLowerCase() === String(senderId).toLowerCase()) ||
      (name && r.name.toLowerCase() === String(name).toLowerCase())
    );

    const keysToRemove = new Set<string>();
    if (targetRecord) {
      if (targetRecord.identifier) keysToRemove.add(targetRecord.identifier.toLowerCase());
      if (targetRecord.name) keysToRemove.add(targetRecord.name.toLowerCase());
      if (targetRecord.senderId) keysToRemove.add(targetRecord.senderId.toLowerCase());
      if (targetRecord.participantId) keysToRemove.add(targetRecord.participantId.toLowerCase());
      if (targetRecord.deviceId) keysToRemove.add(targetRecord.deviceId.toLowerCase());
    }
    if (id) keysToRemove.add(String(id).toLowerCase());
    if (identifier) keysToRemove.add(String(identifier).toLowerCase());
    if (name) keysToRemove.add(String(name).toLowerCase());
    if (senderId) keysToRemove.add(String(senderId).toLowerCase());
    if (participantId) keysToRemove.add(String(participantId).toLowerCase());

    keysToRemove.forEach((key) => {
      blockedUsers.delete(key);
    });

    blockedRecords = blockedRecords.filter((r) =>
      (!id || r.id !== id) &&
      !keysToRemove.has(r.identifier.toLowerCase()) &&
      (!r.senderId || !keysToRemove.has(r.senderId.toLowerCase())) &&
      (!r.participantId || !keysToRemove.has(r.participantId.toLowerCase())) &&
      (!r.name || !keysToRemove.has(r.name.toLowerCase()))
    );
    await persistBlockedRecords();

    // Quitar isBlocked en participante si existe
    let unblockedParticipant: Participant | undefined = undefined;
    participantsList.forEach((p) => {
      const match = keysToRemove.has(p.id.toLowerCase()) ||
        (p.deviceId && keysToRemove.has(p.deviceId.toLowerCase())) ||
        keysToRemove.has(p.name.toLowerCase());
      if (match) {
        p.isBlocked = false;
        unblockedParticipant = p;
      }
    });
    if (unblockedParticipant) {
      await persistParticipants();
    }

    await persistAndBroadcast();
    res.json({ ok: true, unblocked: { id, targetRecord, unblockedParticipant } });
  });

  // Guardar y actualizar configuración de la vista del cliente
  app.post('/api/admin/client-view-config', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el administrador puede configurar la vista del cliente.' });
      return;
    }
    const incoming = req.body;
    if (incoming && typeof incoming === 'object') {
      clientViewConfig = {
        ...clientViewConfig,
        ...incoming,
        background: { ...clientViewConfig.background, ...(incoming.background || {}) },
        videoFrame: { ...clientViewConfig.videoFrame, ...(incoming.videoFrame || {}) },
        offline: { ...clientViewConfig.offline, ...(incoming.offline || {}) },
        chatFrame: { ...clientViewConfig.chatFrame, ...(incoming.chatFrame || {}) },
        promoSection: { ...clientViewConfig.promoSection, ...(incoming.promoSection || {}) },
        decorations: Array.isArray(incoming.decorations) ? incoming.decorations : clientViewConfig.decorations,
      };
      await persistClientViewConfig();
      await persistAndBroadcast();
      res.json({ ok: true, config: clientViewConfig });
    } else {
      res.status(400).json({ error: 'Configuración inválida' });
    }
  });

  // Host Auth by Password
  app.post('/api/admin/auth', async (req, res) => {
    const { password } = req.body;
    if (!matchesAdminPassword(password)) {
      res.status(401).json({ error: 'Contraseña incorrecta.' });
      return;
    }
    const user: User = { name: 'Tío Mario', role: 'host', lastActive: Date.now() };
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, user);
    await persistSessions();
    res.json({ token, user: user.name, role: user.role });
  });

  // Check Admin Session
  app.get('/api/admin/session', (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(401).json({ error: 'La sesión de administrador expiró por 10 minutos de inactividad.' });
      return;
    }
    res.json({ user: user.name, role: user.role });
  });

  // Admin Heartbeat to maintain activity when panel is in use
  app.post('/api/admin/heartbeat', (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(401).json({ error: 'Sesión no válida o expirada.' });
      return;
    }
    res.json({ ok: true });
  });

  // Order Submission
  app.post('/api/orders', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Inicia sesión para enviar un pedido.' });
      return;
    }
    const { items } = req.body;
    if (!state.accepting) {
      res.status(409).json({ error: 'Los pedidos de esta ronda están cerrados.' });
      return;
    }
    const validItems =
      Array.isArray(items) &&
      items.length > 0 &&
      items.length <= COLORS.size &&
      items.every(
        (item, index) =>
          COLORS.has(item.color) &&
          Number.isInteger(item.quantity) &&
          item.quantity >= 1 &&
          item.quantity <= 20 &&
          items.findIndex((candidate) => candidate.color === item.color) === index,
      );

    if (!validItems) {
      res.status(400).json({ error: 'Pedido no válido.' });
      return;
    }

    const normalizedItems = items.map(({ color, quantity }) => ({ color, quantity }));

    if (state.roundCapacity != null && state.roundCapacity > 0) {
      for (const item of normalizedItems) {
        const ordered = getRoundOrderedQuantity(state.round, item.color);
        const available = state.roundCapacity - ordered;
        if (item.quantity > available) {
          res.status(409).json({
            error: `No hay suficientes espacios para ${item.color}. ${available <= 0 ? 'Color agotado en esta ronda.' : `Solo quedan ${available} espacios.`}`,
          });
          return;
        }
      }
    }
    const event: LuditoEvent = {
      id: crypto.randomUUID(),
      type: 'order',
      name: user.name,
      items: normalizedItems,
      round: state.round,
      timestamp: new Date().toISOString(),
    };

    appendEvent(event);
    await persistAndBroadcast();
    res.status(201).json({ event, state });
  });

  // Chat en Vivo Abierto (Público + Identificación de Registrados / Invitados)
  app.post('/api/chat', async (req, res) => {
    const user = currentUser(req);
    const { message, senderId, senderName } = req.body;
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text || text.length > 500) {
      res.status(400).json({ error: 'El mensaje debe tener entre 1 y 500 caracteres.' });
      return;
    }

    const cleanSenderId = typeof senderId === 'string' ? senderId.trim() : '';

    // Verificar si el usuario o dispositivo está bloqueado
    const checkSenderId = cleanSenderId.toLowerCase();
    const checkName = (user?.name || senderName || '').trim().toLowerCase();
    if (user?.role !== 'host') {
      if (
        (checkSenderId && blockedUsers.has(checkSenderId)) ||
        (checkName && checkName !== 'invitado' && blockedUsers.has(checkName))
      ) {
        res.status(403).json({ error: 'Has sido bloqueado por el moderador del chat.' });
        return;
      }
    }

    let finalName = 'Invitado';
    let role: 'host' | 'registered' | 'guest' = 'guest';
    let isRegistered = false;
    let assignedColor: string | undefined = undefined;

    if (user && user.role === 'host') {
      finalName = 'Tío Mario';
      role = 'host';
      isRegistered = true;
    } else {
      // Verificar si el dispositivo o identificador está en la lista blanca de participantes
      const matched = participantsList.find(
        (p) => (cleanSenderId && (p.deviceId === cleanSenderId || p.id === cleanSenderId))
      );
      if (matched) {
        if (matched.isBlocked || blockedUsers.has(matched.id.toLowerCase()) || (matched.deviceId && blockedUsers.has(matched.deviceId.toLowerCase()))) {
          res.status(403).json({ error: 'Has sido bloqueado por el moderador del chat.' });
          return;
        }
        finalName = matched.name;
        assignedColor = matched.color;
        role = 'registered';
        isRegistered = true;
      } else {
        const customName = typeof senderName === 'string' ? senderName.trim() : '';
        finalName = customName || 'Invitado';
        role = 'guest';
        isRegistered = false;
      }
    }

    const chatMessage: ChatMessage = {
      id: crypto.randomUUID(),
      name: finalName,
      color: assignedColor,
      text,
      timestamp: new Date().toISOString(),
      senderId: cleanSenderId || (user ? 'host' : undefined),
      isRegistered,
      role,
    };

    state.chat.push(chatMessage);
    state.chat = state.chat.slice(-150);
    await persistAndBroadcast();
    res.status(201).json({ message: chatMessage });
  });

  // Voice Preference (Host only)
  app.post('/api/voice', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el host puede cambiar la voz.' });
      return;
    }
    const { preference } = req.body;
    const voiceURI = typeof preference?.voiceURI === 'string' ? preference.voiceURI.slice(0, 500) : '';
    const lang = typeof preference?.lang === 'string' && /^es([_-]|$)/i.test(preference.lang) ? preference.lang.slice(0, 20) : 'es-MX';
    const name = typeof preference?.name === 'string' ? preference.name.slice(0, 120) : 'Voz automática (español)';
    const volume = Number.isFinite(Number(preference?.volume)) ? Math.min(1, Math.max(0, Number(preference.volume))) : 1;
    state.voicePreference = { voiceURI, lang, name, volume };
    await persistAndBroadcast();
    res.json({ voicePreference: state.voicePreference });
  });

  // Toggle Round (Host only)
  app.post('/api/rounds/toggle', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el host puede controlar las rondas.' });
      return;
    }
    const event: LuditoEvent = state.accepting
      ? { id: crypto.randomUUID(), type: 'round_closed', round: state.round, timestamp: new Date().toISOString() }
      : { id: crypto.randomUUID(), type: 'round_started', round: state.round + 1, timestamp: new Date().toISOString() };
    appendEvent(event);
    await persistAndBroadcast();
    res.json({ event, state });
  });

  // Set Round Capacity (Host only)
  app.post('/api/rounds/capacity', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el host puede configurar los espacios por color.' });
      return;
    }
    const { capacity } = req.body;
    const num = Number(capacity);
    if (capacity === null || capacity === '' || capacity === undefined || isNaN(num) || num <= 0) {
      state.roundCapacity = null;
    } else {
      state.roundCapacity = Math.min(999, Math.max(1, Math.floor(num)));
    }
    await persistAndBroadcast();
    res.json({ state, roundCapacity: state.roundCapacity });
  });

  // Clear Chat Only (Host only)
  app.post('/api/admin/clear-chat', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo el host puede limpiar el chat.' });
      return;
    }
    const removedChatMessages = state.chat.length;
    state.chat = [];
    state.resetTimestamp = Date.now();
    await persistAndBroadcast();
    res.json({ state, removedChatMessages });
  });

  // Reset Live State (Host only)
  app.post('/api/admin/reset-live', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'host') {
      res.status(403).json({ error: 'Solo Tío Mario puede reiniciar la transmisión.' });
      return;
    }
    const removedOrders = state.events.filter((event) => event.type === 'order').length;
    const removedChatMessages = state.chat.length;
    state.events = [];
    state.chat = [];
    state.round = 1;
    state.accepting = true;
    state.roundCapacity = null;
    state.resetTimestamp = Date.now();
    await persistAndBroadcast();
    res.json({ state, removedOrders, removedChatMessages });
  });

  // Logout
  app.post('/api/logout', async (req, res) => {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    sessions.delete(token);
    await persistSessions();
    res.json({ ok: true });
  });

  // 25-second keepalive for SSE
  setInterval(() => {
    for (const client of listeners) {
      try {
        client.write(': ping\n\n');
      } catch {
        listeners.delete(client);
      }
    }
  }, 25000);

  // Frontend serving
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(ROOT, 'dist'))) {
    app.use(express.static(path.resolve(ROOT, 'dist')));
    app.get('/admin.html', (_req, res) => {
      res.sendFile(path.resolve(ROOT, 'dist/admin.html'));
    });
    app.get('/database.html', (_req, res) => {
      res.sendFile(path.resolve(ROOT, 'dist/database.html'));
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(ROOT, 'dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.get('/admin.html', async (_req, res, next) => {
      try {
        const adminPath = path.resolve(ROOT, 'admin.html');
        if (fs.existsSync(adminPath)) {
          let html = await fs.promises.readFile(adminPath, 'utf8');
          html = await vite.transformIndexHtml('/admin.html', html);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
          return;
        }
        next();
      } catch (e) {
        next(e);
      }
    });
    app.get('/database.html', async (_req, res, next) => {
      try {
        const dbPath = path.resolve(ROOT, 'database.html');
        if (fs.existsSync(dbPath)) {
          let html = await fs.promises.readFile(dbPath, 'utf8');
          html = await vite.transformIndexHtml('/database.html', html);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
          return;
        }
        next();
      } catch (e) {
        next(e);
      }
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, HOST, () => {
    console.log(`Ludito Live escuchando en http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
