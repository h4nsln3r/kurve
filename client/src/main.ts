import "./style.css";
import QRCode from "qrcode";
import { COLORS, type ColorId } from "../../shared/constants";
import type { GameSnapshot, KeyBinding, LobbyState, PlayerPublic } from "../../shared/types";
import { Net } from "./net";
import { ArenaRenderer } from "./render";
import { VirtualJoystick } from "./joystick";
import { LocalPredictor } from "./predict";
import {
  InputManager,
  defaultKeysForIndex,
  isTouchDevice,
  prettyKey,
} from "./input";

const app = document.querySelector<HTMLDivElement>("#app")!;

let lobby: LobbyState | null = null;
let snapshot: GameSnapshot | null = null;
let mySocketId: string | null = null;
let isLocalHost = false;
let toastTimer: number | null = null;

let draftName = localStorage.getItem("kurve-name") || "Player";
let draftColor: ColorId = "red";
let draftKeys: KeyBinding = defaultKeysForIndex(0);
let capturing: "left" | "right" | null = null;
let joinError = "";

let gameCanvas: HTMLCanvasElement | null = null;
let renderer: ArenaRenderer | null = null;
let overlayEl: HTMLDivElement | null = null;

function myPlayers(): PlayerPublic[] {
  if (!lobby || !mySocketId) return [];
  return lobby.players.filter((p) => p.socketId === mySocketId);
}

function showToast(msg: string): void {
  let el = document.querySelector<HTMLDivElement>(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.remove(), 3200);
}

const net = new Net({
  onWelcome: (msg) => {
    mySocketId = msg.socketId;
    isLocalHost = msg.isLocalHost;
  },
  onLobby: (state) => {
    lobby = state;
    if (
      state.phase === "countdown" ||
      state.phase === "playing" ||
      state.phase === "roundEnd" ||
      state.phase === "matchEnd"
    ) {
      if (!snapshot) snapshot = {
        phase: state.phase,
        players: state.players,
        trails: [],
        winScore: state.winScore,
        round: state.round,
        countdown: state.countdown,
        winnerId: state.winnerId,
        message: null,
        arena: { width: 900, height: 700 },
      };
    } else {
      snapshot = null;
      gameCanvas = null;
      renderer = null;
    }
    render();
  },
  onSnapshot: (state) => {
    snapshot = state;
    predictor.reconcile(state, new Set(myPlayers().map((p) => p.id)));
    if (lobby) {
      lobby = {
        ...lobby,
        phase: state.phase,
        players: state.players,
        winScore: state.winScore,
        round: state.round,
        countdown: state.countdown,
        winnerId: state.winnerId,
      };
    }
    renderGameFrame();
  },
  onError: (message) => {
    joinError = message;
    showToast(message);
    render();
  },
});

const input = new InputManager(() => flushInputs());
const joystick = new VirtualJoystick(() => flushInputs());
const predictor = new LocalPredictor();
document.body.appendChild(joystick.root);

const lastSent = new Map<string, string>();
const localInputs = new Map<string, { left: boolean; right: boolean }>();

function flushInputs(): void {
  const mine = myPlayers();
  input.setPlayers(mine);
  localInputs.clear();

  for (const [playerId, v] of input.sample()) {
    localInputs.set(playerId, v);
    const key = `${v.left},${v.right}`;
    if (lastSent.get(playerId) === key) continue;
    lastSent.set(playerId, key);
    net.send({ type: "input", playerId, left: v.left, right: v.right });
  }

  for (const p of mine.filter((x) => x.control === "touch")) {
    const v = { left: joystick.left, right: joystick.right };
    localInputs.set(p.id, v);
    const key = `${v.left},${v.right}`;
    if (lastSent.get(p.id) === key) continue;
    lastSent.set(p.id, key);
    net.send({ type: "input", playerId: p.id, left: v.left, right: v.right });
  }
}

setInterval(flushInputs, 33);

function iAmHost(): boolean {
  return Boolean(lobby && mySocketId && lobby.hostSocketId === mySocketId);
}

function takenColors(): Set<ColorId> {
  return new Set((lobby?.players ?? []).map((p) => p.colorId));
}

function nextFreeColor(): ColorId {
  const taken = takenColors();
  return COLORS.find((c) => !taken.has(c.id))?.id ?? "red";
}

