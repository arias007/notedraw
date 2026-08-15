function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRect(rect) {
  const left = finite(rect?.left);
  const top = finite(rect?.top);
  const right = finite(rect?.right, left + finite(rect?.width));
  const bottom = finite(rect?.bottom, top + finite(rect?.height));
  if (right <= left || bottom <= top) {
    return null;
  }
  return {
    ...rect,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function intervalGap(startA, endA, startB, endB) {
  return Math.max(0, startA - endB, startB - endA);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function pickTextHighlightLine(rectInputs, pointInputs, {
  maxVerticalDistance = 36,
  maxHorizontalDistance = 140
} = {}) {
  const rects = (Array.isArray(rectInputs) ? rectInputs : []).map(normalizeRect).filter(Boolean);
  const points = (Array.isArray(pointInputs) ? pointInputs : []).map((point) => ({
    x: finite(point?.x, NaN),
    y: finite(point?.y, NaN)
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!rects.length || !points.length) {
    return null;
  }

  const pointLeft = Math.min(...points.map((point) => point.x));
  const pointRight = Math.max(...points.map((point) => point.x));
  const pointCenterY = median(points.map((point) => point.y));
  let best = null;
  for (const rect of rects) {
    const verticalDistances = points.map((point) => intervalGap(point.y, point.y, rect.top, rect.bottom));
    const horizontalGap = intervalGap(pointLeft, pointRight, rect.left, rect.right);
    const nearestVertical = Math.min(...verticalDistances);
    const medianVertical = median(verticalDistances);
    const verticalLimit = Math.max(finite(maxVerticalDistance, 36), rect.height * 1.25);
    if (nearestVertical > verticalLimit || horizontalGap > Math.max(0, finite(maxHorizontalDistance, 140))) {
      continue;
    }
    const supportedPoints = points.filter((point) => (
      point.y >= rect.top - rect.height * 0.72 &&
      point.y <= rect.bottom + rect.height * 0.72 &&
      point.x >= rect.left - maxHorizontalDistance &&
      point.x <= rect.right + maxHorizontalDistance
    )).length;
    const centerDistance = Math.abs(pointCenterY - (rect.top + rect.height * 0.58));
    const overlap = Math.max(0, Math.min(pointRight, rect.right) - Math.max(pointLeft, rect.left));
    const span = Math.max(1, pointRight - pointLeft);
    const overlapRatio = Math.min(1, overlap / span);
    const supportRatio = supportedPoints / points.length;
    const score = medianVertical * 8 + nearestVertical * 3 + centerDistance * 0.8 + horizontalGap * 0.7 - supportRatio * 48 - overlapRatio * 24;
    if (!best || score < best.score) {
      best = { rect, score };
    }
  }
  return best?.rect || null;
}

