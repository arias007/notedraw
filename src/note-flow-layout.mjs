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

export function selectNoteFlowInsertionPlacement(candidates, {
  strokeTop,
  strokeBottom = strokeTop,
  tolerance = 4
} = {}) {
  const top = finite(strokeTop, Number.NaN);
  const bottom = Math.max(top, finite(strokeBottom, top));
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
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

  const threshold = Math.max(0, finite(tolerance, 4));
  const preciseOverlap = ordered.filter((candidate) => {
    const precise = Boolean(candidate.lineSpacer)
      || candidate.start === candidate.end
      || Math.abs(candidate.top - top) <= threshold;
    return precise && candidate.bottom >= top - threshold && candidate.top <= bottom + threshold;
  }).sort((a, b) => {
    const aLine = a.lineSpacer || a.start === a.end ? 0 : 1;
    const bLine = b.lineSpacer || b.start === b.end ? 0 : 1;
    return aLine - bLine || a.top - b.top || (a.bottom - a.top) - (b.bottom - b.top) || a.order - b.order;
  })[0];
  if (preciseOverlap) {
    return { candidate: preciseOverlap, side: "before", line: preciseOverlap.start };
  }

  // Padding a broad paragraph would move text from its first line instead of
  // reserving space where the ink was placed.
  const below = ordered.find((candidate) => candidate.top >= bottom - threshold);
  if (below) {
    return { candidate: below, side: "before", line: below.start };
  }

  const last = ordered[ordered.length - 1];
  return { candidate: last, side: "after", line: last.end };
}

export function createNoteFlowDropIndex(candidates) {
  const ordered = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    return candidate
      && Number.isFinite(Number(candidate.top))
      && Number.isFinite(Number(candidate.bottom))
      && Number.isFinite(Number(candidate.start));
  }).map((candidate, index) => ({
    ...candidate,
    top: finite(candidate.top),
    bottom: Math.max(finite(candidate.top), finite(candidate.bottom)),
    start: finite(candidate.start),
    end: Math.max(finite(candidate.start), finite(candidate.end, candidate.start)),
    order: Number.isFinite(Number(candidate.order)) ? Number(candidate.order) : index
  }));
  return ordered.flatMap((candidate) => {
    const height = candidate.bottom - candidate.top;
    const precise = candidate.lineSpacer || candidate.start === candidate.end ? 0 : 1;
    return [
      {
        candidate,
        side: "before",
        line: candidate.start,
        boundary: candidate.top,
        precise,
        height
      },
      {
        candidate,
        side: "after",
        line: candidate.end,
        boundary: candidate.bottom,
        precise,
        height
      }
    ];
  });
}

export function selectNoteFlowDropPlacementFromIndex(index, { dropY } = {}) {
  const y = finite(dropY, Number.NaN);
  if (!Number.isFinite(y)) {
    return null;
  }
  let placement = null;
  let placementDistance = Number.POSITIVE_INFINITY;
  for (const boundary of Array.isArray(index) ? index : []) {
    const distance = Math.abs(y - boundary.boundary);
    const better = distance < placementDistance
      || distance === placementDistance && (
        !placement
        || boundary.precise < placement.precise
        || boundary.precise === placement.precise && boundary.height < placement.height
        || boundary.precise === placement.precise && boundary.height === placement.height && boundary.candidate.order < placement.candidate.order
        || boundary.precise === placement.precise && boundary.height === placement.height && boundary.candidate.order === placement.candidate.order && boundary.side === "before" && placement.side !== "before"
      );
    if (better) {
      placement = boundary;
      placementDistance = distance;
    }
  }
  return placement ? {
    candidate: placement.candidate,
    side: placement.side,
    line: placement.line,
    boundary: placement.boundary,
    flowOrder: Number.isFinite(Number(placement.flowOrder)) ? Number(placement.flowOrder) : null,
    noteFlowBoundary: placement.noteFlowBoundary === true
  } : null;
}

export function selectNoteFlowDropPlacement(candidates, options = {}) {
  return selectNoteFlowDropPlacementFromIndex(createNoteFlowDropIndex(candidates), options);
}

