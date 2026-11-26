import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COLORS,
  GAP_EVERY_MAX,
  GAP_EVERY_MIN,
  GAP_LENGTH_MAX,
  GAP_LENGTH_MIN,
  HEAD_RADIUS,
  PLAYER_SPEED,
  ROUND_COUNTDOWN,
  ROUND_END_PAUSE,
  TRAIL_WIDTH,
  TURN_RATE,
  WALL_MARGIN,
  winScoreForPlayers,
  type ColorId,
} from "../../shared/constants.js";
import type {
  GamePhase,
  GameSnapshot,
  KeyBinding,
  PlayerPublic,
  TrailSegment,
} from "../../shared/types.js";

interface InternalPlayer {
  id: string;
  socketId: string | null;
  name: string;
  colorId: ColorId;
  colorHex: string;
  score: number;
  ready: boolean;
  isLocalOnly: boolean;
  control: "keyboard" | "touch";
  keys?: KeyBinding;
  alive: boolean;
  x: number;
  y: number;
  angle: number;
  left: boolean;
  right: boolean;
  drawing: boolean;
  distSinceGap: number;
  nextGapAt: number;
  gapRemaining: number;
}

interface TrailPoint {
  x: number;
  y: number;
  playerId: string;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function colorHex(id: ColorId): string {
  return COLORS.find((c) => c.id === id)?.hex ?? "#ffffff";
}

export class KurveEngine {
  phase: GamePhase = "lobby";
  players = new Map<string, InternalPlayer>();
  hostSocketId: string | null = null;
  round = 0;
  countdown = 0;
  winnerId: string | null = null;
  message: string | null = null;
  private trails: TrailPoint[] = [];
  private trailSegments: TrailSegment[] = [];
  private openSegments = new Map<string, TrailSegment>();
  private phaseTimer = 0;

  get winScore(): number {
    return winScoreForPlayers(Math.max(2, this.players.size));
  }

  setHost(socketId: string | null): void {
    this.hostSocketId = socketId;
  }

  addPlayer(opts: {
    id: string;
    socketId: string | null;
    name: string;
    colorId: ColorId;
    control: "keyboard" | "touch";
    keys?: KeyBinding;
    isLocalOnly?: boolean;
  }): InternalPlayer {
    if (this.players.size >= 8) throw new Error("Lobby is full (max 8).");
    if ([...this.players.values()].some((p) => p.colorId === opts.colorId)) {
      throw new Error("That color is already taken.");
    }
    if (this.phase !== "lobby" && this.phase !== "matchEnd") {
      throw new Error("Wait for the lobby before joining.");
    }

    const player: InternalPlayer = {
      id: opts.id,
      socketId: opts.socketId,
      name: opts.name.trim() || "Player",
      colorId: opts.colorId,
      colorHex: colorHex(opts.colorId),
      score: 0,
      ready: false,
      isLocalOnly: Boolean(opts.isLocalOnly),
      control: opts.control,
      keys: opts.keys,
      alive: false,
      x: 0,
      y: 0,
      angle: 0,
      left: false,
      right: false,
      drawing: false,
      distSinceGap: 0,
      nextGapAt: rand(GAP_EVERY_MIN, GAP_EVERY_MAX),
      gapRemaining: 0,
    };
    this.players.set(player.id, player);
    return player;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    if (this.phase === "playing" || this.phase === "countdown") {
      // keep going; treat as death already handled via disconnect path
    }
  }

  setReady(playerId: string, ready: boolean): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.ready = ready;
  }

