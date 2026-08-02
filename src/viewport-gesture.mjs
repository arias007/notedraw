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
  maxScrollLeft = Number.POSITIVE_INFINITY,
  maxScrollTop = Number.POSITIVE_INFINITY
} = {}) {
  const previous = previousCenter || nextCenter || { x: 0, y: 0 };
  const next = nextCenter || previousCenter || { x: 0, y: 0 };
  const ratio = Math.max(0.01, finite(zoomRatio, 1));
  const maxLeft = Math.max(0, finite(maxScrollLeft, Number.MAX_SAFE_INTEGER));
  const maxTop = Math.max(0, finite(maxScrollTop, Number.MAX_SAFE_INTEGER));
  return {
    left: clamp((finite(scrollLeft) + finite(previous.x)) * ratio - finite(next.x), 0, maxLeft),
    top: clamp((finite(scrollTop) + finite(previous.y)) * ratio - finite(next.y), 0, maxTop)
  };
}
