function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function calculatePinchPanScroll({
  scrollLeft = 0,
  scrollTop = 0,
  previousCenter = null,
  nextCenter = null,
  zoomRatio = 1,
  movementEpsilon = 0.35,
  maxScrollLeft = Number.POSITIVE_INFINITY,
  maxScrollTop = Number.POSITIVE_INFINITY
} = {}) {
  const previous = previousCenter || nextCenter || { x: 0, y: 0 };
  const next = nextCenter || previousCenter || { x: 0, y: 0 };
  const ratio = Math.max(0.01, finite(zoomRatio, 1));
  const epsilon = Math.max(0, finite(movementEpsilon, 0.35));
  const previousX = finite(previous.x);
  const previousY = finite(previous.y);
  const nextX = Math.abs(finite(next.x) - previousX) < epsilon ? previousX : finite(next.x);
  const nextY = Math.abs(finite(next.y) - previousY) < epsilon ? previousY : finite(next.y);
  const maxLeft = Math.max(0, finite(maxScrollLeft, Number.MAX_SAFE_INTEGER));
  const maxTop = Math.max(0, finite(maxScrollTop, Number.MAX_SAFE_INTEGER));
  return {
    left: clamp((finite(scrollLeft) + previousX) * ratio - nextX, 0, maxLeft),
    top: clamp((finite(scrollTop) + previousY) * ratio - nextY, 0, maxTop)
  };
}
