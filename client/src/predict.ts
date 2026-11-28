import { PLAYER_SPEED, TURN_RATE } from "../../shared/constants";
import type { GameSnapshot, PlayerPublic } from "../../shared/types";

type Pose = { x: number; y: number; angle: number };
type Pt = { x: number; y: number };
type TurnInput = { left: boolean; right: boolean };

export type LocalTrail = {
  colorHex: string;
  segments: Pt[][];
};

const SPACING = 1.15;

function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

type TrailState = LocalTrail & { open: boolean; seeded: boolean };

/**
 * Own snake is simulated and drawn entirely on the client.
 * Server snapshots are not blended into the line — that seam was the remaining hitch.
 */
export class LocalPredictor {
  private poses = new Map<string, Pose>();
  private remotes = new Map<string, Pose>();
  private trails = new Map<string, TrailState>();
  private drawing = new Map<string, boolean>();
  private lastApply = 0;

  reset(): void {
    this.poses.clear();
    this.remotes.clear();
    this.trails.clear();
    this.drawing.clear();
    this.lastApply = 0;
  }

  getLocalTrails(): Map<string, LocalTrail> {
    return this.trails;
  }

  reconcile(state: GameSnapshot, ownedIds: Set<string>): void {
    for (const p of state.players) {
      if (p.x == null || p.y == null || p.angle == null) {
        this.poses.delete(p.id);
        this.remotes.delete(p.id);
        this.drawing.delete(p.id);
        continue;
      }

      if (!ownedIds.has(p.id)) {
        if (!this.remotes.has(p.id)) {
          this.remotes.set(p.id, { x: p.x, y: p.y, angle: p.angle });
        }
        if (!p.alive && state.phase === "playing") this.remotes.delete(p.id);
        continue;
      }

      this.drawing.set(p.id, Boolean(p.drawing) && p.alive && state.phase === "playing");

      if (!this.poses.has(p.id)) {
        this.poses.set(p.id, { x: p.x, y: p.y, angle: p.angle });
      }

      if ((!p.alive && state.phase === "playing") || state.phase !== "playing") {
        const trail = this.trails.get(p.id);
        if (trail) trail.open = false;
      }
    }
  }

  private seedTrail(state: GameSnapshot, playerId: string, colorHex: string, drawing: boolean): TrailState {
    const existing = this.trails.get(playerId);
    if (existing?.seeded) return existing;

    const segments = state.trails
      .filter((s) => s.playerId === playerId)
      .map((s) => s.points.map((pt) => ({ x: pt.x, y: pt.y })));

    const trail: TrailState = {
      colorHex,
      segments,
      open: drawing && segments.length > 0,
      seeded: true,
    };
    this.trails.set(playerId, trail);
    return trail;
  }

  private append(trail: TrailState, x: number, y: number, drawing: boolean): void {
    if (!drawing) {
      trail.open = false;
      return;
    }

    if (!trail.open) {
      trail.segments.push([{ x, y }]);
      trail.open = true;
      return;
    }

    const seg = trail.segments[trail.segments.length - 1];
    if (!seg) {
      trail.segments.push([{ x, y }]);
      return;
    }

    const last = seg[seg.length - 1];
    if (!last) {
      seg.push({ x, y });
      return;
    }

    const dist = Math.hypot(x - last.x, y - last.y);
    if (dist < SPACING) {
      last.x = x;
      last.y = y;
      return;
    }
    seg.push({ x, y });
  }

  apply(
    state: GameSnapshot,
    ownedIds: Set<string>,
    inputs: Map<string, TurnInput>,
  ): PlayerPublic[] {
    if (state.phase !== "playing" && state.phase !== "countdown") return state.players;

    const now = performance.now();
    const dt = this.lastApply ? Math.min(0.05, Math.max(0, (now - this.lastApply) / 1000)) : 0;
    this.lastApply = now;
    const ticks = dt * 60;
    const remoteBlend = 1 - Math.exp(-18 * Math.max(dt, 1 / 144));

    return state.players.map((p) => {
      if (p.x == null || p.y == null || p.angle == null) return p;

      if (!ownedIds.has(p.id)) {
        if (!p.alive && state.phase === "playing") {
          this.remotes.delete(p.id);
          return p;
        }
        let remote = this.remotes.get(p.id);
        if (!remote) {
          remote = { x: p.x, y: p.y, angle: p.angle };
          this.remotes.set(p.id, remote);
          return p;
        }
        remote.x += (p.x - remote.x) * remoteBlend;
        remote.y += (p.y - remote.y) * remoteBlend;
        remote.angle += shortestAngleDelta(remote.angle, p.angle) * remoteBlend;
        return { ...p, x: remote.x, y: remote.y, angle: remote.angle };
      }

      if (state.phase !== "playing" || !p.alive) {
        const trail = this.trails.get(p.id);
        if (trail) trail.open = false;
        const pose = this.poses.get(p.id);
        if (!pose) return p;
        return { ...p, x: pose.x, y: pose.y, angle: pose.angle };
      }

      let pose = this.poses.get(p.id);
      if (!pose) {
        pose = { x: p.x, y: p.y, angle: p.angle };
        this.poses.set(p.id, pose);
      }

      if (ticks > 0) {
        const input = inputs.get(p.id);
        if (input?.left && !input.right) pose.angle -= TURN_RATE * ticks;
        if (input?.right && !input.left) pose.angle += TURN_RATE * ticks;
        const dist = PLAYER_SPEED * ticks;
        pose.x += Math.cos(pose.angle) * dist;
        pose.y += Math.sin(pose.angle) * dist;
      }

      const drawing = this.drawing.get(p.id) ?? Boolean(p.drawing);
      const trail = this.seedTrail(state, p.id, p.colorHex, drawing);
      this.append(trail, pose.x, pose.y, drawing);

      return { ...p, x: pose.x, y: pose.y, angle: pose.angle };
    });
  }
}