export function selectNoteFlowAnchorPlacement(candidates, options = {}) {
  return selectNoteFlowInsertionPlacement(candidates, options);
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

export function selectExactNoteFlowPositionAnchor(candidates, {
  candidate,
  side,
  line
} = {}) {
  if (!candidate || !["before", "after"].includes(side)) {
    return null;
  }
  if (side === "after") {
    const targetLine = Number.isFinite(Number(line)) ? Number(line) : Number(candidate.end);
    return Number.isFinite(targetLine) ? { candidate, line: targetLine } : null;
  }
  const ordered = Array.isArray(candidates) ? candidates : [];
  const candidateOrder = Number.isFinite(Number(candidate.order))
    ? Number(candidate.order)
    : ordered.indexOf(candidate);
  return selectNoteFlowPositionAnchor(ordered, {
    strokeTop: finite(candidate.top, Number.NaN) - 0.001,
    maxOrderExclusive: candidateOrder >= 0 ? candidateOrder : Number.POSITIVE_INFINITY
  });
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
  const ordered = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    return candidate && Number.isFinite(Number(candidate.top)) && Number.isFinite(Number(candidate.bottom));
  }).map((candidate, order) => ({
    ...candidate,
    top: finite(candidate.top),
    bottom: Math.max(finite(candidate.top), finite(candidate.bottom)),
    order: Number.isFinite(Number(candidate.order)) ? Number(candidate.order) : order
  }));
  const preciseOverlap = ordered.filter((candidate) => {
    const start = Number(candidate?.start);
    const end = Number(candidate?.end);
    const precise = Boolean(candidate?.lineSpacer)
      || Number.isFinite(start) && Number.isFinite(end) && start === end
      || Math.abs(Number(candidate?.top) - top) <= threshold;
    return candidate
      && precise
      && Number.isFinite(Number(candidate.top))
      && Number.isFinite(Number(candidate.bottom))
      && Number(candidate.bottom) >= top + threshold
      && Number(candidate.top) <= bottom - threshold;
  }).sort((a, b) => {
    const aLine = a.lineSpacer || Number(a.start) === Number(a.end) ? 0 : 1;
    const bLine = b.lineSpacer || Number(b.start) === Number(b.end) ? 0 : 1;
    return aLine - bLine
      || a.top - b.top
      || (a.bottom - a.top) - (b.bottom - b.top)
      || a.order - b.order;
  })[0] || null;
  if (preciseOverlap) {
    return preciseOverlap;
  }

  // A large stroke can cover a whole multi-line block while line-level DOM
  // measurements are temporarily unavailable (virtualized Markdown and the
  // first zoom frame are common examples). In that narrow case, padding the
  // block from its top is correct because the stroke already covers the
  // block's complete vertical extent. Do not use this for a partial overlap:
  // that would move earlier lines and was the old large-container bug.
  const fullyCoveredBlock = ordered.filter((candidate) => {
    const multiLine = Number(candidate.start) !== Number(candidate.end) && !candidate.lineSpacer;
    return multiLine
      && top <= candidate.top + threshold
      && bottom >= candidate.bottom - threshold;
  }).sort((a, b) => {
    return (a.bottom - a.top) - (b.bottom - b.top) || a.order - b.order;
  })[0];
  return fullyCoveredBlock || null;
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

function normalizeNoteFlowPath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function noteFlowBlockKey(noteFlow, fallbackPath = "") {
  const path = normalizeNoteFlowPath(noteFlow?.path || fallbackPath);
  const line = Number(noteFlow?.line);
  const startValue = Number(noteFlow?.blockStart);
  const endValue = Number(noteFlow?.blockEnd);
  const start = Number.isFinite(startValue) && startValue >= 0
    ? Math.floor(startValue)
    : Number.isFinite(line) && line >= 0
      ? Math.floor(line)
      : null;
  const end = Number.isFinite(endValue) && endValue >= 0
    ? Math.floor(endValue)
    : start;
  if (!path || start === null || end === null) {
    return "";
  }
  return `${path}\0${Math.min(start, end)}\0${Math.max(start, end)}`;
}

