/**
 * iOS Safari ignores `user-scalable=no`, so block pinch-zoom gestures directly.
 * Double-tap zoom is handled by `touch-action` in CSS.
 */
export function preventZoomGestures(): void {
  const block = (e: Event) => e.preventDefault();
  // Safari-only gesture events (pinch).
  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('gesturechange', block, { passive: false });
  // Any multi-finger move outside the canvas.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