async function paintQr(url: string, canvas: HTMLCanvasElement): Promise<void> {
  await QRCode.toCanvas(canvas, url, {
    width: 148,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

function inGamePhase(phase: string): boolean {
  return phase === "countdown" || phase === "playing" || phase === "roundEnd" || phase === "matchEnd";
}

function render(): void {
  if (!lobby) {
    app.innerHTML = `<div class="screen"><div class="brand"><h1>KURVE</h1><p>Connecting…</p></div></div>`;
    return;
  }

  if (inGamePhase(lobby.phase) && snapshot) {
    renderGameShell();
    return;
  }

  renderLobby();
}

function renderLobby(): void {
  const state = lobby!;
  const mine = myPlayers();
  const touch = isTouchDevice();

  if (takenColors().has(draftColor) && !mine.some((p) => p.colorId === draftColor)) {
    draftColor = nextFreeColor();
  }

  app.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <div class="brand">
          <h1>KURVE</h1>
          <p>Classic Achtung — up to 8 players on your Wi‑Fi</p>
        </div>
        <div class="row">
          <span class="pill">Win score <strong>${state.winScore}</strong></span>
          <span class="pill">${state.players.length}/${state.maxPlayers} players</span>
          ${iAmHost() ? `<span class="pill"><strong>Host</strong></span>` : ""}
        </div>
      </div>

      <div class="grid-lobby">
        <div class="stack">
          <section class="panel stack">
            <h2>Join the party</h2>
            <div class="row">
              <div class="field">
                <label>Name</label>
                <input id="name" maxlength="16" value="${escapeAttr(draftName)}" />
              </div>
            </div>
            <div class="field">
              <label>Color</label>
              <div class="colors" id="colors"></div>
            </div>
            ${
              touch
                ? `<p class="hint">Touch device detected — hold LEFT / RIGHT pads to steer (same as keyboard).</p>`
                : `<div class="field">
                    <label>Keys (left / right)</label>
                    <div class="keys-capture">
                      <button type="button" class="key-chip ${capturing === "left" ? "active" : ""}" id="cap-left">Left: ${prettyKey(draftKeys.left)}</button>
                      <button type="button" class="key-chip ${capturing === "right" ? "active" : ""}" id="cap-right">Right: ${prettyKey(draftKeys.right)}</button>
                    </div>
                    <p class="hint">Click a chip, then press a key. Several people can play on one keyboard.</p>
                  </div>`
            }
            ${joinError ? `<div class="error-inline">${escapeHtml(joinError)}</div>` : ""}
            <div class="row">
              <button class="primary" id="add-player" ${state.players.length >= state.maxPlayers ? "disabled" : ""}>
                ${mine.length ? "Add another local player" : "Join as player"}
              </button>
            </div>
          </section>

          <section class="panel">
            <h2>Players</h2>
            <div class="player-list" id="players"></div>
          </section>
        </div>

        <div class="stack">
          <section class="panel host-box">
            <h2>LAN invite</h2>
            <p class="hint">Everyone must be on the same Wi‑Fi. Open a link below on phone or PC.</p>
            <div class="qr-wrap">
              <canvas id="qr" width="148" height="148"></canvas>
              <div class="join-links" id="links"></div>
            </div>
            <div class="row">
              ${
                iAmHost()
                  ? `<button class="ghost" id="release-host">Release host</button>`
                  : `<button id="claim-host">Become host</button>`
              }
              <button class="ghost" id="copy-link">Copy join link</button>
            </div>
          </section>

          <section class="panel stack">
            <h2>Host controls</h2>
            ${
              iAmHost()
                ? `<p class="hint">You can spectate — you don't need a snake of your own.</p>
                   <button class="primary" id="start">Start match</button>
                   <button class="ghost" id="reset">Reset scores</button>`
                : `<p class="hint">Host controls appear on the computer running the server (or after claiming host).</p>
                   ${isLocalHost ? `<button id="claim-host-2">Take host seat</button>` : ""}`
            }
          </section>
        </div>
      </div>
    </div>
  `;

  const colorsEl = app.querySelector("#colors")!;
  for (const c of COLORS) {
    const taken = takenColors().has(c.id) && !mine.some((p) => p.colorId === c.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `color-btn${draftColor === c.id ? " selected" : ""}${taken ? " taken" : ""}`;
    btn.style.background = c.hex;
    btn.disabled = taken;
    btn.innerHTML = `<span>${c.name}</span>`;
    btn.addEventListener("click", () => {
      draftColor = c.id;
      joinError = "";
      render();
    });
    colorsEl.appendChild(btn);
  }

  const list = app.querySelector("#players")!;
  if (!state.players.length) {
    list.innerHTML = `<p class="muted">No players yet — pick a color and join.</p>`;
  } else {
    for (const p of state.players) {
      const mineRow = p.socketId === mySocketId;
      const card = document.createElement("div");
      card.className = "player-card";
      card.innerHTML = `
        <div class="swatch" style="background:${p.colorHex}"></div>
        <div class="meta">
          <strong>${escapeHtml(p.name)}</strong>
          <span>${p.control === "touch" ? "Touch pads" : `Keys ${prettyKey(p.keys?.left || "?")} / ${prettyKey(p.keys?.right || "?")}`} · score ${p.score}</span>
        </div>
        <div class="row">
          <span class="${p.ready ? "ready-yes" : "ready-no"}">${p.ready ? "Ready" : "Not ready"}</span>
          ${
            mineRow
              ? `<button data-ready="${p.id}">${p.ready ? "Unready" : "Ready"}</button>
                 <button data-leave="${p.id}">Leave</button>`
              : iAmHost()
                ? `<button data-kick="${p.id}">Kick</button>`
                : ""
          }
        </div>
      `;
      list.appendChild(card);
    }
  }

  const preferred =
    state.network.preferredUrl ||
    state.network.urls[0] ||
    `${location.protocol}//${location.hostname}:${state.network.joinPort || state.network.port}`;
  const links = app.querySelector("#links")!;
  const urls = state.network.urls.length ? state.network.urls : [preferred];
  const modeNote =
    state.network.mode === "development"
      ? `<p class="hint">Dev mode: guests must open port <strong>${state.network.joinPort}</strong> (Vite), not ${state.network.port}.</p>`
      : "";
  links.innerHTML =
    modeNote + urls.map((u) => `<a href="${u}" target="_blank" rel="noreferrer">${u}</a>`).join("");

  // Prefer LAN join URL from the server (already uses 5173 in dev / 3847 in prod).
  const qrTarget = preferred;
  const qr = app.querySelector<HTMLCanvasElement>("#qr")!;
  void paintQr(qrTarget, qr);

  app.querySelector("#name")?.addEventListener("input", (e) => {
    draftName = (e.target as HTMLInputElement).value;
    localStorage.setItem("kurve-name", draftName);
  });

  app.querySelector("#cap-left")?.addEventListener("click", () => {
    capturing = "left";
    render();
  });
  app.querySelector("#cap-right")?.addEventListener("click", () => {
    capturing = "right";
    render();
  });

  app.querySelector("#add-player")?.addEventListener("click", () => {
    joinError = "";
    const control = isTouchDevice() ? "touch" : "keyboard";
    net.send({
      type: "add_player",
      name: draftName.trim() || "Player",
      colorId: draftColor,
      control,
      keys: control === "keyboard" ? draftKeys : undefined,
    });
    draftColor = nextFreeColor();
    draftKeys = defaultKeysForIndex(mine.length + 1);
  });

  list.querySelectorAll("[data-ready]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.ready!;
      const p = state.players.find((x) => x.id === id);
      if (!p) return;
      net.send({ type: "set_ready", playerId: id, ready: !p.ready });
    });
  });
  list.querySelectorAll("[data-leave]").forEach((btn) => {
    btn.addEventListener("click", () => {
      net.send({ type: "remove_player", playerId: (btn as HTMLElement).dataset.leave! });
    });
  });
  list.querySelectorAll("[data-kick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      net.send({ type: "remove_player", playerId: (btn as HTMLElement).dataset.kick! });
    });
  });

  const claim = () => net.send({ type: "claim_host" });
  app.querySelector("#claim-host")?.addEventListener("click", claim);
  app.querySelector("#claim-host-2")?.addEventListener("click", claim);
  app.querySelector("#release-host")?.addEventListener("click", () => net.send({ type: "release_host" }));
  app.querySelector("#copy-link")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(qrTarget);
      showToast("Join link copied");
    } catch {
      showToast(qrTarget);
    }
  });
  app.querySelector("#start")?.addEventListener("click", () => net.send({ type: "host_start" }));
  app.querySelector("#reset")?.addEventListener("click", () => net.send({ type: "host_reset_match" }));

  joystick.setVisible(false);
}

