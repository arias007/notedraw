function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createReadingTouchGuardState() {
  return {
    active: null,
    lastTouchAt: 0,
    suppressUntil: 0
  };
}

export function beginReadingTouch(state, { id, x, y, now } = {}) {
  state.active = {
    id,
    x: finite(x),
    y: finite(y),
    moved: false
  };
  state.lastTouchAt = finite(now);
}

export function moveReadingTouch(state, { id, x, y, now } = {}, threshold = 10) {
  const active = state?.active;
  if (!active || active.id !== id) {
    return false;
  }
  const distance = Math.hypot(finite(x) - active.x, finite(y) - active.y);
  if (distance >= Math.max(1, finite(threshold, 10))) {
    active.moved = true;
  }
  state.lastTouchAt = finite(now);
  return active.moved;
}

export function finishReadingTouch(state, { id, now } = {}, suppressMs = 380) {
  const active = state?.active;
  if (!active || active.id !== id) {
    return false;
  }
  const moved = Boolean(active.moved);
  const timestamp = finite(now);
  state.active = null;
  state.lastTouchAt = timestamp;
  if (moved) {
    state.suppressUntil = Math.max(state.suppressUntil, timestamp + Math.max(0, finite(suppressMs, 380)));
  }
  return moved;
}

export function recordReadingTouchScroll(state, { now } = {}, {
  recentTouchMs = 900,
  suppressMs = 380
} = {}) {
  const timestamp = finite(now);
  const touchIsRecent = Boolean(state?.active)
    || state?.lastTouchAt > 0 && timestamp - state.lastTouchAt <= Math.max(0, finite(recentTouchMs, 900));
  if (!touchIsRecent) {
    return false;
  }
  if (state.active) {
    state.active.moved = true;
  }
  state.lastTouchAt = timestamp;
  state.suppressUntil = Math.max(state.suppressUntil, timestamp + Math.max(0, finite(suppressMs, 380)));
  return true;
}

export function shouldSuppressReadingClick(state, now) {
  return finite(now) < finite(state?.suppressUntil);
}
