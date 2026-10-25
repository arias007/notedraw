export const RESPONSIVE_POINT_BASIS = "note-content-v1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLinePosition(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const line = Number(value);
  return Number.isFinite(line) && line >= 0 ? line : null;
}

function normalizeLineConfidence(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const confidence = Number(value);
  return Number.isFinite(confidence) ? clamp(confidence, 0, 1) : null;
}

function isEndClampedLine(line) {
  if (!Number.isFinite(line)) {
    return false;
  }
  return line - Math.floor(line) >= 0.985;
}

function canTrustLineAnchor(anchor) {
  if (anchor.line === null) {
    return false;
  }
  if (anchor.lineConfidence !== null) {
    return anchor.lineConfidence >= 0.75;
  }
  return !isEndClampedLine(anchor.line);
}

export function normalizeContentFrame({ surfaceWidth, contentLeft = 0, contentWidth } = {}) {
  const width = Math.max(1, finite(surfaceWidth, 1));
  const left = clamp(finite(contentLeft, 0), -width, width * 2);
  const available = Math.max(1, width - Math.max(0, left));
  const frameWidth = clamp(finite(contentWidth, available), 1, width * 2);
  return { left, width: frameWidth, surfaceWidth: width };
}

export function mapClientPointToCanvas({ clientX, clientY } = {}, geometry = {}) {
  const rect = geometry.rect || geometry;
  const rectLeft = finite(rect?.left, 0);
  const rectTop = finite(rect?.top, 0);
  const rectWidth = finite(rect?.width, 0);
  const rectHeight = finite(rect?.height, 0);
  const canvasWidth = Math.max(1, finite(geometry.canvasWidth, Math.max(1, rectWidth)));
  const canvasHeight = Math.max(1, finite(geometry.canvasHeight, Math.max(1, rectHeight)));
  const canvasRenderHeight = Math.max(1, finite(geometry.canvasRenderHeight, Math.max(1, rectHeight)));
  const canvasWindowTop = finite(geometry.canvasWindowTop, 0);
  const xScale = rectWidth > 0 ? canvasWidth / rectWidth : 1;
  const yScale = rectHeight > 0 ? canvasRenderHeight / rectHeight : 1;
  return {
    canvasX: (finite(clientX, rectLeft) - rectLeft) * xScale,
    canvasY: (finite(clientY, rectTop) - rectTop) * yScale + canvasWindowTop,
    canvasWidth,
    canvasHeight
  };
}

export function mapResizeClientDeltaToPoint({ clientX, clientY } = {}, {
  startClient,
  corner,
  geometry = {},
  clientBounds
} = {}) {
  const rect = geometry.rect || geometry;
  const rectLeft = finite(rect?.left, 0);
  const rectTop = finite(rect?.top, 0);
  const rectWidth = finite(rect?.width, 0);
  const rectHeight = finite(rect?.height, 0);
  const startX = Number(startClient?.x);
  const startY = Number(startClient?.y);
  const cornerX = Number(corner?.x);
  const cornerY = Number(corner?.y);
  if (rectWidth <= 0 || rectHeight <= 0 || ![startX, startY, cornerX, cornerY].every(Number.isFinite)) {
    return null;
  }
  const clientLeft = Math.max(rectLeft, finite(clientBounds?.left, rectLeft));
  const clientRight = Math.min(rectLeft + rectWidth, finite(clientBounds?.right, rectLeft + rectWidth));
  const clientTop = Math.max(rectTop, finite(clientBounds?.top, rectTop));
  const clientBottom = Math.min(rectTop + rectHeight, finite(clientBounds?.bottom, rectTop + rectHeight));
  const boundedClientX = clamp(finite(clientX, startX), Math.min(clientLeft, startX), Math.max(clientRight, startX));
  const boundedClientY = clamp(finite(clientY, startY), Math.min(clientTop, startY), Math.max(clientBottom, startY));
  const canvasHeight = Math.max(1, finite(geometry.canvasHeight, rectHeight));
  const canvasRenderHeight = Math.max(1, finite(geometry.canvasRenderHeight, rectHeight));
  return {
    x: cornerX + (boundedClientX - startX) / rectWidth,
    y: cornerY + (boundedClientY - startY) * canvasRenderHeight / rectHeight / canvasHeight
  };
}

export function constrainWideContentFrame(frameInput, {
  isMobile = false,
  minSurfaceWidth = 900,
  minLaneWidth = 720,
  maxLaneWidth = 860,
  filledRatio = 0.78
} = {}) {
  const frame = normalizeContentFrame(frameInput);
  if (isMobile || frame.surfaceWidth < minSurfaceWidth || frame.width / frame.surfaceWidth < filledRatio) {
    return frame;
  }
  const laneLimit = clamp(frame.surfaceWidth * 0.72, minLaneWidth, maxLaneWidth);
  const available = Math.max(1, frame.surfaceWidth - Math.max(0, frame.left));
  return {
    ...frame,
    width: Math.min(frame.width, laneLimit, available)
  };
}

