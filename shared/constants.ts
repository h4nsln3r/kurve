export const PORT = 3847;
export const MAX_PLAYERS = 8;
export const TICK_RATE = 60;
/** @deprecated rates live in server/index.ts (pose vs trail cadence) */
export const BROADCAST_EVERY = 2;

export const ARENA_WIDTH = 900;
export const ARENA_HEIGHT = 700;
export const WALL_MARGIN = 2;

export const PLAYER_SPEED = 2.35;
export const TURN_RATE = 0.055;
export const TRAIL_WIDTH = 3.2;
export const HEAD_RADIUS = 3.4;

/** After this many points of trail, open a gap */
export const GAP_EVERY_MIN = 95;
export const GAP_EVERY_MAX = 170;
/** Gap length in world units */
export const GAP_LENGTH_MIN = 10;
export const GAP_LENGTH_MAX = 16;

export const ROUND_COUNTDOWN = 3;
export const ROUND_END_PAUSE = 2.2;

/** Classic win target grows with player count */
export function winScoreForPlayers(n: number): number {
  return Math.max(5, n * 5 - 5);
}

export const COLORS = [
  { id: "red", hex: "#ff2a2a", name: "Red" },
  { id: "yellow", hex: "#ffe14a", name: "Yellow" },
  { id: "orange", hex: "#ff8c1a", name: "Orange" },
  { id: "green", hex: "#2dff4a", name: "Green" },
  { id: "blue", hex: "#3aa0ff", name: "Blue" },
  { id: "purple", hex: "#c44dff", name: "Purple" },
  { id: "cyan", hex: "#2dfff0", name: "Cyan" },
  { id: "white", hex: "#f4f4f4", name: "White" },
] as const;

export type ColorId = (typeof COLORS)[number]["id"];
