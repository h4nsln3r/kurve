export class VirtualJoystick {
  readonly root: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private active = false;
  private pointerId: number | null = null;
  left = false;
  right = false;
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    this.root = document.createElement("div");
    this.root.className = "joystick-root";
    this.root.innerHTML = `
      <div class="joystick-base">
        <div class="joystick-knob"></div>
      </div>
    `;
    this.base = this.root.querySelector(".joystick-base")!;
    this.knob = this.root.querySelector(".joystick-knob")!;

    this.root.addEventListener("pointerdown", (e) => this.down(e));
    this.root.addEventListener("pointermove", (e) => this.move(e));
    this.root.addEventListener("pointerup", (e) => this.up(e));
    this.root.addEventListener("pointercancel", (e) => this.up(e));
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle("visible", v);
    if (!v) this.reset();
  }

  private down(e: PointerEvent): void {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.root.setPointerCapture(e.pointerId);
    this.active = true;
    this.move(e);
  }

  private move(e: PointerEvent): void {
    if (!this.active || e.pointerId !== this.pointerId) return;
    const rect = this.base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = rect.width * 0.32;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const dead = max * 0.22;
    const nextLeft = dx < -dead;
    const nextRight = dx > dead;
    if (nextLeft !== this.left || nextRight !== this.right) {
      this.left = nextLeft;
      this.right = nextRight;
      this.onChange();
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.active = false;
    this.reset();
  }

  private reset(): void {
    this.knob.style.transform = "translate(-50%, -50%)";
    if (this.left || this.right) {
      this.left = false;
      this.right = false;
      this.onChange();
    }
  }
}
