import { PLAYER_SPEED, TURN_RATE } from "../../shared/constants";
import type { GameSnapshot, PlayerPublic } from "../../shared/types";

/** Instant local feel for your own snake between server snapshots. */
export class LocalPredictor {
  private poses = new Map<string, { x: number; y: number; angle: number }>();
  private lastServer = 0;

  reset(): void {
    this.poses.clear();
    this.lastServer = 0;
  }

  /** Call when a server snapshot arrives — snap owned players to truth. */
  reconcile(state: GameSnapshot, ownedIds: Set<string>): void {
    this.lastServer = performance.now();
    for (const p of state.players) {
      if (!ownedIds.has(p.id) || p.x == null || p.y == null || p.angle == null) {
        this.poses.delete(p.id);
        continue;
      }
      if (!p.alive && state.phase === "playing") {
        this.poses.delete(p.id);
        continue;
      }
      this.poses.set(p.id, { x: p.x, y: p.y, angle: p.angle });
    }
  }

  /** Advance owned players with current input; mutate a copy of players for draw. */
  apply(
    state: GameSnapshot,
    ownedIds: Set<string>,
    inputs: Map<string, { left: boolean; right: boolean }>,
  ): PlayerPublic[] {
    if (state.phase !== "playing") return state.players;

    const now = performance.now();
    // Cap catch-up so a long hitch doesn't teleport
    const dt = Math.min(0.05, Math.max(0, (now - this.lastServer) / 1000));
    this.lastServer = now;

    return state.players.map((p) => {
      if (!ownedIds.has(p.id) || !p.alive || p.x == null || p.y == null || p.angle == null) {
        return p;
      }
      let pose = this.poses.get(p.id);
      if (!pose) {
        pose = { x: p.x, y: p.y, angle: p.angle };
        this.poses.set(p.id, pose);
      }

      const input = inputs.get(p.id);
      if (input) {
        if (input.left && !input.right) pose.angle -= TURN_RATE * (dt * 60);
        if (input.right && !input.left) pose.angle += TURN_RATE * (dt * 60);
      }
      const dist = PLAYER_SPEED * (dt * 60);
      pose.x += Math.cos(pose.angle) * dist;
      pose.y += Math.sin(pose.angle) * dist;

      return { ...p, x: pose.x, y: pose.y, angle: pose.angle };
    });
  }
}
