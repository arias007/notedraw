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
    boundary: placement.boundary
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

export function noteFlowAvoidanceReference(noteFlow, fallbackPath = "") {
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
    const visualApplied = Math.min(bottom - top, applied * scale);
    const heightOwned = candidate?.styleProperty === "height" || candidate?.property === "height";
    const ownedTop = heightOwned || candidate?.property === "padding-top" ? top : bottom - visualApplied;
    const ownedBottom = heightOwned || candidate?.property === "padding-bottom" ? bottom : top + visualApplied;
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
    const normalized = {
      path,
      line: Math.floor(line),
      side,
      property,
      offset: Math.round(offset * 1000) / 1000
    };
    if (typeof item?.ownerId === "string" && item.ownerId) {
      normalized.ownerId = item.ownerId.slice(0, 160);
    }
    const key = `${normalized.path}\0${normalized.line}\0${normalized.property}`;
    const previous = records.get(key);
    if (!previous || normalized.offset > previous.offset) {
      records.set(key, normalized);
    }
  }
  return {
    version: 1,
    offsets: Array.from(records.values()).sort((a, b) => (
      a.path.localeCompare(b.path)
      || a.line - b.line
      || a.property.localeCompare(b.property)
    ))
  };
}

export function frozenNoteFlowLayoutSignature(value) {
  return normalizeFrozenNoteFlowLayout(value).offsets.map((item) => (
    `${item.path}:${item.line}:${item.property}:${item.offset}${item.ownerId ? `:${item.ownerId}` : ""}`
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

export function reflowNoteFlowRectangles(items, { gap = 6 } = {}) {
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
      originalMinY: finite(item?.originalMinY, minY),
      height: Math.max(0, maxY - minY),
      gap: Math.max(0, finite(item?.gap, defaultGap)),
      moved: Boolean(item?.moved)
    };
  }).filter(Boolean);
  const moved = normalized.filter((item) => item.moved);
  const flowing = normalized.filter((item) => !item.moved)
    .sort((a, b) => a.minY - b.minY || a.order - b.order);
  const settled = [...moved];
  const horizontallyOverlaps = (first, second) => (
    Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX) > 0.5
  );

  for (const item of flowing) {
    let minY = item.minY;
    let changed = true;
    while (changed) {
      changed = false;
      const maxY = minY + item.height;
      for (const blocker of settled) {
        if (!horizontallyOverlaps(item, blocker)) {
          continue;
        }
        const clearance = Math.max(defaultGap, item.gap, blocker.gap);
        if (maxY <= blocker.minY || minY >= blocker.maxY + clearance) {
          continue;
        }
        minY = blocker.maxY + clearance;
        changed = true;
      }
    }
    item.minY = minY;
    item.maxY = minY + item.height;
    settled.push(item);
  }

  return normalized.map((item) => ({
    id: item.id,
    index: item.index,
    minX: item.minX,
    maxX: item.maxX,
    minY: item.minY,
    maxY: item.maxY,
    deltaY: item.minY - item.originalMinY
  }));
}
