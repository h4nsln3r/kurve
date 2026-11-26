import type { KeyBinding, PlayerPublic } from "../../shared/types";

export type InputMap = Map<string, { left: boolean; right: boolean }>;

export class InputManager {
  private held = new Set<string>();
  private players: PlayerPublic[] = [];
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.held.add(normalizeKey(e.code || e.key));
      this.onChange();
    });
    window.addEventListener("keyup", (e) => {
      this.held.delete(normalizeKey(e.code || e.key));
      this.onChange();
    });
    window.addEventListener("blur", () => {
      this.held.clear();
      this.onChange();
    });
  }

  setPlayers(players: PlayerPublic[]): void {
    this.players = players;
  }

  sample(): InputMap {
    const map: InputMap = new Map();
    for (const p of this.players) {
      if (p.control !== "keyboard" || !p.keys) continue;
      map.set(p.id, {
        left: this.held.has(normalizeKey(p.keys.left)),
        right: this.held.has(normalizeKey(p.keys.right)),
      });
    }
    return map;
  }
}

export function normalizeKey(k: string): string {
  return k.length === 1 ? k.toLowerCase() : k;
}

export function prettyKey(code: string): string {
  const map: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "Space",
    ShiftLeft: "L-Shift",
    ShiftRight: "R-Shift",
    ControlLeft: "L-Ctrl",
    ControlRight: "R-Ctrl",
    AltLeft: "L-Alt",
    AltRight: "R-Alt",
  };
  if (map[code]) return map[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function defaultKeysForIndex(i: number): KeyBinding {
  const presets: KeyBinding[] = [
    { left: "ArrowLeft", right: "ArrowRight" },
    { left: "KeyA", right: "KeyD" },
    { left: "KeyJ", right: "KeyL" },
    { left: "Numpad4", right: "Numpad6" },
    { left: "KeyF", right: "KeyH" },
    { left: "KeyC", right: "KeyB" },
    { left: "Comma", right: "Period" },
    { left: "KeyZ", right: "KeyX" },
  ];
  return presets[i % presets.length]!;
}

export function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}
