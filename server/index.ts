import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { randomBytes } from "node:crypto";
import { COLORS, MAX_PLAYERS, PORT, TICK_RATE } from "../shared/constants.js";
import type { ClientToServer, LobbyState, NetworkInfo } from "../shared/types.js";
import { KurveEngine } from "./game/engine.js";
import { getNetworkInfo } from "./network.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

const engine = new KurveEngine();
let network: NetworkInfo = getNetworkInfo(PORT);

function refreshNetwork(): void {
  network = getNetworkInfo(PORT);
}

function lobbyState(): LobbyState {
  return {
    phase: engine.phase,
    players: engine.toLobbyPlayers(),
    hostSocketId: engine.hostSocketId,
    winScore: engine.winScore,
    round: engine.round,
    countdown: engine.countdown,
    winnerId: engine.winnerId,
    network,
    maxPlayers: MAX_PLAYERS,
  };
}

function emitLobby(): void {
  io.emit("message", { type: "lobby", state: lobbyState() });
}

function emitSnapshot(): void {
  io.emit("message", {
    type: "snapshot",
    state: engine.snapshot(),
    trailMode: "full",
  });
}

function isLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === ":ffff:127.0.0.1";
}

app.get("/api/network", (_req, res) => {
  refreshNetwork();
  res.json(network);
});

app.get("/api/colors", (_req, res) => {
  res.json(COLORS);
});

if (isProd) {
  const dist = path.resolve(__dirname, "../dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  // In npm run dev the UI lives on Vite (:5173). Redirect phones that open :3847.
  app.get(["/", "/index.html"], (req, res) => {
    refreshNetwork();
    const host = req.hostname || "127.0.0.1";
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const target = isLocal
      ? "http://127.0.0.1:5173/"
      : `http://${host}:5173/`;
    res.redirect(302, target);
  });

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
    refreshNetwork();
    const host = req.hostname || "127.0.0.1";
    const isLocal = host === "localhost" || host === "127.0.0.1";
    res.redirect(302, isLocal ? "http://127.0.0.1:5173/" : `http://${host}:5173/`);
  });
}

