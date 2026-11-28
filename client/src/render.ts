import type { GameSnapshot, TrailSegment } from "../../shared/types";
import { HEAD_RADIUS, TRAIL_WIDTH } from "../../shared/constants";
import type { LocalTrail } from "./predict";

type Pt = { x: number; y: number };

/**
 * Arena renderer with an offscreen trail cache.
 * Tip bridge is redrawn fresh every frame (no tip history → no leftover ghost lines).
 */
export class ArenaRenderer {
  private ctx: CanvasRenderingContext2D;
  private trailLayer: HTMLCanvasElement;
  private trailCtx: CanvasRenderingContext2D;
  private cachedRound = -1;
  private cachedSegLens: number[] = [];
  private cachedSegMeta: string[] = [];
  private hiddenKey = "";
  private localLayer: HTMLCanvasElement;
  private localCtx: CanvasRenderingContext2D;
  private localRound = -1;
  private localLens = new Map<string, number[]>();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas unsupported");
    this.ctx = ctx;

    this.trailLayer = document.createElement("canvas");
    const trailCtx = this.trailLayer.getContext("2d");
    if (!trailCtx) throw new Error("Canvas unsupported");
    this.trailCtx = trailCtx;

    this.localLayer = document.createElement("canvas");
    const localCtx = this.localLayer.getContext("2d");
    if (!localCtx) throw new Error("Canvas unsupported");
    this.localCtx = localCtx;
  }

  draw(state: GameSnapshot, localTrails?: Map<string, LocalTrail>): void {
    const { width, height } = state.arena;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (this.trailLayer.width !== width || this.trailLayer.height !== height) {
      this.trailLayer.width = width;
      this.trailLayer.height = height;
      this.invalidateTrailCache();
    }
    if (this.localLayer.width !== width || this.localLayer.height !== height) {
      this.localLayer.width = width;
      this.localLayer.height = height;
      this.localRound = -1;
      this.localLens.clear();
    }

    const ctx = this.ctx;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    this.updateTrailLayer(state);
    ctx.drawImage(this.trailLayer, 0, 0);

    if (state.phase === "playing") {
      this.drawOwnedTips(state, localTrails);
      this.drawRemoteTips(state, localTrails);
    }

    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    for (const p of state.players) {
      if (p.x == null || p.y == null) continue;
      if (state.phase !== "countdown" && !p.alive) continue;

      ctx.fillStyle = p.colorHex;
      ctx.beginPath();
      ctx.arc(p.x, p.y, HEAD_RADIUS + 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, HEAD_RADIUS * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Smooth owned tip: server trail stays visible, local points only cover the newest bit. */
  private drawOwnedTips(state: GameSnapshot, localTrails?: Map<string, LocalTrail>): void {
    if (!localTrails) return;
    const ctx = this.ctx;

    for (const [id, trail] of localTrails) {
      const p = state.players.find((pl) => pl.id === id);
      if (!p?.drawing || p.x == null || p.y == null) continue;

      let serverTip: Pt | null = null;
      for (let i = state.trails.length - 1; i >= 0; i--) {
        const seg = state.trails[i]!;
        if (seg.playerId !== id || !seg.points.length) continue;
        serverTip = seg.points[seg.points.length - 1]!;
        break;
      }
      if (!serverTip) continue;

      const seg = trail.segments[trail.segments.length - 1];
      let ahead: Pt[] = [];
      if (seg?.length) {
        let nearest = 0;
        let best = Infinity;
        for (let i = 0; i < seg.length; i++) {
          const d = Math.hypot(seg[i]!.x - serverTip.x, seg[i]!.y - serverTip.y);
          if (d < best) {
            best = d;
            nearest = i;
          }
        }
        ahead = seg.slice(nearest + 1);
      }

      ctx.strokeStyle = trail.colorHex || p.colorHex;
      ctx.lineWidth = TRAIL_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(serverTip.x, serverTip.y);
      for (const pt of ahead.slice(-24)) ctx.lineTo(pt.x, pt.y);
      if (Math.hypot(p.x - serverTip.x, p.y - serverTip.y) > 0.3) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  /** Short bridge for other players. */
  private drawRemoteTips(state: GameSnapshot, localTrails?: Map<string, LocalTrail>): void {
    const ctx = this.ctx;
    const owned = new Set(localTrails ? [...localTrails.keys()] : []);
    const drawn = new Set<string>();

    for (let i = state.trails.length - 1; i >= 0; i--) {
      const seg = state.trails[i]!;
      if (owned.has(seg.playerId) || drawn.has(seg.playerId)) continue;
      drawn.add(seg.playerId);

      const p = state.players.find((pl) => pl.id === seg.playerId);
      if (!p?.drawing || p.x == null || p.y == null || seg.points.length < 1) continue;

      const last = seg.points[seg.points.length - 1]!;
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      if (dist < 0.4 || dist > 18) continue;

      ctx.strokeStyle = seg.colorHex;
      ctx.lineWidth = TRAIL_WIDTH;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  private invalidateTrailCache(): void {
    this.cachedRound = -1;
    this.cachedSegLens = [];
    this.cachedSegMeta = [];
  }

  private segMeta(seg: TrailSegment): string {
    return `${seg.playerId}:${seg.colorHex}`;
  }

  private strokeSegment(ctx: CanvasRenderingContext2D, seg: TrailSegment, fromIndex: number): void {
    const pts = seg.points;
    if (pts.length < 2) return;
    const start = Math.max(0, Math.min(fromIndex, pts.length - 2));
    ctx.strokeStyle = seg.colorHex;
    ctx.lineWidth = TRAIL_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[start]!.x, pts[start]!.y);
    for (let i = start + 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]!.x, pts[i]!.y);
    }
    ctx.stroke();
  }

  private redrawAllTrails(state: GameSnapshot): void {
    const ctx = this.trailCtx;
    ctx.clearRect(0, 0, this.trailLayer.width, this.trailLayer.height);
    this.cachedSegLens = [];
    this.cachedSegMeta = [];
    for (const seg of state.trails) {
      this.strokeSegment(ctx, seg, 0);
      this.cachedSegLens.push(seg.points.length);
      this.cachedSegMeta.push(this.segMeta(seg));
    }
    this.cachedRound = state.round;
  }

  private updateTrailLayer(state: GameSnapshot): void {
    const trails = state.trails;
    const needsFull =
      state.round !== this.cachedRound ||
      trails.length < this.cachedSegLens.length ||
      trails.some((seg, i) => this.cachedSegMeta[i] !== this.segMeta(seg)) ||
      trails.some((seg, i) => seg.points.length < (this.cachedSegLens[i] ?? 0));

    if (needsFull) {
      this.redrawAllTrails(state);
      return;
    }

    const ctx = this.trailCtx;
    for (let i = 0; i < trails.length; i++) {
      const seg = trails[i]!;
      const prevLen = this.cachedSegLens[i];
      if (prevLen === undefined) {
        this.strokeSegment(ctx, seg, 0);
        this.cachedSegLens[i] = seg.points.length;
        this.cachedSegMeta[i] = this.segMeta(seg);
        continue;
      }
      if (seg.points.length > prevLen) {
        this.strokeSegment(ctx, seg, Math.max(0, prevLen - 1));
        this.cachedSegLens[i] = seg.points.length;
      }
    }
  }
}
