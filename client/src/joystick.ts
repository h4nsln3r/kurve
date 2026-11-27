/**
 * Classic Achtung-style mobile steering: hold LEFT / RIGHT.
 * (A free stick feels wrong because the game only has binary turn.)
 */
export class VirtualJoystick {
  readonly root: HTMLDivElement;
  private leftBtn: HTMLButtonElement;
  private rightBtn: HTMLButtonElement;
  private leftPointers = new Set<number>();
  private rightPointers = new Set<number>();
  left = false;
  right = false;
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    this.root = document.createElement("div");
    this.root.className = "joystick-root";
    this.root.innerHTML = `
      <button type="button" class="steer-pad steer-left" aria-label="Turn left">
        <span aria-hidden="true">◀</span>
        <small aria-hidden="true">LEFT</small>
      </button>
      <button type="button" class="steer-pad steer-right" aria-label="Turn right">
        <span aria-hidden="true">▶</span>
        <small aria-hidden="true">RIGHT</small>
      </button>
    `;
    this.leftBtn = this.root.querySelector(".steer-left")!;
    this.rightBtn = this.root.querySelector(".steer-right")!;

    // Kill iOS/Android long-press "Copy" / callout menus on the pads
    const blockBrowserChrome = (e: Event) => {
      e.preventDefault();
    };
    this.root.addEventListener("contextmenu", blockBrowserChrome);
    this.root.addEventListener("selectstart", blockBrowserChrome);
    this.root.addEventListener("dragstart", blockBrowserChrome);

    this.bindPad(this.leftBtn, "left");
    this.bindPad(this.rightBtn, "right");

    // Extra: tap anywhere on the left/right half of the control bar
    this.root.addEventListener(
      "pointerdown",
      (e) => {
        if (e.target !== this.root) return;
        e.preventDefault();
        const rect = this.root.getBoundingClientRect();
        const side = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
        this.press(side, e.pointerId, this.root);
      },
      { passive: false },
    );
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle("visible", v);
    document.documentElement.classList.toggle("kurve-touch-play", v);
    if (!v) this.clearAll();
  }

  private bindPad(el: HTMLElement, side: "left" | "right"): void {
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.press(side, e.pointerId, el);
      },
      { passive: false },
    );
  }

  private press(side: "left" | "right", pointerId: number, el: HTMLElement): void {
    const set = side === "left" ? this.leftPointers : this.rightPointers;
    if (set.has(pointerId)) return;
    set.add(pointerId);
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    this.sync();

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      set.delete(pointerId);
      this.sync();
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  private sync(): void {
    const nextLeft = this.leftPointers.size > 0;
    const nextRight = this.rightPointers.size > 0;
    const changed = nextLeft !== this.left || nextRight !== this.right;
    this.left = nextLeft;
    this.right = nextRight;
    this.leftBtn.classList.toggle("active", this.left);
    this.rightBtn.classList.toggle("active", this.right);
    if (changed) this.onChange();
  }

  private clearAll(): void {
    this.leftPointers.clear();
    this.rightPointers.clear();
    this.sync();
  }
}
