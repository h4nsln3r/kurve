import type { ColorId } from "./constants.js";

export type GamePhase = "lobby" | "countdown" | "playing" | "roundEnd" | "matchEnd";

export interface KeyBinding {
  left: string;
  right: string;
}

export interface PlayerPublic {
  id: string;
  socketId: string | null;
  name: string;
  colorId: ColorId;
  colorHex: string;
  score: number;
  alive: boolean;
  ready: boolean;
  isLocalOnly: boolean;
  control: "keyboard" | "touch";
  keys?: KeyBinding;
  /** Present while in a round */
  x?: number;
  y?: number;
  angle?: number;
  drawing?: boolean;
}

export interface TrailSegment {
  playerId: string;
  colorHex: string;
  points: Array<{ x: number; y: number }>;
}

export interface NetworkInfo {
  /** Socket/API server port (always 3847) */
  port: number;
  /** Port guests should open in the browser (5173 in dev, 3847 in production) */
  joinPort: number;
  urls: string[];
  preferredUrl: string | null;
  mode: "development" | "production";
}

export interface LobbyState {
  phase: GamePhase;
  players: PlayerPublic[];
  hostSocketId: string | null;
  winScore: number;
  round: number;
  countdown: number;
  winnerId: string | null;
  network: NetworkInfo;
  maxPlayers: number;
}

export interface GameSnapshot {
  phase: GamePhase;
  players: PlayerPublic[];
  trails: TrailSegment[];
  winScore: number;
  round: number;
  countdown: number;
  winnerId: string | null;
  message: string | null;
  arena: { width: number; height: number };
}

export type ClientToServer =
  | { type: "claim_host" }
  | { type: "release_host" }
  | { type: "add_player"; name: string; colorId: ColorId; control: "keyboard" | "touch"; keys?: KeyBinding }
  | { type: "remove_player"; playerId: string }
  | { type: "set_ready"; playerId: string; ready: boolean }
  | { type: "update_keys"; playerId: string; keys: KeyBinding }
  | { type: "host_start" }
  | { type: "host_reset_match" }
  | { type: "host_back_lobby" }
  | { type: "input"; playerId: string; left: boolean; right: boolean };

export type ServerToClient =
  | { type: "welcome"; socketId: string; isLocalHost: boolean; state: LobbyState }
  | { type: "lobby"; state: LobbyState }
  | { type: "snapshot"; state: GameSnapshot }
  | { type: "error"; message: string };
