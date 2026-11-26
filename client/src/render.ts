import type { GameSnapshot } from "../../shared/types";
import { HEAD_RADIUS, TRAIL_WIDTH } from "../../shared/constants";

export class ArenaRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    this.ctx = ctx;
  }

  draw(state: GameSnapshot): void {
    const { width, height } = state.arena;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const ctx = this.ctx;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // subtle inner border like classic CRT playfield
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    for (const seg of state.trails) {
      if (seg.points.length < 2) continue;
      ctx.strokeStyle = seg.colorHex;
      ctx.lineWidth = TRAIL_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(seg.points[0]!.x, seg.points[0]!.y);
      for (let i = 1; i < seg.points.length; i++) {
        ctx.lineTo(seg.points[i]!.x, seg.points[i]!.y);
      }
      ctx.stroke();
    }

    for (const p of state.players) {
      if (p.x == null || p.y == null) continue;
      if (state.phase !== "countdown" && !p.alive) continue;

      ctx.fillStyle = p.colorHex;
      ctx.beginPath();
      ctx.arc(p.x, p.y, HEAD_RADIUS + 0.6, 0, Math.PI * 2);
      ctx.fill();

      // bright tip
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, HEAD_RADIUS * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
