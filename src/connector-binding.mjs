function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, finite(value)));
}

function boundsCenter(bounds) {
  return {
    x: (finite(bounds?.minX) + finite(bounds?.maxX)) / 2,
    y: (finite(bounds?.minY) + finite(bounds?.maxY)) / 2
  };
}

function canvasPoint(point, width, height) {
  return {
    x: clamp01(point?.x) * width,
    y: clamp01(point?.y) * height
  };
}

function attachmentPoint(bounds, toward) {
  const center = boundsCenter(bounds);
  const dx = finite(toward?.x, center.x) - center.x;
  const dy = finite(toward?.y, center.y) - center.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy) * 0.62;
  return horizontal ? {
    x: dx >= 0 ? finite(bounds?.maxX, center.x) : finite(bounds?.minX, center.x),
    y: center.y
  } : {
    x: center.x,
    y: dy >= 0 ? finite(bounds?.maxY, center.y) : finite(bounds?.minY, center.y)
  };
}

function normalizePoint(point, width, height, timestamp) {
  return {
    x: clamp01(finite(point?.x) / width),
    y: clamp01(finite(point?.y) / height),
    t: timestamp,
    anchor: null
  };
}

export function connectorSnapThreshold(hitPaddingPx = 0) {
  return Math.max(28, Math.max(0, finite(hitPaddingPx)) * 1.75);
}

export function buildSnappedConnectorPoints({
  fromBounds = null,
  toBounds = null,
  fromPoint = null,
  toPoint = null,
  canvasWidth = 1,
  canvasHeight = 1,
  timestamp = Date.now()
} = {}) {
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const freeFrom = canvasPoint(fromPoint, width, height);
  const freeTo = canvasPoint(toPoint, width, height);
  const fromTarget = toBounds ? boundsCenter(toBounds) : freeTo;
  const toTarget = fromBounds ? boundsCenter(fromBounds) : freeFrom;
  const from = fromBounds ? attachmentPoint(fromBounds, fromTarget) : freeFrom;
  const to = toBounds ? attachmentPoint(toBounds, toTarget) : freeTo;
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) * 0.62;
  const control = horizontal
    ? { x: (from.x + to.x) / 2, y: from.y }
    : { x: from.x, y: (from.y + to.y) / 2 };
  return [from, control, to].map((point) => normalizePoint(point, width, height, timestamp));
}
