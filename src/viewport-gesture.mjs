function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeReadingZoom(value, {
  minimum = 0.6,
  fallback = 1
} = {}) {
  const min = Math.max(0.01, finite(minimum, 0.6));
  const fallbackZoom = Math.max(min, finite(fallback, 1));
  const zoom = Number(value);
  return Number.isFinite(zoom) && zoom > 0 ? Math.max(min, zoom) : fallbackZoom;
}

export function calculateReadingZoomExtent(logicalSize, zoom, maximumPixels = 16_777_216) {
  const size = Math.max(1, finite(logicalSize, 1));
  const scale = normalizeReadingZoom(zoom, { minimum: 0.01, fallback: 1 });
  const maximum = Math.max(1, finite(maximumPixels, 16_777_216));
  return Math.max(1, Math.min(maximum, Math.ceil(size * scale)));
}

export function calculatePinchPanScroll({
  scrollLeft = 0,
  scrollTop = 0,
  previousCenter = null,
  nextCenter = null,
  zoomRatio = 1,
  originX = 0,
  originY = 0,
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
  const stableOriginX = finite(originX);
  const stableOriginY = finite(originY);
  const maxLeft = Math.max(0, finite(maxScrollLeft, Number.MAX_SAFE_INTEGER));
  const maxTop = Math.max(0, finite(maxScrollTop, Number.MAX_SAFE_INTEGER));
  return {
    left: clamp((finite(scrollLeft) + previousX) * ratio + (1 - ratio) * stableOriginX - nextX, 0, maxLeft),
    top: clamp((finite(scrollTop) + previousY) * ratio + (1 - ratio) * stableOriginY - nextY, 0, maxTop)
  };
}

export function calculateReadingZoomMargin(baseMargin, targetHeight, zoom) {
  const base = Number.isFinite(Number(baseMargin)) ? Number(baseMargin) : 0;
  const height = Math.max(1, Number.isFinite(Number(targetHeight)) ? Number(targetHeight) : 1);
  const scale = Math.max(0.01, Number.isFinite(Number(zoom)) ? Number(zoom) : 1);
  return scale < 1 ? base - height * (1 - scale) : base;
}

export function calculateVisualZoomLogicalWindow({
  scrollTop = 0,
  viewportHeight = 0,
  zoom = 1,
  origin = 0
} = {}) {
  const scale = Math.max(0.01, finite(zoom, 1));
  const visualTop = Math.max(0, finite(scrollTop));
  const logicalTop = Math.max(0, (visualTop - finite(origin) * (scale - 1)) / scale);
  const logicalHeight = Math.max(0, finite(viewportHeight)) / scale;
  return {
    top: logicalTop,
    bottom: logicalTop + logicalHeight,
    height: logicalHeight
  };
}
