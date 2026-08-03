function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeBounds(bounds) {
  const minY = finite(bounds?.minY, 0);
  const maxY = Math.max(minY, finite(bounds?.maxY, minY));
  return { ...bounds, minY, maxY };
}

export function stabilizeNoteFlowBounds({
  bounds,
  layout,
  contentWidth,
  viewportHeight,
  preferCurrent = false
} = {}) {
  const current = normalizeBounds(bounds);
  const box = layout?.box;
  const sourceFrame = layout?.sourceFrame;
  const sourceContentWidth = finite(sourceFrame?.contentWidth, 0);
  const boxY = finite(box?.y, Number.NaN);
  const boxHeight = finite(box?.height, Number.NaN);
  if (!(sourceContentWidth > 0) || !Number.isFinite(boxY) || !(boxHeight >= 0)) {
    return {
      bounds: current,
      runaway: false,
      referenceHeight: Math.max(1, finite(viewportHeight, 1))
    };
  }

  const widthScale = clamp(finite(contentWidth, sourceContentWidth) / sourceContentWidth, 0.2, 5);
  const sameContentLane = widthScale >= 0.82 && widthScale <= 1.2;
  const positionScale = sameContentLane ? 1 : clamp(1 / widthScale, 0.48, 2.2);
  const heightScale = sameContentLane ? widthScale : clamp(Math.max(positionScale, widthScale), 0.42, 2.8);
  const stableMinY = Math.max(0, boxY * positionScale);
  const stableMaxY = Math.max(stableMinY, stableMinY + boxHeight * heightScale);
  const sourceDocumentHeight = Math.max(1, finite(sourceFrame?.documentHeight, 1) * positionScale);
  const referenceHeight = Math.max(1, finite(viewportHeight, 1), sourceDocumentHeight, stableMaxY);
  const viewport = Math.max(1, finite(viewportHeight, 1));
  const runawayThreshold = Math.max(viewport * 4, stableMaxY * 4, stableMaxY + viewport * 2);
  const runaway = current.minY > runawayThreshold || current.maxY > runawayThreshold;

  return {
    bounds: preferCurrent && !runaway
      ? current
      : { ...current, minY: stableMinY, maxY: stableMaxY },
    runaway,
    referenceHeight
  };
}

export function noteFlowSurfaceRepairLimits(referenceHeight, viewportHeight) {
  const viewport = Math.max(1, finite(viewportHeight, 1));
  const stableHeight = Math.ceil(clamp(Math.max(viewport, finite(referenceHeight, viewport) * 1.5), viewport, 200_000));
  return {
    stableHeight,
    runawayThreshold: Math.max(8_000, stableHeight * 4)
  };
}

export function selectNoteFlowAnchorPlacement(candidates, {
  strokeTop,
  tolerance = 4
} = {}) {
  const top = finite(strokeTop, Number.NaN);
  if (!Number.isFinite(top)) {
    return null;
  }
  const ordered = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    return candidate && Number.isFinite(Number(candidate.top)) && Number.isFinite(Number(candidate.bottom)) && Number.isFinite(Number(candidate.start));
  }).map((candidate, index) => ({
    ...candidate,
    top: finite(candidate.top),
    bottom: Math.max(finite(candidate.top), finite(candidate.bottom)),
    start: finite(candidate.start),
    end: Math.max(finite(candidate.start), finite(candidate.end, candidate.start)),
    order: Number.isFinite(Number(candidate.order)) ? Number(candidate.order) : index
  })).sort((a, b) => a.top - b.top || a.bottom - b.bottom || a.order - b.order);
  if (!ordered.length) {
    return null;
  }

  // A stroke intersecting a block belongs before that block. This keeps the
  // content below the ink moving as one document-flow region.
  const below = ordered.find((candidate) => candidate.bottom > top + finite(tolerance, 4));
  if (below) {
    return { candidate: below, side: "before", line: below.start };
  }

  const last = ordered[ordered.length - 1];
  return { candidate: last, side: "after", line: last.end };
}

export function selectNoteFlowPositionAnchor(candidates, {
  strokeTop,
  tolerance = 4,
  maxOrderExclusive = Number.POSITIVE_INFINITY
} = {}) {
  const top = finite(strokeTop, Number.NaN);
  if (!Number.isFinite(top)) {
    return null;
  }
  const orderLimit = Number.isFinite(Number(maxOrderExclusive))
    ? Number(maxOrderExclusive)
    : Number.POSITIVE_INFINITY;
  const above = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    return candidate && Number.isFinite(Number(candidate.bottom)) && Number.isFinite(Number(candidate.end));
  }).map((candidate, index) => ({
    ...candidate,
    bottom: finite(candidate.bottom),
    end: finite(candidate.end),
    order: Number.isFinite(Number(candidate.order)) ? Number(candidate.order) : index
  })).filter((candidate) => {
    return candidate.bottom <= top + finite(tolerance, 4) && candidate.order < orderLimit;
  }).sort((a, b) => b.bottom - a.bottom || b.end - a.end || b.order - a.order);
  if (!above.length) {
    return null;
  }
  return { candidate: above[0], line: above[0].end };
}

function pointBounds(points, canvasWidth, canvasHeight) {
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const coordinates = (Array.isArray(points) ? points : []).map((point) => ({
    x: finite(point?.x, Number.NaN) * width,
    y: finite(point?.y, Number.NaN) * height
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!coordinates.length) {
    return null;
  }
  return {
    minX: Math.min(...coordinates.map((point) => point.x)),
    minY: Math.min(...coordinates.map((point) => point.y))
  };
}

export function stabilizeNoteFlowPointProjection(previousPoints, projectedPoints, {
  canvasWidth,
  canvasHeight,
  threshold = 0.65
} = {}) {
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const previous = pointBounds(previousPoints, width, height);
  const projected = pointBounds(projectedPoints, width, height);
  if (!previous || !projected) {
    return Array.isArray(projectedPoints) ? projectedPoints.map((point) => ({ ...point })) : [];
  }
  const limit = Math.max(0, finite(threshold, 0.65));
  const deltaX = Math.abs(projected.minX - previous.minX) < limit ? previous.minX - projected.minX : 0;
  const deltaY = Math.abs(projected.minY - previous.minY) < limit ? previous.minY - projected.minY : 0;
  if (!deltaX && !deltaY) {
    return projectedPoints;
  }
  return projectedPoints.map((point) => ({
    ...point,
    x: clamp(finite(point?.x, 0) + deltaX / width, 0, 1),
    y: clamp(finite(point?.y, 0) + deltaY / height, 0, 1)
  }));
}

export function projectNoteFlowDocumentPoint(sourcePoint, projectedPoint, {
  canvasHeight
} = {}) {
  const absoluteY = Number(sourcePoint?.anchor?.offsetY);
  if (!Number.isFinite(absoluteY)) {
    return projectedPoint;
  }
  return {
    ...projectedPoint,
    y: clamp(absoluteY / Math.max(1, finite(canvasHeight, 1)), 0, 1)
  };
}

export function noteFlowRequiredOffset({
  side,
  anchorTop,
  anchorBottom,
  desiredBottom,
  applied = 0,
  scale = 1
} = {}) {
  const safeScale = Math.max(0.01, finite(scale, 1));
  const edge = side === "after"
    ? finite(anchorBottom)
    : finite(anchorTop) - Math.max(0, finite(applied)) * safeScale;
  return Math.max(0, (finite(desiredBottom) - edge) / safeScale);
}