export function noteFlowPlacementRowKey(noteFlow, fallbackPath = "") {
  const side = noteFlow?.side;
  const blockKey = noteFlowBlockKey(noteFlow, fallbackPath);
  const placementMode = noteFlow?.placementMode === "inline" ? "inline" : "row";
  return blockKey && ["before", "after"].includes(side)
    ? `${blockKey}\0${side}${placementMode === "inline" ? "\0inline" : ""}`
    : "";
}

export function canonicalNoteFlowGapPlacement(candidates, { anchor, side } = {}) {
  if (!anchor || !["before", "after"].includes(side)) {
    return null;
  }
  const path = normalizeNoteFlowPath(anchor.path || "");
  const blockKey = anchor.blockKey || noteFlowBlockKey(anchor, path);
  const ordered = [];
  const seen = new Set();
  for (const candidate of (Array.isArray(candidates) ? candidates : []).filter((item) => (
    normalizeNoteFlowPath(item?.path || "") === path
  )).sort((a, b) => (
    finite(a?.order, Number.POSITIVE_INFINITY) - finite(b?.order, Number.POSITIVE_INFINITY)
    || finite(a?.top) - finite(b?.top)
  ))) {
    const key = candidate.blockKey || noteFlowBlockKey(candidate, path);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(candidate);
  }
  const anchorIndex = ordered.findIndex((candidate) => (
    candidate === anchor
    || (candidate.blockKey || noteFlowBlockKey(candidate, path)) === blockKey
  ));
  const canonicalAnchor = side === "before" && anchorIndex > 0
    ? ordered[anchorIndex - 1]
    : anchor;
  const canonicalSide = canonicalAnchor === anchor ? side : "after";
  const line = canonicalSide === "after"
    ? finite(canonicalAnchor.end, canonicalAnchor.start)
    : finite(canonicalAnchor.start, canonicalAnchor.end);
  return Number.isFinite(line) ? {
    anchor: canonicalAnchor,
    path: normalizeNoteFlowPath(canonicalAnchor.path || path),
    line,
    side: canonicalSide,
    blockStart: finite(canonicalAnchor.blockStart, canonicalAnchor.start),
    blockEnd: finite(canonicalAnchor.blockEnd, canonicalAnchor.end),
    blockKey: canonicalAnchor.blockKey || noteFlowBlockKey(canonicalAnchor, path)
  } : null;
}

export function hasExactNoteFlowPlacement(noteFlow) {
  const version = noteFlow?.placementVersion;
  return hasStableNoteFlowAnchor(noteFlow)
    && (Number(version) >= 1 || version === null || version === undefined || version === "");
}

