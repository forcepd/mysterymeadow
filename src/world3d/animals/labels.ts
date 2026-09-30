import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import styles from './labels.module.css';

export { styles as labelStyles };

/**
 * A label that floats at a spot in the world (always facing the screen, never taking taps).
 * `anchor` is which point of the label sits on the spot: (0.5, 0) = its top middle (under the
 * feet), (0.5, 1) = its bottom middle (over the head).
 */
export function worldLabel(className: string, anchor: { x: number; y: number }): CSS2DObject {
  const element = document.createElement('div');
  element.className = className;
  const label = new CSS2DObject(element);
  label.center.set(anchor.x, anchor.y);
  return label;
}

/** Sets a label's text only when it changed (cheap to call every frame). */
export function setText(label: CSS2DObject, text: string): void {
  if (label.element.textContent !== text) label.element.textContent = text;
  label.visible = text !== '';
}
