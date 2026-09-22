/** A tap that still fires when iOS drops the click after a scroll or a keyboard. */
export function bindTap(onTap) {
  let start = null;
  let handled = false;

  function finish(x, y) {
    if (!start) return;
    const dx = Math.abs(x - start.x);
    const dy = Math.abs(y - start.y);
    start = null;
    if (dx > 14 || dy > 14) return;
    handled = true;
    onTap();
  }

  return {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      handled = false;
    },
    onPointerUp(e) {
      finish(e.clientX, e.clientY);
    },
    onPointerCancel() {
      start = null;
    },
    onClick(e) {
      if (handled) {
        handled = false;
        e.preventDefault();
        return;
      }
      onTap();
    },
  };
}
