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

  // Only move blocks that begin below the ink. Moving an intersecting block
  // can pull text from above the stroke down with the reserved space.
  const below = ordered.find((candidate) => candidate.top >= top - finite(tolerance, 4));
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

export function selectStoredNoteFlowAnchorCandidate(candidates, {
  side,
  strokeTop,
  tolerance = 4
} = {}) {
  const ordered = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    return candidate && Number.isFinite(Number(candidate.top)) && Number.isFinite(Number(candidate.bottom));
  }).map((candidate, order) => ({
    ...candidate,
    top: finite(candidate.top),
    bottom: Math.max(finite(candidate.top), finite(candidate.bottom)),
    order: Number.isFinite(Number(candidate.order)) ? Number(candidate.order) : order
  }));
  if (ordered.length <= 1 || !Number.isFinite(Number(strokeTop))) {
    return ordered.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top) || a.order - b.order)[0] || null;
  }
  const top = finite(strokeTop);
  const threshold = Math.max(0, finite(tolerance, 4));
  if (side === "after") {
    const above = ordered.filter((candidate) => candidate.bottom <= top + threshold)
      .sort((a, b) => b.bottom - a.bottom || a.order - b.order);
    if (above.length) {
      return above[0];
    }
  } else {
    const below = ordered.filter((candidate) => candidate.top >= top - threshold)
      .sort((a, b) => a.top - b.top || (a.bottom - a.top) - (b.bottom - b.top) || a.order - b.order);
    if (below.length) {
      return below[0];
    }
  }
  return ordered.sort((a, b) => {
    const aDistance = Math.min(Math.abs(a.top - top), Math.abs(a.bottom - top));
    const bDistance = Math.min(Math.abs(b.top - top), Math.abs(b.bottom - top));
    return aDistance - bDistance || a.order - b.order;
  })[0] || null;
}

export function selectNoteFlowAvoidanceCandidate(candidates, {
  strokeTop,
  strokeBottom,
  tolerance = 4
} = {}) {
  const top = finite(strokeTop, Number.NaN);
  const bottom = finite(strokeBottom, Number.NaN);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }
  const threshold = Math.max(0, finite(tolerance, 4));
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    return candidate
      && Number.isFinite(Number(candidate.top))
      && Number.isFinite(Number(candidate.bottom))
      && Number(candidate.bottom) >= top + threshold
      && Number(candidate.top) <= bottom - threshold;
  }).map((candidate, order) => ({
    ...candidate,
    top: finite(candidate.top),
    bottom: Math.max(finite(candidate.top), finite(candidate.bottom)),
    order: Number.isFinite(Number(candidate.order)) ? Number(candidate.order) : order
  })).sort((a, b) => {
    const aLine = a.lineSpacer || Number(a.start) === Number(a.end) ? 0 : 1;
    const bLine = b.lineSpacer || Number(b.start) === Number(b.end) ? 0 : 1;
    return aLine - bLine
      || a.top - b.top
      || (a.bottom - a.top) - (b.bottom - b.top)
      || a.order - b.order;
  })[0] || null;
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

export function preserveAbsoluteNoteFlowPoints(points, {
  previousWidth,
  previousHeight,
  nextWidth,
  nextHeight
} = {}) {
  const oldWidth = Math.max(1, finite(previousWidth, 1));
  const oldHeight = Math.max(1, finite(previousHeight, 1));
  const width = Math.max(1, finite(nextWidth, oldWidth));
  const height = Math.max(1, finite(nextHeight, oldHeight));
  return (Array.isArray(points) ? points : []).map((point) => ({
    ...point,
    x: clamp(finite(point?.x, 0) * oldWidth / width, 0, 1),
    y: clamp(finite(point?.y, 0) * oldHeight / height, 0, 1)
  }));
}

export function hasStableNoteFlowAnchor(noteFlow) {
  const line = noteFlow?.line;
  return line !== null
    && line !== undefined
    && line !== ""
    && Number.isFinite(Number(line))
    && ["before", "after"].includes(noteFlow?.side)
    && Boolean(noteFlow?.positionBasis)
    && Number(noteFlow?.positionVersion) >= 1;
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
    ? finite(anchorBottom) - Math.max(0, finite(applied)) * safeScale
    : finite(anchorTop);
  return Math.max(0, (finite(desiredBottom) - edge) / safeScale);
}

export function shouldRenderStrokeOnSurface(stroke, surfaceType) {
  return !(surfaceType === "source" && stroke?.noteFlow?.enabled);
}

export function reflowNoteFlowIntervals(items, { gap = 12 } = {}) {
  const defaultGap = Math.max(0, finite(gap, 12));
  const normalized = (Array.isArray(items) ? items : []).map((item, order) => {
    const minY = finite(item?.minY, Number.NaN);
    const maxY = finite(item?.maxY, Number.NaN);
    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY < minY) {
      return null;
    }
    const previousMinY = finite(item?.previousMinY, Number.NaN);
    const previousMaxY = finite(item?.previousMaxY, Number.NaN);
    return {
      ...item,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : order,
      minY,
      maxY,
      height: Math.max(0, maxY - minY),
      gap: Math.max(0, finite(item?.gap, defaultGap)),
      previousMinY,
      previousMaxY,
      movedDown: Boolean(item?.moved)
        && Number.isFinite(previousMinY)
        && Number.isFinite(previousMaxY)
        && minY > previousMinY
    };
  }).filter(Boolean);

  const vacancies = normalized.filter((item) => item.movedDown).map((item) => ({
    minY: item.previousMinY,
    maxY: Math.min(item.minY, item.previousMaxY),
    used: false
  })).filter((vacancy) => vacancy.maxY > vacancy.minY);

  for (const item of normalized.filter((candidate) => !candidate.moved)) {
    const overlapsMoved = normalized.some((candidate) => {
      return candidate.movedDown && item.minY < candidate.maxY && item.maxY > candidate.minY;
    });
    if (!overlapsMoved) {
      continue;
    }
    const vacancy = vacancies.find((candidate) => !candidate.used && candidate.maxY - candidate.minY >= item.height);
    if (vacancy) {
      item.minY = vacancy.minY;
      item.maxY = vacancy.minY + item.height;
      vacancy.used = true;
    }
  }

  normalized.sort((a, b) => a.minY - b.minY || a.order - b.order);
  let cursor = Number.NEGATIVE_INFINITY;
  return normalized.map((item) => {
    const minY = Math.max(item.minY, cursor);
    const maxY = minY + item.height;
    cursor = maxY + item.gap;
    return {
      id: item.id,
      index: item.index,
      minY,
      maxY,
      deltaY: minY - finite(item?.originalMinY, item.minY)
    };
  });
}