io.on("connection", (socket) => {
  refreshNetwork();
  const remote = socket.handshake.address;
  const localHost = isLoopback(remote);

  // Auto-claim host for first localhost connection if free
  if (localHost && !engine.hostSocketId) {
    engine.setHost(socket.id);
  }

  socket.emit("message", {
    type: "welcome",
    socketId: socket.id,
    isLocalHost: localHost,
    state: lobbyState(),
  });
  emitLobby();

  socket.on("message", (raw: ClientToServer) => {
    try {
      handleMessage(socket.id, localHost, raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      socket.emit("message", { type: "error", message });
    }
  });

  socket.on("disconnect", () => {
    if (engine.hostSocketId === socket.id) {
      engine.setHost(null);
    }

    const owned = [...engine.players.values()].filter((p) => p.socketId === socket.id);
    for (const p of owned) {
      if (engine.phase === "playing" || engine.phase === "countdown" || engine.phase === "roundEnd") {
        engine.killPlayerById(p.id);
      }
      if (engine.phase === "lobby" || engine.phase === "matchEnd") {
        engine.removePlayer(p.id);
      } else {
        // Keep slot until lobby so scoreboard stays intact; drop socket link
        const internal = engine.players.get(p.id);
        if (internal) internal.socketId = null;
      }
    }

    if (engine.phase === "lobby" || engine.phase === "matchEnd") {
      emitLobby();
    } else {
      emitSnapshot();
      emitLobby();
    }
  });
});

function handleMessage(socketId: string, localHost: boolean, msg: ClientToServer): void {
  switch (msg.type) {
    case "claim_host": {
      if (engine.hostSocketId && engine.hostSocketId !== socketId && !localHost) {
        throw new Error("Host seat is taken. Open the game on the server PC to take over.");
      }
      engine.setHost(socketId);
      emitLobby();
      break;
    }
    case "release_host": {
      if (engine.hostSocketId === socketId) {
        engine.setHost(null);
        emitLobby();
      }
      break;
    }
    case "add_player": {
      const id = randomBytes(4).toString("hex");
      engine.addPlayer({
        id,
        socketId,
        name: msg.name,
        colorId: msg.colorId,
        control: msg.control,
        keys: msg.keys,
        isLocalOnly: false,
      });
      emitLobby();
      break;
    }
    case "remove_player": {
      const p = engine.players.get(msg.playerId);
      if (!p) return;
      const isHost = engine.hostSocketId === socketId;
      if (p.socketId !== socketId && !isHost) throw new Error("Cannot remove that player.");
      engine.removePlayer(msg.playerId);
      emitLobby();
      break;
    }
    case "set_ready": {
      const p = engine.players.get(msg.playerId);
      if (!p || p.socketId !== socketId) throw new Error("Not your player.");
      engine.setReady(msg.playerId, msg.ready);
      emitLobby();
      break;
    }
    case "update_keys": {
      const p = engine.players.get(msg.playerId);
      if (!p || p.socketId !== socketId) throw new Error("Not your player.");
      engine.updateKeys(msg.playerId, msg.keys);
      emitLobby();
      break;
    }
    case "host_start": {
      if (engine.hostSocketId !== socketId) throw new Error("Only the host can start.");
      engine.startMatch();
      emitLobby();
      emitSnapshot();
      break;
    }
    case "host_reset_match": {
      if (engine.hostSocketId !== socketId) throw new Error("Only the host can reset.");
      engine.resetMatchToLobby();
      emitLobby();
      emitSnapshot();
      break;
    }
    case "host_back_lobby": {
      if (engine.hostSocketId !== socketId) throw new Error("Only the host can return to lobby.");
      engine.backToLobbyKeepScores();
      emitLobby();
      emitSnapshot();
      break;
    }
    case "input": {
      const p = engine.players.get(msg.playerId);
      if (!p || p.socketId !== socketId) return;
      engine.setInput(msg.playerId, msg.left, msg.right);
      break;
    }
    default:
      break;
  }
}

const tickDt = 1 / TICK_RATE;
/** ~30Hz full snapshots — trails must stay visible on mobile Wi‑Fi. */
const BROADCAST_EVERY_TICKS = 2;
let tickCount = 0;
let simAccum = 0;
let simLast = performance.now();
setInterval(() => {
  const now = performance.now();
  simAccum += Math.min(0.05, (now - simLast) / 1000);
  simLast = now;

  let steps = 0;
  while (simAccum >= tickDt && steps < 4) {
    const before = engine.phase;
    engine.update(tickDt);
    simAccum -= tickDt;
    tickCount++;
    steps++;
    const phaseChanged = before !== engine.phase;
    if (engine.phase !== "lobby" && (phaseChanged || tickCount % BROADCAST_EVERY_TICKS === 0)) {
      emitSnapshot();
    }
    if (phaseChanged) emitLobby();
  }
}, 1000 / TICK_RATE);

httpServer.listen(PORT, "0.0.0.0", () => {
  refreshNetwork();
  console.log("");
  console.log("  ╔══════════════════════════════════════╗");
  console.log("  ║              KURVE SERVER            ║");
  console.log("  ╚══════════════════════════════════════╝");
  console.log("");
  if (isProd) {
    console.log(`  Local:   http://localhost:${PORT}`);
    if (network.urls.length) {
      for (const url of network.urls) console.log(`  LAN:     ${url}`);
    } else {
      console.log("  LAN:     (no IPv4 address found)");
    }
  } else {
    console.log(`  Host UI: http://127.0.0.1:5173`);
    console.log(`  API:     http://127.0.0.1:${PORT}`);
    if (network.urls.length) {
      for (const url of network.urls) console.log(`  LAN UI:  ${url}`);
    } else {
      console.log("  LAN UI:  (no IPv4 address found)");
    }
    console.log("  (dev mode — phones must open the LAN UI port, not :3847)");
  }
  console.log("");
  console.log("  Open the host UI on this PC. Friends join via LAN UI on the same Wi‑Fi.");
  console.log("");
});