export function normalizeResponsiveAnchor(anchor) {
  if (!anchor || anchor.basis !== RESPONSIVE_POINT_BASIS) {
    return null;
  }
  return {
    v: 1,
    basis: RESPONSIVE_POINT_BASIS,
    x: clamp(finite(anchor.x, 0), -1, 2),
    y: clamp(finite(anchor.y, 0), 0, 1),
    path: typeof anchor.path === "string" ? anchor.path : "",
    line: normalizeLinePosition(anchor.line),
    lineConfidence: normalizeLineConfidence(anchor.lineConfidence),
    offsetY: Number.isFinite(Number(anchor.offsetY)) ? clamp(Number(anchor.offsetY), -100_000, 100_000) : 0,
    // Absolute document row of the point at capture time. Without it the only
    // fallback is a ratio of the document height, so ink moves whenever any
    // other element makes the note taller or shorter.
    docY: Number.isFinite(Number(anchor.docY)) ? clamp(Number(anchor.docY), -100_000, 2_000_000) : null,
    docWidth: Number.isFinite(Number(anchor.docWidth)) ? clamp(Number(anchor.docWidth), 1, 100_000) : null
  };
}

export function createResponsivePoint({
  canvasX,
  canvasY,
  canvasWidth,
  canvasHeight,
  frame,
  sourcePath = "",
  linePosition = null,
  lineConfidence = null,
  lineOffsetY = 0,
  time = Date.now()
}) {
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const normalizedFrame = normalizeContentFrame({
    surfaceWidth: width,
    contentLeft: frame?.left,
    contentWidth: frame?.width
  });
  const x = clamp(finite(canvasX, 0) / width, 0, 1);
  const y = clamp(finite(canvasY, 0) / height, 0, 1);
  return {
    x,
    y,
    t: Number.isFinite(Number(time)) ? Number(time) : Date.now(),
    anchor: {
      v: 1,
      basis: RESPONSIVE_POINT_BASIS,
      x: clamp((finite(canvasX, 0) - normalizedFrame.left) / normalizedFrame.width, -1, 2),
      y,
      path: typeof sourcePath === "string" ? sourcePath : "",
      line: normalizeLinePosition(linePosition),
      lineConfidence: normalizeLineConfidence(lineConfidence),
      offsetY: Number.isFinite(Number(lineOffsetY)) ? clamp(Number(lineOffsetY), -100_000, 100_000) : 0,
      docY: clamp(finite(canvasY, 0), -100_000, 2_000_000),
      docWidth: normalizedFrame.width
    }
  };
}

export function projectResponsivePoint(point, {
  canvasWidth,
  canvasHeight,
  frame,
  lineToCanvasY,
  allowLineAnchor = true
} = {}) {
  const width = Math.max(1, finite(canvasWidth, 1));
  const height = Math.max(1, finite(canvasHeight, 1));
  const anchor = normalizeResponsiveAnchor(point?.anchor);
  if (!anchor) {
    return {
      ...point,
      x: clamp(finite(point?.x, 0), 0, 1),
      y: clamp(finite(point?.y, 0), 0, 1)
    };
  }
  const normalizedFrame = normalizeContentFrame({
    surfaceWidth: width,
    contentLeft: frame?.left,
    contentWidth: frame?.width
  });
  const anchoredY = allowLineAnchor !== false && anchor.line !== null && typeof lineToCanvasY === "function"
    ? Number(lineToCanvasY(anchor.path, anchor.line))
    : NaN;
  const canvasX = normalizedFrame.left + anchor.x * normalizedFrame.width;
  // Same content lane means the Markdown did not reflow: the note simply got
  // taller or shorter (another element, a NoteFlow reservation, a view swap).
  // Keep the ink on its absolute document row instead of scaling it. When the
  // lane itself changed, the layout really did reflow, so the ratio is the only
  // meaningful mapping left.
  const laneScale = Number.isFinite(anchor.docWidth) && anchor.docWidth > 0
    ? normalizedFrame.width / anchor.docWidth
    : NaN;
  const sameContentLane = Number.isFinite(laneScale) && laneScale >= 0.82 && laneScale <= 1.2;
  const fallbackCanvasY = sameContentLane && Number.isFinite(anchor.docY)
    ? clamp(anchor.docY, 0, height)
    : anchor.y * height;
  // Versions 3.1.38-3.1.39 serialized a missing line as 0. Reject implausible
  // line-zero jumps while preserving real anchors created near the first line.
  const firstLineIsPlausible = anchor.line === null || anchor.line >= 1 || anchor.y <= 0.15;
  const lineAnchorIsReliable = canTrustLineAnchor(anchor);
  const lineShiftIsPlausible = anchor.line !== null && anchor.line >= 1
    ? true
    : Math.abs(anchoredY - fallbackCanvasY) <= Math.max(96, height * 0.18);
  const canUseLineAnchor = Number.isFinite(anchoredY) &&
    firstLineIsPlausible &&
    lineAnchorIsReliable &&
    lineShiftIsPlausible;
  const canvasY = canUseLineAnchor ? anchoredY + anchor.offsetY : fallbackCanvasY;
  return {
    ...point,
    x: clamp(canvasX / width, 0, 1),
    y: clamp(canvasY / height, 0, 1),
    anchor
  };
}
