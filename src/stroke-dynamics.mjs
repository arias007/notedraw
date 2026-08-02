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
  const minimumVisibleWidth = Math.min(strokeWidth, Math.max(0.65, strokeWidth * 0.48));
  const segments = [];
  let widthFactor = null;
  let smoothedSpeed = null;
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
    while (sampleStart > 0 && sampleElapsed < 22) {
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
    smoothedSpeed = smoothedSpeed === null ? speed : mix(smoothedSpeed, speed, speed > smoothedSpeed ? 0.42 : 0.28);
    const speedRatio = clamp((smoothedSpeed - 0.1) / 1.75, 0, 1);
    const targetWidthFactor = mix(1.78, 0.56, Math.pow(speedRatio, 0.9));
    widthFactor = widthFactor === null ? targetWidthFactor : mix(widthFactor, targetWidthFactor, 0.34);
    segments.push({
      from,
      to,
      speed,
      width: clamp(strokeWidth * widthFactor, minimumVisibleWidth, strokeWidth * 1.85),
      opacity: strokeOpacity
    });
  }
  const terminalSamples = segments.slice(-Math.min(3, segments.length));
  const terminalSpeed = terminalSamples.length
    ? terminalSamples.reduce((sum, segment) => sum + segment.speed, 0) / terminalSamples.length
    : 0;
  if (terminalSpeed > 0.72 && segments.length >= 2) {
    const tailCount = Math.min(5, Math.max(2, Math.round(2 + terminalSpeed * 1.2)), segments.length);
    const start = segments.length - tailCount;
    for (let index = start; index < segments.length; index += 1) {
      const progress = (index - start + 1) / tailCount;
      const taper = mix(1, 0.12, Math.pow(progress, 1.55));
      segments[index].width = Math.max(0.18, segments[index].width * taper);
      segments[index].tailTaper = progress;
    }
  }
  for (let index = 0; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const next = segments[index + 1];
    current.fromWidth = previous ? (previous.width + current.width) / 2 : current.width;
    current.toWidth = next ? (current.width + next.width) / 2 : current.tailTaper ? Math.max(0.08, current.width * 0.08) : current.width;
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
