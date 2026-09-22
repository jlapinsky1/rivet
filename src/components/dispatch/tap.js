import { useMemo, useRef } from 'react';

function tapHandlers(gesture, onTap) {
  function finish(x, y) {
    const g = gesture.current ?? gesture;
    if (!g.start) return;
    const dx = Math.abs(x - g.start.x);
    const dy = Math.abs(y - g.start.y);
    g.start = null;
    if (dx > 14 || dy > 14) return;
    g.handled = true;
    onTap();
  }

  function remember(x, y) {
    const g = gesture.current ?? gesture;
    g.start = { x, y };
    g.handled = false;
  }

  return {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      remember(e.clientX, e.clientY);
    },
    onPointerUp(e) {
      finish(e.clientX, e.clientY);
    },
    onPointerCancel(e) {
      finish(e.clientX, e.clientY);
    },
    onTouchStart(e) {
      const t = e.touches?.[0];
      if (t) remember(t.clientX, t.clientY);
    },
    onTouchEnd(e) {
      const t = e.changedTouches?.[0];
      if (t) finish(t.clientX, t.clientY);
    },
    onClick(e) {
      const g = gesture.current ?? gesture;
      if (g.handled) {
        g.handled = false;
        e.preventDefault();
        return;
      }
      onTap();
    },
  };
}

/** A tap that still fires when iOS drops the click after a scroll or a keyboard. */
export function bindTap(onTap) {
  const gesture = { start: null, handled: false };
  return tapHandlers(gesture, onTap);
}

/** Same tap, kept across re-renders so a scroll view cannot drop it. */
export function useTap(onTap) {
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const gesture = useRef({ start: null, handled: false });
  return useMemo(
    () => tapHandlers(gesture, () => onTapRef.current?.()),
    [],
  );
}