  updateKeys(playerId: string, keys: KeyBinding): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.keys = keys;
  }

  setInput(playerId: string, left: boolean, right: boolean): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive) return;
    p.left = left;
    p.right = right;
  }

  canStart(): { ok: boolean; reason?: string } {
    if (this.players.size < 2) return { ok: false, reason: "Need at least 2 players." };
    const notReady = [...this.players.values()].filter((p) => !p.ready);
    if (notReady.length) {
      return { ok: false, reason: `Waiting for: ${notReady.map((p) => p.name).join(", ")}` };
    }
    return { ok: true };
  }

  startMatch(): void {
    const check = this.canStart();
    if (!check.ok) throw new Error(check.reason);
    for (const p of this.players.values()) p.score = 0;
    this.winnerId = null;
    this.round = 0;
    this.beginRound();
  }

  resetMatchToLobby(): void {
    this.phase = "lobby";
    this.round = 0;
    this.winnerId = null;
    this.message = null;
    this.clearArena();
    for (const p of this.players.values()) {
      p.ready = false;
      p.alive = false;
      p.score = 0;
      p.left = false;
      p.right = false;
    }
  }

  backToLobbyKeepScores(): void {
    this.phase = "lobby";
    this.message = null;
    this.clearArena();
    for (const p of this.players.values()) {
      p.ready = false;
      p.alive = false;
      p.left = false;
      p.right = false;
    }
  }

  private clearArena(): void {
    this.trails = [];
    this.trailSegments = [];
    this.openSegments.clear();
  }

  private beginRound(): void {
    this.round += 1;
    this.clearArena();
    this.phase = "countdown";
    this.countdown = ROUND_COUNTDOWN;
    this.phaseTimer = ROUND_COUNTDOWN;
    this.message = `Round ${this.round}`;

    const list = [...this.players.values()];
    const margin = 80;
    for (const p of list) {
      p.alive = true;
      p.left = false;
      p.right = false;
      p.drawing = false;
      p.distSinceGap = 0;
      p.nextGapAt = rand(GAP_EVERY_MIN, GAP_EVERY_MAX);
      p.gapRemaining = 0;
      p.x = rand(margin, ARENA_WIDTH - margin);
      p.y = rand(margin, ARENA_HEIGHT - margin);
      p.angle = rand(0, Math.PI * 2);
    }
  }

  update(dt: number): void {
    if (this.phase === "lobby" || this.phase === "matchEnd") return;

    if (this.phase === "countdown") {
      this.phaseTimer -= dt;
      this.countdown = Math.max(0, Math.ceil(this.phaseTimer));
      if (this.phaseTimer <= 0) {
        this.phase = "playing";
        this.message = null;
        for (const p of this.players.values()) {
          if (p.alive) this.startDrawing(p);
        }
      }
      return;
    }

    if (this.phase === "roundEnd") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this.winnerId) {
          this.phase = "matchEnd";
          const w = this.players.get(this.winnerId);
          this.message = w ? `${w.name} wins the match!` : "Match over";
        } else {
          this.beginRound();
        }
      }
      return;
    }

    if (this.phase === "playing") {
      this.simulate(dt);
    }
  }

  private simulate(dt: number): void {
    // fixed-step feel: integrate with frame dt capped
    const step = Math.min(dt, 0.05);
    const alive = [...this.players.values()].filter((p) => p.alive);

    for (const p of alive) {
      if (p.left && !p.right) p.angle -= TURN_RATE * (step * 60);
      if (p.right && !p.left) p.angle += TURN_RATE * (step * 60);

      const dist = PLAYER_SPEED * (step * 60);
      const nx = p.x + Math.cos(p.angle) * dist;
      const ny = p.y + Math.sin(p.angle) * dist;

      // gap timing
      if (p.gapRemaining > 0) {
        p.gapRemaining -= dist;
        p.drawing = false;
        if (p.gapRemaining <= 0) {
          p.gapRemaining = 0;
          p.distSinceGap = 0;
          p.nextGapAt = rand(GAP_EVERY_MIN, GAP_EVERY_MAX);
          this.startDrawing(p);
        }
      } else {
        p.distSinceGap += dist;
        if (p.distSinceGap >= p.nextGapAt) {
          this.closeDrawing(p);
          p.drawing = false;
          p.gapRemaining = rand(GAP_LENGTH_MIN, GAP_LENGTH_MAX);
        }
      }

      if (this.hitsWall(nx, ny) || this.hitsTrail(nx, ny, p.id)) {
        this.killPlayer(p);
        continue;
      }

      if (p.drawing) {
        this.pushPoint(p, nx, ny);
      }

      p.x = nx;
      p.y = ny;
    }

    this.checkRoundEnd();
  }

  private startDrawing(p: InternalPlayer): void {
    p.drawing = true;
    const seg: TrailSegment = {
      playerId: p.id,
      colorHex: p.colorHex,
      points: [{ x: p.x, y: p.y }],
    };
    this.openSegments.set(p.id, seg);
    this.trailSegments.push(seg);
  }

  private closeDrawing(p: InternalPlayer): void {
    this.openSegments.delete(p.id);
  }

  private pushPoint(p: InternalPlayer, x: number, y: number): void {
    const seg = this.openSegments.get(p.id);
    if (!seg) return;
    const last = seg.points[seg.points.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < 1.2) {
      last.x = x;
      last.y = y;
    } else {
      seg.points.push({ x, y });
    }
    this.trails.push({ x, y, playerId: p.id });
  }

  private hitsWall(x: number, y: number): boolean {
    return (
      x - HEAD_RADIUS < WALL_MARGIN ||
      y - HEAD_RADIUS < WALL_MARGIN ||
      x + HEAD_RADIUS > ARENA_WIDTH - WALL_MARGIN ||
      y + HEAD_RADIUS > ARENA_HEIGHT - WALL_MARGIN
    );
  }

  private hitsTrail(x: number, y: number, selfId: string): boolean {
    const hitR = HEAD_RADIUS + TRAIL_WIDTH * 0.45;
    const hitR2 = hitR * hitR;
    // Skip recent own points so head doesn't collide with just-drawn trail
    const skipOwn = 14;
    let ownSeen = 0;

    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i]!;
      if (t.playerId === selfId) {
        ownSeen++;
        if (ownSeen <= skipOwn) continue;
      }
      const dx = t.x - x;
      const dy = t.y - y;
      if (dx * dx + dy * dy <= hitR2) return true;
    }
    return false;
  }

  killPlayerById(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) this.killPlayer(p);
  }

  private killPlayer(p: InternalPlayer): void {
    if (!p.alive) return;
    p.alive = false;
    p.drawing = false;
    this.closeDrawing(p);

    for (const other of this.players.values()) {
      if (other.alive) other.score += 1;
    }
  }

  private checkRoundEnd(): void {
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length > 1) return;

    if (alive.length === 1) {
      // last one already got points from each death; optional bonus not needed
      this.message = `${alive[0]!.name} survives`;
    } else {
      this.message = "Draw";
    }

    const champion = [...this.players.values()].find((p) => p.score >= this.winScore);
    if (champion) {
      this.winnerId = champion.id;
      this.message = `${champion.name} reaches ${this.winScore}!`;
    } else {
      this.winnerId = null;
    }

    this.phase = "roundEnd";
    this.phaseTimer = ROUND_END_PAUSE;
  }

  toLobbyPlayers(): PlayerPublic[] {
    return [...this.players.values()].map((p) => this.toPublic(p, false));
  }

  snapshot(): GameSnapshot {
    return {
      phase: this.phase,
      players: [...this.players.values()].map((p) => this.toPublic(p, true)),
      trails: this.trailSegments.map((s) => ({
        playerId: s.playerId,
        colorHex: s.colorHex,
        points: s.points,
      })),
      winScore: this.winScore,
      round: this.round,
      countdown: this.countdown,
      winnerId: this.winnerId,
      message: this.message,
      arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    };
  }

  private toPublic(p: InternalPlayer, withPose: boolean): PlayerPublic {
    const base: PlayerPublic = {
      id: p.id,
      socketId: p.socketId,
      name: p.name,
      colorId: p.colorId,
      colorHex: p.colorHex,
      score: p.score,
      alive: p.alive,
      ready: p.ready,
      isLocalOnly: p.isLocalOnly,
      control: p.control,
      keys: p.keys,
    };
    if (withPose && (this.phase === "countdown" || this.phase === "playing" || this.phase === "roundEnd")) {
      base.x = p.x;
      base.y = p.y;
      base.angle = p.angle;
      base.drawing = p.drawing;
    }
    return base;
  }
}
