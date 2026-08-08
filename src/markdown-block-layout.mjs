function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function resolveSelectionResizeScales({
  scaleX = 1,
  scaleY = 1,
  deltaX = 0,
  deltaY = 0,
  dominance = 1.35
} = {}) {
  const x = Number(scaleX);
  const y = Number(scaleY);
  const dx = Math.abs(Number(deltaX) || 0);
  const dy = Math.abs(Number(deltaY) || 0);
  const ratio = Math.max(1, Number(dominance) || 1.35);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { scaleX: 1, scaleY: 1, axis: null };
  }
  if (dx > dy * ratio) {
    return { scaleX: x, scaleY: 1, axis: "x" };
  }
  if (dy > dx * ratio) {
    return { scaleX: 1, scaleY: y, axis: "y" };
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
  const intentionalGrowth = Math.max(8, natural * 0.08);
  return desired >= natural + intentionalGrowth ? desired : 0;
}

export function markdownBlockPresentationMinHeight(block) {
  return block?.floating ? 0 : normalizeMarkdownBlockMinHeight(block?.minHeight);
}

export function resolveDragDropHorizontalIntent({
  clientX,
  targetLeft,
  targetRight,
  laneLeft = targetLeft,
  laneRight = targetRight,
  horizontalRoom = true
} = {}) {
  const x = Number(clientX);
  const left = Number(targetLeft);
  const right = Number(targetRight);
  const surfaceLeft = Number(laneLeft);
  const surfaceRight = Number(laneRight);
  if (![x, left, right, surfaceLeft, surfaceRight].every(Number.isFinite) || right <= left || surfaceRight <= surfaceLeft) {
    return "vertical";
  }
  const targetWidth = right - left;
  const laneWidth = surfaceRight - surfaceLeft;
  const leftThreshold = Math.max(
    surfaceLeft + clamp(laneWidth * 0.1, 36, 72),
    left + clamp(targetWidth * 0.18, 36, 72)
  );
  if (x <= leftThreshold) {
    return "line-start";
  }
  const rightThreshold = Math.min(
    left + targetWidth * 0.82,
    surfaceRight - clamp(laneWidth * 0.08, 32, 64)
  );
  return horizontalRoom && x >= rightThreshold ? "inline-right" : "vertical";
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