function renderGameShell(): void {
  const state = snapshot!;
  const mine = myPlayers();
  const needJoystick = mine.some((p) => p.control === "touch");

  app.innerHTML = `
    <div class="screen">
      <div class="topbar">
        <div class="brand">
          <h1>KURVE</h1>
          <p>Round ${state.round} · first to ${state.winScore}</p>
        </div>
        <div class="row">
          ${iAmHost() ? `<button class="ghost" id="back-lobby">Lobby</button>` : ""}
          ${iAmHost() && state.phase === "matchEnd" ? `<button class="primary" id="rematch">Back to lobby</button>` : ""}
        </div>
      </div>
      <div class="game-layout">
        <aside class="panel scoreboard" id="scores"></aside>
        <div class="arena-wrap">
          <canvas id="arena"></canvas>
          <div class="overlay-msg" id="overlay"></div>
        </div>
      </div>
    </div>
  `;

  gameCanvas = app.querySelector("#arena");
  overlayEl = app.querySelector("#overlay");
  renderer = gameCanvas ? new ArenaRenderer(gameCanvas) : null;

  paintScores();
  app.querySelector("#back-lobby")?.addEventListener("click", () => net.send({ type: "host_back_lobby" }));
  app.querySelector("#rematch")?.addEventListener("click", () => net.send({ type: "host_reset_match" }));

  joystick.setVisible(needJoystick);
  paintArena();
}

