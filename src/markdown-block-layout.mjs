function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function resolveSelectionResizeScales({
  scaleX = 1,
  scaleY = 1
} = {}) {
  const x = Number(scaleX);
  const y = Number(scaleY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { scaleX: 1, scaleY: 1, axis: null };
  }
  return { scaleX: x, scaleY: y, axis: null };
}

export function normalizeMarkdownBlockMinHeight(value, maxHeight = 2400) {
  const height = Number(value);
  if (!Number.isFinite(height) || height <= 0) {
    return 0;
  }
  return Math.round(clamp(height, 0, Math.max(0, Number(maxHeight) || 2400)));
}

export function resizeMarkdownBlockMinHeight({
  currentHeight,
  naturalHeight,
  scaleY,
  maxHeight = 2400
} = {}) {
  const natural = Math.max(1, Number(naturalHeight) || 1);
  const current = Math.max(natural, Number(currentHeight) || natural);
  const desired = normalizeMarkdownBlockMinHeight(current * Math.max(0.12, Math.abs(Number(scaleY) || 1)), maxHeight);
  return desired >= natural + 1 ? desired : 0;
}

export function markdownBlockPresentationMinHeight(block) {
  return block?.floating ? 0 : normalizeMarkdownBlockMinHeight(block?.minHeight);
}

export function trimMarkdownClientRect(rect, {
  insetTop = 0,
  insetBottom = 0,
  scale = 1
} = {}) {
  const left = Number(rect?.left);
  const right = Number(rect?.right);
  const top = Number(rect?.top);
  const bottom = Number(rect?.bottom);
  if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    return null;
  }
  const visualScale = Math.max(0, Number(scale) || 0);
  const visibleTop = top + Math.max(0, Number(insetTop) || 0) * visualScale;
  const visibleBottom = bottom - Math.max(0, Number(insetBottom) || 0) * visualScale;
  if (visibleBottom <= visibleTop) {
    return null;
  }
  return {
    left,
    right,
    top: visibleTop,
    bottom: visibleBottom,
    width: right - left,
    height: visibleBottom - visibleTop
  };
}

export function clientPointInRect(rect, clientPoint = {}) {
  const x = Number(clientPoint?.x);
  const y = Number(clientPoint?.y);
  return Boolean(rect)
    && Number.isFinite(x)
    && Number.isFinite(y)
    && x >= rect.left
    && x <= rect.right
    && y >= rect.top
    && y <= rect.bottom;
}

export function markdownClientRectsOverlap(first, second, minimumOverlap = 4) {
  const values = [
    first?.left,
    first?.right,
    first?.top,
    first?.bottom,
    second?.left,
    second?.right,
    second?.top,
    second?.bottom
  ].map(Number);
  if (!values.every(Number.isFinite)) {
    return false;
  }
  const overlapX = Math.min(values[1], values[5]) - Math.max(values[0], values[4]);
  const overlapY = Math.min(values[3], values[7]) - Math.max(values[2], values[6]);
  const threshold = Math.max(0, Number(minimumOverlap) || 0);
  return overlapX > threshold && overlapY > threshold;
}

export function resolveDragDropHorizontalIntent({
  clientX,
  targetLeft,
  targetRight,
  laneLeft = targetLeft,
  laneRight = targetRight,
  draggedLeft,
  leftContactTolerance = 8,
  rightIntentRatio = 0.82,
  horizontalRoom = true
} = {}) {
  const x = Number(clientX);
  const left = Number(targetLeft);
  const right = Number(targetRight);
  const surfaceLeft = Number(laneLeft);
  const surfaceRight = Number(laneRight);
  const movingLeft = draggedLeft === null || draggedLeft === undefined || draggedLeft === ""
    ? Number.NaN
    : Number(draggedLeft);
  if (![x, left, right, surfaceLeft, surfaceRight].every(Number.isFinite) || right <= left || surfaceRight <= surfaceLeft) {
    return "vertical";
  }
  const targetWidth = right - left;
  const laneWidth = surfaceRight - surfaceLeft;
  const contactTolerance = clamp(Number(leftContactTolerance) || 0, 0, 24);
  if (Number.isFinite(movingLeft) && movingLeft <= surfaceLeft + contactTolerance) {
    return "line-start";
  }
  const rightThreshold = Math.min(
    left + targetWidth * clamp(Number(rightIntentRatio) || 0.82, 0.5, 0.92),
    surfaceRight - clamp(laneWidth * 0.08, 32, 64)
  );
  return horizontalRoom && x >= rightThreshold ? "inline-right" : "vertical";
}

export function resolveVerticalMarkdownDropTarget({
  clientX,
  clientY,
  laneRect,
  candidates = [],
  laneMargin = 48,
  minimumEdgeDistance = 96
} = {}) {
  const x = Number(clientX);
  const y = Number(clientY);
  const laneLeft = Number(laneRect?.left);
  const laneRight = Number(laneRect?.right);
  if (![x, y, laneLeft, laneRight].every(Number.isFinite) || laneRight <= laneLeft) {
    return null;
  }
  const entries = candidates.filter((candidate) => {
    const rect = candidate?.rect;
    return candidate?.element
      && [rect?.left, rect?.right, rect?.top, rect?.bottom].every((value) => Number.isFinite(Number(value)))
      && Number(rect.right) > Number(rect.left)
      && Number(rect.bottom) > Number(rect.top);
  }).sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  if (!entries.length || x < laneLeft - laneMargin || x > laneRight + laneMargin) {
    return null;
  }
  const first = entries[0];
  const last = entries[entries.length - 1];
  const firstHeight = first.rect.height || first.rect.bottom - first.rect.top;
  const lastHeight = last.rect.height || last.rect.bottom - last.rect.top;
  const topDistance = Math.max(minimumEdgeDistance, firstHeight * 1.5);
  const bottomDistance = Math.max(minimumEdgeDistance, lastHeight * 1.5);
  if (y <= first.rect.top && first.rect.top - y <= topDistance) {
    return { element: first.element, side: "before" };
  }
  if (y >= last.rect.bottom && y - last.rect.bottom <= bottomDistance) {
    return { element: last.element, side: "after" };
  }
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const next = entries[index];
    if (y < previous.rect.bottom || y > next.rect.top) {
      continue;
    }
    const boundary = (previous.rect.bottom + next.rect.top) / 2;
    return y <= boundary
      ? { element: previous.element, side: "after" }
      : { element: next.element, side: "before" };
  }
  return null;
}

export function normalizeMarkdownFloatBox(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) {
    return null;
  }
  const width = clamp(Number(value.width) || 0.5, 0.08, 1);
  const height = clamp(Number(value.height) || 0.1, 0.02, 1);
  return {
    x: clamp(Number(value.x), 0, 1),
    y: clamp(Number(value.y), 0, 1),
    width,
    height
  };
}
