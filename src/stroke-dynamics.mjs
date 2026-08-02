function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

export function buildFountainPenSegments(points, {
  canvasWidth = 1,
  canvasHeight = 1,
  baseWidth = 3,
  baseOpacity = 1
} = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    return [];
  }
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const strokeWidth = Math.max(0.5, finite(baseWidth, 3));
  const strokeOpacity = clamp(finite(baseOpacity, 1), 0, 1);
  const segments = [];
  let widthFactor = null;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = (finite(to?.x) - finite(from?.x)) * width;
    const dy = (finite(to?.y) - finite(from?.y)) * height;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.01) {
      continue;
    }
    const elapsed = clamp(finite(to?.t, index * 16) - finite(from?.t, (index - 1) * 16), 4, 80);
    const speed = distance / elapsed;
    const speedRatio = clamp((speed - 0.08) / 2.12, 0, 1);
    const targetWidthFactor = mix(2.05, 0.34, Math.pow(speedRatio, 0.72));
    widthFactor = widthFactor === null ? targetWidthFactor : mix(widthFactor, targetWidthFactor, 0.68);
    segments.push({
      from,
      to,
      speed,
      width: clamp(strokeWidth * widthFactor, strokeWidth * 0.3, strokeWidth * 2.1),
      opacity: strokeOpacity
    });
  }
  return segments;
}

export function straightenWatercolorPoints(points, {
  canvasWidth = 1,
  canvasHeight = 1,
  angleTolerance = 12,
  minDistance = 18
} = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    return { axis: null, points: Array.isArray(points) ? points.slice() : [] };
  }
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const start = points[0];
  const end = points[points.length - 1];
  const dx = (finite(end?.x) - finite(start?.x)) * width;
  const dy = (finite(end?.y) - finite(start?.y)) * height;
  const distance = Math.hypot(dx, dy);
  if (distance < Math.max(0, finite(minDistance, 18))) {
    return { axis: null, points: points.slice() };
  }
  const tolerance = Math.sin(clamp(finite(angleTolerance, 12), 1, 45) * Math.PI / 180);
  const horizontal = Math.abs(dy) / distance <= tolerance;
  const vertical = Math.abs(dx) / distance <= tolerance;
  if (!horizontal && !vertical) {
    return { axis: null, points: points.slice() };
  }
  const axis = horizontal ? "horizontal" : "vertical";
  const centerX = (finite(start?.x) + finite(end?.x)) / 2;
  const centerY = (finite(start?.y) + finite(end?.y)) / 2;
  return {
    axis,
    points: points.map((point) => ({
      ...point,
      x: axis === "vertical" ? centerX : finite(point?.x),
      y: axis === "horizontal" ? centerY : finite(point?.y)
    }))
  };
}
