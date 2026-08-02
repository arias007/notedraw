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
  const strokeWidth = Math.max(0.25, finite(baseWidth, 3));
  const strokeOpacity = clamp(finite(baseOpacity, 1), 0, 1);
  const minimumVisibleWidth = Math.min(strokeWidth, Math.max(1, strokeWidth * 0.22));
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
    let sampleStart = index - 1;
    let sampleDistance = distance;
    let sampleElapsed = finite(to?.t, index * 16) - finite(from?.t, (index - 1) * 16);
    while (sampleStart > 0 && sampleElapsed < 10) {
      const previous = points[sampleStart - 1];
      const current = points[sampleStart];
      sampleDistance += Math.hypot(
        (finite(current?.x) - finite(previous?.x)) * width,
        (finite(current?.y) - finite(previous?.y)) * height
      );
      sampleStart -= 1;
      sampleElapsed = finite(to?.t, index * 16) - finite(previous?.t, sampleStart * 16);
    }
    const elapsed = clamp(sampleElapsed > 0 ? sampleElapsed : 4, 1, 250);
    const speed = sampleDistance / elapsed;
    const speedRatio = clamp((speed - 0.12) / 1.48, 0, 1);
    const targetWidthFactor = mix(4.2, 0.24, Math.pow(speedRatio, 1.15));
    widthFactor = widthFactor === null ? targetWidthFactor : mix(widthFactor, targetWidthFactor, 0.78);
    segments.push({
      from,
      to,
      speed,
      width: clamp(strokeWidth * widthFactor, minimumVisibleWidth, strokeWidth * 4.5),
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