function renderGameFrame(): void {
  if (!lobby) return;
  if (!inGamePhase(lobby.phase)) {
    renderLobby();
    return;
  }
  if (!gameCanvas || !renderer || !app.querySelector("#arena")) {
    renderGameShell();
    return;
  }
  paintScores();
  const top = app.querySelector(".brand p");
  if (top && snapshot) top.textContent = `Round ${snapshot.round} · first to ${snapshot.winScore}`;
  paintArena();
}

function paintScores(): void {
  const scores = app.querySelector("#scores");
  if (!scores || !snapshot) return;
  const sorted = [...snapshot.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  scores.innerHTML = sorted
    .map(
      (p) => `
      <div class="score-row ${p.alive || snapshot!.phase === "matchEnd" || snapshot!.phase === "countdown" ? "" : "dead"}">
        <div class="swatch" style="background:${p.colorHex};height:16px"></div>
        <span>${escapeHtml(p.name)}</span>
        <strong>${p.score}</strong>
      </div>`,
    )
    .join("");
}

function paintArena(): void {
  if (!snapshot || !renderer) return;
  const owned = new Set(myPlayers().map((p) => p.id));
  const drawState =
    snapshot.phase === "playing"
      ? { ...snapshot, players: predictor.apply(snapshot, owned, localInputs) }
      : snapshot;
  renderer.draw(drawState);
  if (overlayEl) {
    if (snapshot.phase === "countdown") overlayEl.textContent = String(snapshot.countdown || "Go");
    else if (snapshot.message) overlayEl.textContent = snapshot.message;
    else overlayEl.textContent = "";
  }
  const mine = myPlayers();
  joystick.setVisible(mine.some((p) => p.control === "touch") && snapshot.phase !== "matchEnd");
}

/** Smooth local head between network snapshots */
function predictionLoop(): void {
  if (snapshot?.phase === "playing" && renderer && myPlayers().some((p) => p.control === "touch" || p.control === "keyboard")) {
    paintArena();
  }
  requestAnimationFrame(predictionLoop);
}
requestAnimationFrame(predictionLoop);

window.addEventListener("keydown", (e) => {
  if (!capturing) return;
  e.preventDefault();
  const code = e.code || e.key;
  if (capturing === "left") draftKeys = { ...draftKeys, left: code };
  else draftKeys = { ...draftKeys, right: code };
  capturing = null;
  render();
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

render();
