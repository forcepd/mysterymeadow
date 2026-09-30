/**
 * Turns raw pointer events into world gestures (DESIGN-3D "Camera and input rules"):
 *
 * - A press on an object belongs to that object (tap, hold, drag), and never moves the camera.
 * - A press on empty ground that lifts without moving is a tap; one that moves orbits.
 * - Two fingers pinch (zoom) and pan. After a pinch, the remaining finger does nothing until
 *   it lifts, so the camera doesn't jump.
 *
 * Pure: no DOM. Positions are CSS px relative to the canvas; times are ms.
 */

export interface PointerSample {
  id: number;
  x: number;
  y: number;
  time: number;
}

/** What an object does with a press that started on it. */
export interface PressHandler {
  move(p: PointerSample): void;
  up(p: PointerSample): void;
  /** The press was taken over (a second finger) or cancelled by the browser. */
  cancel(): void;
}

export interface PinchStep {
  /** Midpoints before and after this step. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Finger spread now / before (> 1 = spreading = zoom in). */
  scale: number;
}

export interface GestureTarget {
  /** The object under a point, as a handler for the press, or null for empty ground. */
  pressAt(p: PointerSample): PressHandler | null;
  tap(p: PointerSample): void;
  orbit(dx: number, dy: number): void;
  pinch(step: PinchStep): void;
}

/** A press on empty ground that moves this far (CSS px) becomes an orbit instead of a tap. */
export const TAP_SLOP = 10;

type State =
  | { kind: 'idle' }
  | { kind: 'ground'; start: PointerSample; last: PointerSample; orbiting: boolean }
  | { kind: 'object'; last: PointerSample; handler: PressHandler }
  | { kind: 'pinch'; a: PointerSample; b: PointerSample }
  /** Fingers left over after a pinch: ignored until they all lift. */
  | { kind: 'drain'; ids: Set<number> };

export class GestureRecognizer {
  private state: State = { kind: 'idle' };

  constructor(private readonly target: GestureTarget) {}

  get mode(): State['kind'] {
    return this.state.kind;
  }

  down(p: PointerSample): void {
    const s = this.state;
    switch (s.kind) {
      case 'idle': {
        const handler = this.target.pressAt(p);
        this.state = handler
          ? { kind: 'object', last: p, handler }
          : { kind: 'ground', start: p, last: p, orbiting: false };
        return;
      }
      case 'ground':
        this.state = { kind: 'pinch', a: s.last, b: p };
        return;
      case 'object':
        s.handler.cancel();
        this.state = { kind: 'pinch', a: s.last, b: p };
        return;
      case 'pinch':
        // A third finger is ignored (and drained with the rest).
        return;
      case 'drain':
        s.ids.add(p.id);
        return;
    }
  }

  move(p: PointerSample): void {
    const s = this.state;
    switch (s.kind) {
      case 'ground': {
        if (p.id !== s.start.id) return;
        if (!s.orbiting && dist(p, s.start) > TAP_SLOP) s.orbiting = true;
        if (s.orbiting) this.target.orbit(p.x - s.last.x, p.y - s.last.y);
        s.last = p;
        return;
      }
      case 'object':
        if (p.id !== s.last.id) return;
        s.last = p;
        s.handler.move(p);
        return;
      case 'pinch': {
        const a = p.id === s.a.id ? p : s.a;
        const b = p.id === s.b.id ? p : s.b;
        if (a === s.a && b === s.b) return;
        const before = dist(s.a, s.b);
        const after = dist(a, b);
        this.target.pinch({
          from: mid(s.a, s.b),
          to: mid(a, b),
          scale: before > 0 && after > 0 ? after / before : 1,
        });
        this.state = { kind: 'pinch', a, b };
        return;
      }
      default:
        return;
    }
  }

  up(p: PointerSample): void {
    const s = this.state;
    switch (s.kind) {
      case 'ground':
        if (p.id !== s.start.id) return;
        this.state = { kind: 'idle' };
        if (!s.orbiting) this.target.tap(p);
        return;
      case 'object':
        if (p.id !== s.last.id) return;
        this.state = { kind: 'idle' };
        s.handler.up(p);
        return;
      case 'pinch': {
        const other = p.id === s.a.id ? s.b.id : p.id === s.b.id ? s.a.id : null;
        if (other === null) return;
        this.state = { kind: 'drain', ids: new Set([other]) };
        return;
      }
      case 'drain':
        s.ids.delete(p.id);
        if (s.ids.size === 0) this.state = { kind: 'idle' };
        return;
      default:
        return;
    }
  }

  /** The browser took the pointer (pointercancel), or the world is going away. */
  cancel(p?: PointerSample): void {
    const s = this.state;
    // One finger of a pinch lost: the same as lifting it.
    if (p && (s.kind === 'pinch' || s.kind === 'drain')) {
      this.up(p);
      return;
    }
    if (s.kind === 'object') s.handler.cancel();
    this.state = { kind: 'idle' };
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
