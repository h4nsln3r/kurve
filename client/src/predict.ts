import { PLAYER_SPEED, TURN_RATE } from "../../shared/constants";
import type { GameSnapshot, PlayerPublic } from "../../shared/types";

type Pose = { x: number; y: number; angle: number };
type TurnInput = { left: boolean; right: boolean };
type Correction = { x: number; y: number; a: number };

export type LocalTrail = {
  colorHex: string;
  segments: { x: number; y: number }[][];
};

/** Sideways drift smaller than this is left alone. */
const CROSS_DEAD = 1.4;
/** Being this far ahead of the server is normal latency, not an error. */
const AHEAD_OK = 16;
/** Only pull the heading if it has clearly left the server curve. */
const ANGLE_DEAD = 0.45;
const SNAP_DISTANCE = 42;
/** Slow enough that a correction is not a visible hitch. */
const CORRECT_RATE = 4.5;

function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The dot moves every frame from local input, so a late Wi-Fi packet cannot freeze it.
 * Server snapshots only nudge it back onto the line. They do not rewind it.
 */
export class LocalPredictor {
  private poses = new Map<string, Pose>();
  private corrections = new Map<string, Correction>();
  private remotes = new Map<string, Pose>();
  private lastApply = 0;

  reset(): void {
    this.poses.clear();
    this.corrections.clear();
    this.remotes.clear();
    this.lastApply = 0;
  }

  /** Kept so the renderer can skip a second tip on your own snake. */
  getLocalTrails(): Map<string, LocalTrail> {
    return new Map();
  }

  reconcile(state: GameSnapshot, ownedIds: Set<string>): void {
    for (const p of state.players) {
      if (p.x == null || p.y == null || p.angle == null) {
        this.poses.delete(p.id);
        this.corrections.delete(p.id);
        this.remotes.delete(p.id);
        continue;
      }

      if (!ownedIds.has(p.id)) {
        if (!this.remotes.has(p.id)) {
          this.remotes.set(p.id, { x: p.x, y: p.y, angle: p.angle });
        }
        if (!p.alive && state.phase === "playing") this.remotes.delete(p.id);
        continue;
      }

      if (!p.alive && state.phase === "playing") {
        this.poses.delete(p.id);
        this.corrections.delete(p.id);
        continue;
      }

      const pose = this.poses.get(p.id);
      if (!pose) {
        this.poses.set(p.id, { x: p.x, y: p.y, angle: p.angle });
        continue;
      }

      const dx = p.x - pose.x;
      const dy = p.y - pose.y;
      const dist = Math.hypot(dx, dy);
      if (dist > SNAP_DISTANCE) {
        pose.x = p.x;
        pose.y = p.y;
        pose.angle = p.angle;
        this.corrections.delete(p.id);
        continue;
      }

      const fx = Math.cos(pose.angle);
      const fy = Math.sin(pose.angle);
      const along = dx * fx + dy * fy;
      const cross = dx * -fy + dy * fx;

      let cx = 0;
      let cy = 0;
      if (Math.abs(cross) > CROSS_DEAD) {
        cx += -fy * cross;
        cy += fx * cross;
      }
      // Server is ahead of the dot: catch up. Being ahead ourselves is just latency.
      if (along > 3) {
        cx += fx * along;
        cy += fy * along;
      } else if (along < -AHEAD_OK) {
        const extra = along + AHEAD_OK;
        cx += fx * extra;
        cy += fy * extra;
      }

      const da = shortestAngleDelta(pose.angle, p.angle);
      this.corrections.set(p.id, {
        x: cx,
        y: cy,
        a: Math.abs(da) > ANGLE_DEAD ? da : 0,
      });
    }
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
    const blend = 1 - Math.exp(-CORRECT_RATE * dt);
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

      if (state.phase !== "playing" || !p.alive) return p;

      let pose = this.poses.get(p.id);
      if (!pose) {
        pose = { x: p.x, y: p.y, angle: p.angle };
        this.poses.set(p.id, pose);
      }

      const input = inputs.get(p.id);
      if (ticks > 0) {
        if (input?.left && !input.right) pose.angle -= TURN_RATE * ticks;
        if (input?.right && !input.left) pose.angle += TURN_RATE * ticks;
        const dist = PLAYER_SPEED * ticks;
        pose.x += Math.cos(pose.angle) * dist;
        pose.y += Math.sin(pose.angle) * dist;
      }

      const err = this.corrections.get(p.id);
      if (err && blend > 0) {
        pose.x += err.x * blend;
        pose.y += err.y * blend;
        pose.angle += err.a * blend;
        err.x *= 1 - blend;
        err.y *= 1 - blend;
        err.a *= 1 - blend;
        if (Math.hypot(err.x, err.y) < 0.05 && Math.abs(err.a) < 0.001) {
          this.corrections.delete(p.id);
        }
      }

      return { ...p, x: pose.x, y: pose.y, angle: pose.angle };
    });
  }
}