export function noteFlowAvoidanceReference(noteFlow, fallbackPath = "") {
  if (hasExactNoteFlowPlacement(noteFlow)) {
    return null;
  }
  const rawLine = noteFlow?.avoidanceLine;
  if (rawLine === null || rawLine === undefined || rawLine === "") {
    return null;
  }
  const line = Number(rawLine);
  if (!Number.isFinite(line) || line < 0) {
    return null;
  }
  const path = String(noteFlow?.avoidancePath || noteFlow?.path || fallbackPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return path ? { path, line } : null;
}

export function noteFlowNeedsActivationRepair(strokes, frozenLayout) {
  const flows = (Array.isArray(strokes) ? strokes : []).filter((stroke) => stroke?.noteFlow?.enabled);
  if (!flows.length) {
    return false;
  }
  const frozenOffsets = Array.isArray(frozenLayout?.offsets) ? frozenLayout.offsets : [];
  if (!frozenOffsets.length) {
    return true;
  }
  const frozenKeys = new Set(frozenOffsets.map((item) => {
    const path = String(item?.path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const line = Number(item?.line);
    return path && Number.isFinite(line) ? `${path}\0${Math.floor(line)}` : "";
  }).filter(Boolean));
  return flows.some((stroke) => {
    if (hasExactNoteFlowPlacement(stroke.noteFlow)) {
      const path = String(stroke.noteFlow?.path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      const line = Number(stroke.noteFlow?.line);
      return !path || !Number.isFinite(line) || !frozenKeys.has(`${path}\0${Math.floor(line)}`);
    }
    const avoidance = noteFlowAvoidanceReference(stroke.noteFlow);
    return !avoidance
      || !frozenKeys.has(`${avoidance.path}\0${Math.floor(avoidance.line)}`);
  });
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
  const logicalAnchorTop = finite(anchorTop) / safeScale;
  const logicalAnchorBottom = finite(anchorBottom) / safeScale;
  const logicalDesiredBottom = finite(desiredBottom) / safeScale;
  const appliedOffset = Math.max(0, finite(applied));
  const edge = side === "after"
    ? logicalAnchorBottom - appliedOffset
    : logicalAnchorTop;
  return Math.max(0, logicalDesiredBottom - edge);
}

export function noteFlowRowReservation({ rowOffset = 0, boxHeight = 0, gap = 12 } = {}) {
  return Math.max(0, finite(rowOffset))
    + Math.max(0, finite(boxHeight))
    + Math.max(0, finite(gap, 12));
}

export function resizeNoteFlowGeometry(noteFlow, {
  originalBounds,
  resizedBounds,
  contentLeft = 0,
  contentWidth
} = {}) {
  const laneWidth = finite(contentWidth);
  const originalTop = finite(originalBounds?.minY, Number.NaN);
  const minX = finite(resizedBounds?.minX, Number.NaN);
  const minY = finite(resizedBounds?.minY, Number.NaN);
  const maxX = finite(resizedBounds?.maxX, Number.NaN);
  const maxY = finite(resizedBounds?.maxY, Number.NaN);
  if (laneWidth < 24 || ![originalTop, minX, minY, maxX, maxY].every(Number.isFinite)) {
    return null;
  }
  const width = Math.max(2, maxX - minX);
  const height = Math.max(2, maxY - minY);
  return {
    rowOffset: clamp(Math.max(0, finite(noteFlow?.rowOffset) + minY - originalTop), 0, 200_000),
    boxLeftRatio: clamp((minX - finite(contentLeft)) / laneWidth, -2, 3),
    boxWidthRatio: clamp(width / laneWidth, 2 / laneWidth, 5),
    boxHeightRatio: clamp(height / laneWidth, 2 / laneWidth, 5)
  };
}

export function noteFlowReservedRowTop({ side, anchorTop, anchorBottom, applied = 0, scale = 1 } = {}) {
  const visualApplied = Math.max(0, finite(applied)) * Math.max(0.01, finite(scale, 1));
  return side === "after"
    ? finite(anchorBottom) - visualApplied
    : finite(anchorTop);
}

export function projectStableNoteFlowBox({
  boxLeftRatio,
  boxWidthRatio,
  boxHeightRatio,
  contentLeft = 0,
  contentWidth,
  canvasWidth,
  fallbackWidth = 0,
  minWidth = 24,
  y = 0
} = {}) {
  const safeCanvasWidth = Math.max(2, finite(canvasWidth, 2));
  const measuredContentWidth = finite(contentWidth, 0);
  const minimumStableWidth = clamp(Math.max(2, finite(minWidth, 24)), 2, safeCanvasWidth);
  // A transient 0-20px content frame is a layout measurement failure, not a
  // real lane. Projecting against it used to turn NoteFlow ink into a line.
  const laneWidth = measuredContentWidth >= minimumStableWidth
    ? measuredContentWidth
    : safeCanvasWidth;
  const surfaceWidth = Math.max(2, finite(canvasWidth, laneWidth));
  const width = clamp(Math.max(
    minimumStableWidth,
    finite(boxWidthRatio) * laneWidth,
    finite(fallbackWidth)
  ), minimumStableWidth, surfaceWidth);
  const height = Math.max(2, finite(boxHeightRatio) * laneWidth);
  return {
    x: clamp(finite(contentLeft) + finite(boxLeftRatio) * laneWidth, 0, Math.max(0, surfaceWidth - width)),
    y: Math.max(0, finite(y)),
    width,
    height
  };
}

export function projectNoteFlowPointsToBox(points, sourceBounds, targetBox, { canvasWidth, canvasHeight } = {}) {
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const sourceLeft = finite(sourceBounds?.minX);
  const sourceTop = finite(sourceBounds?.minY);
  const sourceWidth = Math.max(0.001, finite(sourceBounds?.maxX) - sourceLeft);
  const sourceHeight = Math.max(0.001, finite(sourceBounds?.maxY) - sourceTop);
  const targetLeft = finite(targetBox?.x);
  const targetTop = finite(targetBox?.y);
  const targetWidth = Math.max(2, finite(targetBox?.width, 2));
  const targetHeight = Math.max(2, finite(targetBox?.height, 2));
  return (Array.isArray(points) ? points : []).map((point) => {
    const x = clamp(finite(point?.x) * width, 0, width);
    const y = clamp(finite(point?.y) * height, 0, height);
    return {
      ...point,
      x: clamp((targetLeft + (x - sourceLeft) / sourceWidth * targetWidth) / width, 0, 1),
      y: clamp((targetTop + (y - sourceTop) / sourceHeight * targetHeight) / height, 0, 1)
    };
  });
}

export function translateNoteFlowPointsToRow(points, sourceBounds, rowY, { canvasWidth, canvasHeight } = {}) {
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const sourceTop = finite(sourceBounds?.minY, Number.NaN);
  const targetTop = finite(rowY, Number.NaN);
  if (!Number.isFinite(sourceTop) || !Number.isFinite(targetTop)) {
    return Array.isArray(points) ? points.map((point) => ({ ...point })) : [];
  }
  const dy = targetTop - sourceTop;
  return (Array.isArray(points) ? points : []).map((point) => ({
    ...point,
    x: clamp(finite(point?.x) * width, 0, width) / width,
    y: clamp(finite(point?.y) * height + dy, 0, height) / height
  }));
}

export function selectOwnedBlankSpaceCandidate(candidates, { clientX, clientY } = {}) {
  const x = finite(clientX, Number.NaN);
  const y = finite(clientY, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return (Array.isArray(candidates) ? candidates : []).map((candidate, order) => {
    const rect = candidate?.rect;
    const left = finite(rect?.left, Number.NaN);
    const right = finite(rect?.right, Number.NaN);
    const top = finite(rect?.top, Number.NaN);
    const bottom = finite(rect?.bottom, Number.NaN);
    const applied = Math.max(0, finite(candidate?.applied));
    const scale = Math.max(0.01, finite(candidate?.scale, 1));
    if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top || applied <= 0) {
      return null;
    }
    const externalBefore = candidate?.styleProperty === "margin-top";
    const externalAfter = candidate?.styleProperty === "margin-bottom";
    const visualApplied = externalBefore || externalAfter
      ? applied * scale
      : Math.min(bottom - top, applied * scale);
    const heightOwned = candidate?.styleProperty === "height" || candidate?.property === "height";
    const ownedTop = externalBefore
      ? top - visualApplied
      : externalAfter
        ? bottom
        : heightOwned || candidate?.property === "padding-top" ? top : bottom - visualApplied;
    const ownedBottom = externalBefore
      ? top
      : externalAfter
        ? bottom + visualApplied
        : heightOwned || candidate?.property === "padding-bottom" ? bottom : top + visualApplied;
    if (x < left || x > right || y < ownedTop || y > ownedBottom) {
      return null;
    }
    return { ...candidate, ownedTop, ownedBottom, visualApplied, order };
  }).filter(Boolean).sort((a, b) => (
    b.visualApplied - a.visualApplied
    || b.ownedBottom - a.ownedBottom
    || b.order - a.order
  ))[0] || null;
}

export function normalizeFrozenNoteFlowLayout(value) {
  const records = new Map();
  for (const item of Array.isArray(value?.offsets) ? value.offsets : []) {
    const path = String(item?.path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const line = Number(item?.line);
    const property = item?.property === "padding-bottom" || item?.side === "after"
      ? "padding-bottom"
      : "padding-top";
    const side = property === "padding-bottom" ? "after" : "before";
    const offset = clamp(finite(item?.offset), 0, 200_000);
    if (!path || !Number.isFinite(line) || line < 0 || offset <= 0) {
      continue;
    }
    const blockStart = Number(item?.blockStart);
    const blockEnd = Number(item?.blockEnd);
    const normalized = {
      path,
      line: Math.floor(line),
      blockStart: Number.isFinite(blockStart) && blockStart >= 0 ? Math.floor(blockStart) : Math.floor(line),
      blockEnd: Number.isFinite(blockEnd) && blockEnd >= 0 ? Math.floor(blockEnd) : Math.floor(line),
      side,
      property,
      offset: Math.round(offset * 1000) / 1000
    };
    normalized.blockKey = noteFlowBlockKey(normalized);
    if (typeof item?.ownerId === "string" && item.ownerId) {
      normalized.ownerId = item.ownerId.slice(0, 160);
    }
    const key = `${normalized.blockKey}\0${normalized.property}`;
    const previous = records.get(key);
    if (!previous || normalized.offset > previous.offset) {
      records.set(key, normalized);
    }
  }
  return {
    version: 1,
    offsets: Array.from(records.values()).sort((a, b) => (
      a.path.localeCompare(b.path)
      || a.blockStart - b.blockStart
      || a.blockEnd - b.blockEnd
      || a.property.localeCompare(b.property)
    ))
  };
}

export function frozenNoteFlowLayoutSignature(value) {
  return normalizeFrozenNoteFlowLayout(value).offsets.map((item) => (
    `${item.blockKey}:${item.property}:${item.offset}${item.ownerId ? `:${item.ownerId}` : ""}`
  )).join("|");
}

export function shouldRenderStrokeOnSurface(stroke, surfaceType) {
  return !(surfaceType === "source" && stroke?.noteFlow?.enabled);
}

export function shouldPlaceStrokeBelowMarkdown(stroke) {
  return Boolean(stroke?.belowMarkdown || stroke?.noteFlow?.enabled);
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

export function reflowNoteFlowRectangles(items, {
  gap = 6,
  allowOverlap = false,
  blockers = []
} = {}) {
  const defaultGap = Math.max(0, finite(gap, 6));
  const normalized = (Array.isArray(items) ? items : []).map((item, order) => {
    const minX = finite(item?.minX, Number.NaN);
    const maxX = finite(item?.maxX, Number.NaN);
    const minY = finite(item?.minY, Number.NaN);
    const maxY = finite(item?.maxY, Number.NaN);
    if (![minX, maxX, minY, maxY].every(Number.isFinite) || maxX < minX || maxY < minY) {
      return null;
    }
    return {
      ...item,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : order,
      minX,
      maxX,
      minY,
      maxY,
      baseMinY: finite(item?.baseMinY, minY),
      originalMinY: finite(item?.originalMinY, minY),
      height: Math.max(0, maxY - minY),
      gap: Math.max(0, finite(item?.gap, defaultGap)),
      moved: Boolean(item?.moved),
      rowKey: typeof item?.rowKey === "string" ? item.rowKey : "",
      align: item?.align === "bottom" ? "bottom" : "top"
    };
  }).filter(Boolean);
  const horizontallyOverlaps = (first, second) => (
    Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX) > 0.5
  );

  if (allowOverlap) {
    const fixedBlockers = (Array.isArray(blockers) ? blockers : []).map((blocker) => {
      const minX = finite(blocker?.minX, Number.NaN);
      const maxX = finite(blocker?.maxX, Number.NaN);
      const minY = finite(blocker?.minY, Number.NaN);
      const maxY = finite(blocker?.maxY, Number.NaN);
      return [minX, maxX, minY, maxY].every(Number.isFinite) && maxX >= minX && maxY >= minY
        ? { ...blocker, minX, maxX, minY, maxY }
        : null;
    }).filter(Boolean);
    const grouped = new Map();
    for (const item of normalized) {
      const key = item.rowKey || `item:${item.order}`;
      const group = grouped.get(key) || [];
      group.push(item);
      grouped.set(key, group);
    }
    const groupOffsets = new Map();
    for (const [key, group] of grouped) {
      let offset = 0;
      let changed = true;
      let attempts = 0;
      while (changed && attempts < fixedBlockers.length + 2) {
        changed = false;
        attempts += 1;
        for (const item of group) {
          const shifted = {
            ...item,
            minY: item.baseMinY + offset,
            maxY: item.baseMinY + offset + item.height
          };
          for (const blocker of fixedBlockers) {
            if (blocker.blockKey && blocker.blockKey === item.anchorBlockKey) {
              continue;
            }
            const anchorMinY = Number(item.anchorMinY);
            const anchorMaxY = Number(item.anchorMaxY);
            const sharesAnchorRow = !Number.isFinite(anchorMinY) || !Number.isFinite(anchorMaxY)
              || Math.min(anchorMaxY, blocker.maxY) - Math.max(anchorMinY, blocker.minY) > 0.5;
            if (!sharesAnchorRow) {
              continue;
            }
            const overlaps = horizontallyOverlaps(shifted, blocker)
              && Math.min(shifted.maxY, blocker.maxY) - Math.max(shifted.minY, blocker.minY) > 0.5;
            if (!overlaps) {
              continue;
            }
            const nextOffset = blocker.maxY + Math.max(defaultGap, item.gap) - item.baseMinY;
            if (nextOffset > offset + 0.5) {
              offset = nextOffset;
              changed = true;
            }
          }
        }
      }
      groupOffsets.set(key, Math.max(0, offset));
    }
    return normalized.map((item) => ({
      id: item.id,
      index: item.index,
      minX: item.minX,
      maxX: item.maxX,
      minY: item.baseMinY + (groupOffsets.get(item.rowKey || `item:${item.order}`) || 0),
      maxY: item.baseMinY + (groupOffsets.get(item.rowKey || `item:${item.order}`) || 0) + item.height,
      rowKey: item.rowKey,
      deltaY: item.baseMinY + (groupOffsets.get(item.rowKey || `item:${item.order}`) || 0) - item.originalMinY
    }));
  }

  const rows = [];
  const ordered = normalized.slice().sort((a, b) => (
    a.baseMinY - b.baseMinY
    || a.order - b.order
    || Number(b.moved) - Number(a.moved)
  ));
  for (const item of ordered) {
    const row = rows.find((candidate) => {
      const sameLogicalRow = item.rowKey
        ? candidate.rowKey === item.rowKey
        : !candidate.rowKey && Math.abs(candidate.baseMinY - item.baseMinY) <= 0.5;
      return sameLogicalRow && !candidate.items.some((other) => horizontallyOverlaps(item, other));
    });
    if (row) {
      row.items.push(item);
      row.height = Math.max(row.height, item.height);
      row.gap = Math.max(row.gap, item.gap);
      row.moved = row.moved || item.moved;
      continue;
    }
    rows.push({
      rowKey: item.rowKey,
      baseMinY: item.baseMinY,
      height: item.height,
      gap: item.gap,
      moved: item.moved,
      order: item.order,
      items: [item]
    });
  }

  rows.sort((a, b) => (
    a.baseMinY - b.baseMinY
    || a.order - b.order
    || Number(b.moved) - Number(a.moved)
  ));
  const settledRows = [];
  for (const row of rows) {
    let minY = row.baseMinY;
    let changed = true;
    while (changed) {
      changed = false;
      for (const blocker of settledRows) {
        const differentLogicalGaps = row.rowKey && blocker.rowKey && row.rowKey !== blocker.rowKey;
        if (differentLogicalGaps) {
          continue;
        }
        const sameLogicalGap = row.rowKey && blocker.rowKey && row.rowKey === blocker.rowKey;
        const overlapsLane = sameLogicalGap || row.items.some((item) => blocker.items.some((other) => horizontallyOverlaps(item, other)));
        if (!overlapsLane) {
          continue;
        }
        const clearance = Math.max(defaultGap, row.gap, blocker.gap);
        if (minY >= blocker.maxY + clearance || minY + row.height <= blocker.minY) {
          continue;
        }
        minY = blocker.maxY + clearance;
        changed = true;
      }
    }
    row.minY = minY;
    row.maxY = minY + row.height;
    for (const item of row.items) {
      item.minY = item.align === "bottom" ? row.maxY - item.height : row.minY;
      item.maxY = item.minY + item.height;
    }
    settledRows.push(row);
  }

  return normalized.map((item) => ({
    id: item.id,
    index: item.index,
    minX: item.minX,
    maxX: item.maxX,
    minY: item.minY,
    maxY: item.maxY,
    rowKey: item.rowKey,
    deltaY: item.minY - item.originalMinY
  }));
}

export function packNoteFlowInlineRectangles(items, {
  anchor,
  blockers = [],
  laneLeft = 0,
  laneRight,
  gap = 6,
  allowItemOverlap = false
} = {}) {
  const left = finite(laneLeft, 0);
  const right = Math.max(left, finite(laneRight, left));
  const clearance = Math.max(0, finite(gap, 6));
  const normalizeRect = (rect, index = -1) => {
    const minX = finite(rect?.minX, Number.NaN);
    const maxX = finite(rect?.maxX, Number.NaN);
    const minY = finite(rect?.minY, Number.NaN);
    const maxY = finite(rect?.maxY, Number.NaN);
    return [minX, maxX, minY, maxY].every(Number.isFinite) && maxX >= minX && maxY >= minY
      ? { ...rect, index, minX, maxX, minY, maxY }
      : null;
  };
  const fixedAnchor = normalizeRect(anchor);
  if (!fixedAnchor) {
    return [];
  }
  const fixed = [
    fixedAnchor,
    ...(Array.isArray(blockers) ? blockers : []).map((rect, index) => normalizeRect(rect, index)).filter(Boolean)
  ];
  const normalized = (Array.isArray(items) ? items : []).map((item, order) => {
    const rect = normalizeRect(item, Number.isFinite(Number(item?.index)) ? Number(item.index) : order);
    return rect ? {
      ...rect,
      id: item?.id,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : order,
      width: Math.max(0, rect.maxX - rect.minX),
      height: Math.max(0, rect.maxY - rect.minY),
      originalMinX: rect.minX,
      originalMinY: rect.minY
    } : null;
  }).filter(Boolean).sort((a, b) => a.order - b.order || a.originalMinX - b.originalMinX || a.index - b.index);
  const placed = [];
  const verticalOverlap = (rect, y, height) => Math.min(rect.maxY, y + height) - Math.max(rect.minY, y) > 0.5;
  const firstRowLeft = Math.min(right, Math.max(left, fixedAnchor.maxX + clearance));

  for (const item of normalized) {
    let y = allowItemOverlap
      ? Math.max(fixedAnchor.minY, item.originalMinY)
      : fixedAnchor.minY;
    let firstRow = true;
    let placement = null;
    const limit = fixed.length + placed.length + 8;
    for (let attempt = 0; attempt < limit; attempt += 1) {
      const occupied = [...fixed, ...(allowItemOverlap ? [] : placed)]
        .filter((rect) => verticalOverlap(rect, y, item.height))
        .sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
      const preferredLeft = allowItemOverlap
        ? Math.max(firstRowLeft, Math.min(right - item.width, item.originalMinX))
        : firstRow ? firstRowLeft : left;
      let x = Math.max(left, preferredLeft);
      for (const rect of occupied) {
        if (x + item.width <= rect.minX - clearance) {
          break;
        }
        if (x < rect.maxX + clearance && x + item.width > rect.minX - clearance) {
          x = rect.maxX + clearance;
        }
      }
      if (x + item.width <= right + 0.5 || !occupied.length) {
        placement = { ...item, minX: x, maxX: x + item.width, minY: y, maxY: y + item.height };
        break;
      }
      const nextY = Math.min(...occupied.map((rect) => rect.maxY + clearance).filter((value) => value > y + 0.5));
      y = Number.isFinite(nextY) ? nextY : y + Math.max(item.height, clearance);
      firstRow = false;
    }
    placement ||= {
      ...item,
      minX: left,
      maxX: left + item.width,
      minY: y,
      maxY: y + item.height
    };
    placed.push(placement);
  }

  return placed.map((item) => ({
    id: item.id,
    index: item.index,
    minX: item.minX,
    maxX: item.maxX,
    minY: item.minY,
    maxY: item.maxY,
    deltaX: item.minX - item.originalMinX,
    deltaY: item.minY - item.originalMinY
  }));
}
