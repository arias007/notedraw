export const ELEMENT_LAYOUT_BASIS = "note-element-frame-v1";
export const ELEMENT_LAYOUT_VERSION = 1;

const CORNER_NAMES = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLine(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeLineConfidence(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0, 1) : null;
}

function isEndClampedLine(line) {
  if (!Number.isFinite(line)) {
    return false;
  }
  return line - Math.floor(line) >= 0.985;
}

function canTrustCornerLine(corner) {
  if (!corner || corner.line === null) {
    return false;
  }
  if (corner.lineConfidence !== null) {
    return corner.lineConfidence >= 0.75;
  }
  return !isEndClampedLine(corner.line);
}

function normalizeFrame(frame = {}) {
  const surfaceWidth = Math.max(1, finite(frame.surfaceWidth, frame.width || 1));
  const contentLeft = clamp(finite(frame.contentLeft, frame.left || 0), -surfaceWidth, surfaceWidth * 2);
  const contentWidth = clamp(finite(frame.contentWidth, frame.width || surfaceWidth), 1, surfaceWidth * 2);
  const viewportHeight = Math.max(1, finite(frame.viewportHeight, frame.documentHeight || 1));
  const documentHeight = Math.max(1, finite(frame.documentHeight, viewportHeight));
  return {
    surfaceWidth,
    contentLeft,
    contentWidth,
    viewportHeight,
    documentHeight,
    aspectRatio: contentWidth / viewportHeight
  };
}

function normalizeCorner(corner) {
  if (!corner) {
    return null;
  }
  return {
    x: clamp(finite(corner.x, 0), -2, 3),
    y: clamp(finite(corner.y, 0), 0, 1),
    path: typeof corner.path === "string" ? corner.path : "",
    line: normalizeLine(corner.line),
    lineConfidence: normalizeLineConfidence(corner.lineConfidence)
  };
}

function normalizeBox(box = {}) {
  return {
    x: finite(box.x, 0),
    y: finite(box.y, 0),
    width: Math.max(0.01, finite(box.width, 0.01)),
    height: Math.max(0.01, finite(box.height, 0.01))
  };
}

function normalizeMetrics(metrics = {}) {
  const result = {};
  for (const key of ["width", "fontSize", "textWidth", "previewWidth", "previewHeight"]) {
    const value = Number(metrics[key]);
    if (Number.isFinite(value) && value > 0) {
      result[key] = value;
    }
  }
  return result;
}

function normalizeRelation(relation) {
  if (!relation || typeof relation.targetId !== "string" || !relation.targetId) {
    return null;
  }
  const kind = ["intersection", "overlap", "near"].includes(relation.kind) ? relation.kind : "near";
  const sourceU = Number(relation.sourceU);
  const sourceV = Number(relation.sourceV);
  const targetU = Number(relation.targetU);
  const targetV = Number(relation.targetV);
  return {
    targetId: relation.targetId,
    kind,
    sourceCorner: CORNER_NAMES.includes(relation.sourceCorner) ? relation.sourceCorner : "topLeft",
    targetCorner: CORNER_NAMES.includes(relation.targetCorner) ? relation.targetCorner : "topLeft",
    ...(Number.isFinite(sourceU) ? { sourceU: clamp(sourceU, 0, 1) } : {}),
    ...(Number.isFinite(sourceV) ? { sourceV: clamp(sourceV, 0, 1) } : {}),
    ...(Number.isFinite(targetU) ? { targetU: clamp(targetU, 0, 1) } : {}),
    ...(Number.isFinite(targetV) ? { targetV: clamp(targetV, 0, 1) } : {}),
    dx: finite(relation.dx, 0),
    dy: finite(relation.dy, 0),
    weight: clamp(finite(relation.weight, kind === "near" ? 0.14 : 0.26), 0.05, 0.4)
  };
}

export function normalizeElementLayout(layout) {
  if (!layout || layout.basis !== ELEMENT_LAYOUT_BASIS || !layout.sourceFrame || !layout.box) {
    return null;
  }
  const corners = {};
  for (const name of CORNER_NAMES) {
    corners[name] = normalizeCorner(layout.corners?.[name]);
  }
  if (!corners.topLeft) {
    return null;
  }
  return {
    v: ELEMENT_LAYOUT_VERSION,
    id: typeof layout.id === "string" && layout.id ? layout.id : "",
    basis: ELEMENT_LAYOUT_BASIS,
    primary: "topLeft",
    corners,
    sourceFrame: normalizeFrame(layout.sourceFrame),
    box: normalizeBox(layout.box),
    metrics: normalizeMetrics(layout.metrics),
    relations: (Array.isArray(layout.relations) ? layout.relations : [])
      .map(normalizeRelation)
      .filter(Boolean)
      .slice(0, 4)
  };
}

export function createElementLayout({
  id,
  bounds,
  canvasWidth,
  canvasHeight,
  frame,
  viewportHeight,
  sourcePath = "",
  cornerLocations = {},
  metrics = {},
  relations = []
} = {}) {
  const surfaceWidth = Math.max(1, finite(canvasWidth, 1));
  const documentHeight = Math.max(1, finite(canvasHeight, 1));
  const sourceFrame = normalizeFrame({
    surfaceWidth,
    contentLeft: frame?.left,
    contentWidth: frame?.width,
    viewportHeight: viewportHeight || documentHeight,
    documentHeight
  });
  const box = normalizeBox({
    x: bounds?.minX,
    y: bounds?.minY,
    width: finite(bounds?.maxX, 0) - finite(bounds?.minX, 0),
    height: finite(bounds?.maxY, 0) - finite(bounds?.minY, 0)
  });
  const positions = {
    topLeft: { x: box.x, y: box.y },
    topRight: { x: box.x + box.width, y: box.y },
    bottomRight: { x: box.x + box.width, y: box.y + box.height },
    bottomLeft: { x: box.x, y: box.y + box.height }
  };
  const corners = {};
  for (const name of CORNER_NAMES) {
    const location = cornerLocations[name] || {};
    corners[name] = {
      x: clamp((positions[name].x - sourceFrame.contentLeft) / sourceFrame.contentWidth, -2, 3),
      y: clamp(positions[name].y / documentHeight, 0, 1),
      path: typeof location.path === "string" && location.path ? location.path : sourcePath,
      line: normalizeLine(location.line),
      lineConfidence: normalizeLineConfidence(location.lineConfidence ?? location.confidence)
    };
  }
  return normalizeElementLayout({
    v: ELEMENT_LAYOUT_VERSION,
    id,
    basis: ELEMENT_LAYOUT_BASIS,
    primary: "topLeft",
    corners,
    sourceFrame,
    box,
    metrics,
    relations
  });
}

export function estimateElementLayoutExtent(layouts, {
  canvasWidth,
  frame,
  minHeight = 1,
  padding = 48,
  maxHeight = 2_000_000
} = {}) {
  const target = normalizeFrame({
    surfaceWidth: canvasWidth,
    contentLeft: frame?.left,
    contentWidth: frame?.width,
    viewportHeight: minHeight,
    documentHeight: minHeight
  });
  let extent = Math.max(1, finite(minHeight, 1));
  for (const input of Array.isArray(layouts) ? layouts : []) {
    const layout = normalizeElementLayout(input);
    if (!layout) {
      continue;
    }
    const widthScale = clamp(target.contentWidth / layout.sourceFrame.contentWidth, 0.2, 5);
    const sameContentLane = widthScale >= 0.82 && widthScale <= 1.2;
    const positionScale = sameContentLane ? 1 : clamp(1 / widthScale, 0.48, 2.2);
    const conservativeHeightScale = sameContentLane
      ? widthScale
      : clamp(Math.max(positionScale, widthScale), 0.42, 2.8);
    extent = Math.max(extent, layout.box.y * positionScale + layout.box.height * conservativeHeightScale + padding);
  }
  return Math.ceil(clamp(extent, Math.max(1, finite(minHeight, 1)), Math.max(1, finite(maxHeight, 2_000_000))));
}

export function estimateStableElementLayoutExtent(layouts, options = {}) {
  const normalized = (Array.isArray(layouts) ? layouts : []).map(normalizeElementLayout).filter(Boolean);
  const rawExtent = estimateElementLayoutExtent(normalized, options);
  if (!normalized.length) {
    return rawExtent;
  }
  const minHeight = Math.max(1, finite(options.minHeight, 1));
  const extents = normalized.map((layout) => estimateElementLayoutExtent([layout], options)).sort((a, b) => a - b);
  const extraRoom = Math.max(192, Math.min(640, minHeight * 0.35));
  const capAfter = (plausible) => Math.min(
    rawExtent,
    Math.ceil(Math.max(minHeight, plausible.length ? plausible[plausible.length - 1] : minHeight) + extraRoom)
  );
  const hardThreshold = Math.max(minHeight * 24, minHeight + 50_000);
  const hardPlausible = extents.filter((extent) => extent <= hardThreshold);
  if (hardPlausible.length !== extents.length) {
    return capAfter(hardPlausible);
  }
  if (extents.length < 8) {
    return rawExtent;
  }
  const baseline = extents[Math.floor((extents.length - 1) * 0.9)];
  const relativeThreshold = Math.max(minHeight + 12_000, baseline + 12_000, baseline * 8);
  const plausible = extents.filter((extent) => extent <= relativeThreshold);
  const outlierCount = extents.length - plausible.length;
  return outlierCount > 0 && outlierCount <= Math.max(4, Math.ceil(extents.length * 0.12))
    ? capAfter(plausible)
    : rawExtent;
}

export function elementLayoutExceedsTarget(layoutInput, targetDocumentHeight, {
  factor = 8,
  minExcess = 12_000
} = {}) {
  const layout = normalizeElementLayout(layoutInput);
  if (!layout) {
    return false;
  }
  const targetHeight = Math.max(1, finite(targetDocumentHeight, 1));
  const threshold = Math.max(targetHeight * factor, targetHeight + minExcess);
  return layout.sourceFrame.documentHeight > threshold && layout.box.y + layout.box.height > threshold;
}

function projectCorner(corner, target, lineToCanvasY, sourceInput = null, preferDocumentFlow = null) {
  if (!corner) {
    return null;
  }
  const frame = normalizeFrame(target);
  let fallbackY = corner.y * frame.documentHeight;
  if (sourceInput && typeof preferDocumentFlow === "boolean") {
    const source = normalizeFrame(sourceInput);
    const sourceY = corner.y * source.documentHeight;
    const widthScale = clamp(frame.contentWidth / source.contentWidth, 0.2, 5);
    const sameContentLane = widthScale >= 0.82 && widthScale <= 1.2;
    // Reading/source mode, a software keyboard, or a short split pane can change
    // viewport height without moving the Markdown content itself. Keep the note
    // coordinate fixed for the same lane and only follow reflow across real
    // content-width changes.
    const fallbackScale = sameContentLane
      ? 1
      : clamp(1 / widthScale, 0.48, 2.2);
    fallbackY = clamp(sourceY * fallbackScale, 0, frame.documentHeight);
  }
  const lineY = corner.line !== null && typeof lineToCanvasY === "function"
    ? Number(lineToCanvasY(corner.path, corner.line))
    : NaN;
  const firstLineIsPlausible = corner.line === null || corner.line >= 1 || corner.y <= 0.15;
  const lineIsReliable = canTrustCornerLine(corner);
  const maxLineShift = Math.max(96, Math.min(frame.documentHeight * 0.18, frame.viewportHeight * 0.45));
  const lineShiftIsPlausible = corner.line !== null && corner.line >= 1
    ? true
    : Math.abs(lineY - fallbackY) <= maxLineShift;
  const canUseLine = Number.isFinite(lineY) && firstLineIsPlausible && lineIsReliable && lineShiftIsPlausible;
  return {
    x: frame.contentLeft + corner.x * frame.contentWidth,
    y: canUseLine ? lineY : fallbackY,
    fallbackY,
    lineAnchored: canUseLine
  };
}

export function elementLayoutNeedsRepair(layoutInput) {
  const layout = normalizeElementLayout(layoutInput);
  if (!layout) {
    return true;
  }
  const frame = layout.sourceFrame;
  const stableWideLane = frame.surfaceWidth >= 900 && frame.contentWidth >= 720;
  if (frame.surfaceWidth < 180 || frame.contentWidth < 140 || (frame.contentWidth / frame.surfaceWidth < 0.42 && !stableWideLane)) {
    return true;
  }
  const verticalSpan = layout.box.height / Math.max(1, frame.documentHeight);
  const corners = Object.values(layout.corners).filter(Boolean);
  if (corners.some((corner) => corner.line !== null && corner.lineConfidence === null && isEndClampedLine(corner.line) && corner.y > 0.08)) {
    return true;
  }
  const topLine = layout.corners.topLeft?.line;
  const bottomLine = layout.corners.bottomLeft?.line;
  if (Number.isFinite(topLine) && Number.isFinite(bottomLine) && Math.floor(topLine) === Math.floor(bottomLine) && verticalSpan > 0.08) {
    return true;
  }
  return false;
}

export function calculateElementScale(sourceFrameInput, targetFrameInput, boxInput = {}) {
  const axes = calculateElementScales(sourceFrameInput, targetFrameInput, boxInput);
  return axes.scale;
}

function clampAxisRatio(scales, { maxXOverY = 1.65, maxYOverX = 1.9 } = {}) {
  let xScale = finite(scales.xScale, finite(scales.scale, 1));
  let yScale = finite(scales.yScale, finite(scales.scale, 1));
  if (xScale > yScale * maxXOverY) {
    xScale = yScale * maxXOverY;
  }
  if (yScale > xScale * maxYOverX) {
    yScale = xScale * maxYOverX;
  }
  const scale = calculateVisualScale(xScale, yScale, scales.scale);
  return {
    xScale,
    yScale,
    scale
  };
}

function blendScale(base, candidate, weight) {
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return base;
  }
  return Math.exp(Math.log(Math.max(0.001, base)) * (1 - weight) + Math.log(Math.max(0.001, candidate)) * weight);
}

function calculateVisualScale(xScaleInput, yScaleInput, baseScaleInput = 1) {
  const xScale = Math.max(0.001, finite(xScaleInput, 1));
  const yScale = Math.max(0.001, finite(yScaleInput, 1));
  const geometric = Math.sqrt(xScale * yScale);
  const baseScale = clamp(finite(baseScaleInput, geometric), 0.42, 2.4);
  const widthProtected = blendScale(xScale, geometric, xScale < geometric ? 0.46 : 0.22);
  const baseProtected = blendScale(widthProtected, baseScale, 0.34);
  const sameWidthFloor = xScale >= 0.82 ? Math.min(xScale, baseScale) * 0.94 : 0.42;
  return clamp(Math.max(geometric, baseProtected, sameWidthFloor), 0.42, 2.4);
}

export function calculateElementScales(sourceFrameInput, targetFrameInput, boxInput = {}) {
  const source = normalizeFrame(sourceFrameInput);
  const target = normalizeFrame(targetFrameInput);
  const box = normalizeBox(boxInput);
  const widthScale = clamp(target.contentWidth / source.contentWidth, 0.2, 5);
  const documentScale = clamp(target.documentHeight / source.documentHeight, 0.28, 3.6);
  const viewportScale = clamp(target.viewportHeight / source.viewportHeight, 0.25, 4);
  const aspectChange = target.aspectRatio / Math.max(0.01, source.aspectRatio);
  const widthWeight = aspectChange < 0.9 ? 0.8 : aspectChange > 1.35 ? 0.62 : 0.7;
  let scale = Math.exp(
    Math.log(widthScale) * widthWeight +
    Math.log(viewportScale) * (1 - widthWeight)
  );
  scale = clamp(scale, Math.max(0.42, widthScale * 0.58), Math.min(2.4, widthScale * 1.55));
  const fitScale = target.contentWidth * 0.98 / Math.max(1, box.width);
  scale = clamp(Math.min(scale, fitScale), 0.42, 2.4);
  const portraitTarget = target.aspectRatio < 0.62 || target.contentWidth < 430 && target.viewportHeight > target.contentWidth * 1.2;
  const wideTarget = target.aspectRatio > 1.05;
  const sameContentLane = widthScale >= 0.82 && widthScale <= 1.2;
  let xScale = blendScale(widthScale, scale, portraitTarget ? 0.12 : 0.24);
  let yScale = Math.exp(
    Math.log(documentScale) * (portraitTarget ? 0.58 : wideTarget ? 0.38 : 0.46) +
    Math.log(viewportScale) * (portraitTarget ? 0.24 : wideTarget ? 0.34 : 0.3) +
    Math.log(widthScale) * (portraitTarget ? 0.18 : wideTarget ? 0.28 : 0.24)
  );
  yScale = blendScale(yScale, scale, portraitTarget ? 0.1 : 0.22);
  xScale = clamp(Math.min(xScale, fitScale), 0.34, 2.8);
  yScale = clamp(yScale, 0.34, 2.8);
  if (sameContentLane) {
    xScale = widthScale;
    yScale = widthScale;
    scale = widthScale;
  }
  if (portraitTarget) {
    return clampAxisRatio({ xScale, yScale, scale }, { maxXOverY: 1.25, maxYOverX: 2.15 });
  }
  if (wideTarget) {
    return clampAxisRatio({ xScale, yScale, scale }, { maxXOverY: 1.75, maxYOverX: 1.45 });
  }
  return clampAxisRatio({ xScale, yScale, scale }, { maxXOverY: 1.55, maxYOverX: 1.65 });
}

export function projectElementLayout(layoutInput, {
  canvasWidth,
  canvasHeight,
  frame,
  viewportHeight,
  lineToCanvasY,
  preferDocumentFlow = null
} = {}) {
  const layout = normalizeElementLayout(layoutInput);
  if (!layout) {
    return null;
  }
  const targetFrame = normalizeFrame({
    surfaceWidth: canvasWidth,
    contentLeft: frame?.left,
    contentWidth: frame?.width,
    viewportHeight: viewportHeight || canvasHeight,
    documentHeight: canvasHeight
  });
  const primary = projectCorner(layout.corners.topLeft, targetFrame, lineToCanvasY, layout.sourceFrame, preferDocumentFlow);
  if (!primary) {
    return null;
  }
  let { xScale, yScale, scale } = calculateElementScales(layout.sourceFrame, targetFrame, layout.box);
  const projectedRight = projectCorner(layout.corners.topRight, targetFrame, lineToCanvasY, layout.sourceFrame, preferDocumentFlow);
  const projectedBottom = projectCorner(layout.corners.bottomLeft, targetFrame, lineToCanvasY, layout.sourceFrame, preferDocumentFlow);
  const projectedBottomRight = projectCorner(layout.corners.bottomRight, targetFrame, lineToCanvasY, layout.sourceFrame, preferDocumentFlow);
  const cornerXScales = [];
  const cornerYScales = [];
  if (projectedRight && layout.box.width > 0.01) {
    cornerXScales.push(Math.abs(projectedRight.x - primary.x) / layout.box.width);
  }
  if (projectedBottomRight && projectedBottom && layout.box.width > 0.01) {
    cornerXScales.push(Math.abs(projectedBottomRight.x - projectedBottom.x) / layout.box.width);
  }
  if (projectedBottom && layout.box.height > 0.01) {
    cornerYScales.push(Math.abs(projectedBottom.y - primary.y) / layout.box.height);
  }
  if (projectedBottomRight && projectedRight && layout.box.height > 0.01) {
    cornerYScales.push(Math.abs(projectedBottomRight.y - projectedRight.y) / layout.box.height);
  }
  const reliableXScales = cornerXScales.filter((value) => Number.isFinite(value) && value >= xScale * 0.42 && value <= xScale * 2.35);
  const reliableYScales = cornerYScales.filter((value) => Number.isFinite(value) && value >= yScale * 0.36 && value <= yScale * 2.6);
  if (reliableXScales.length) {
    const cornerScale = reliableXScales.reduce((sum, value) => sum + value, 0) / reliableXScales.length;
    xScale = clamp(blendScale(xScale, cornerScale, 0.46), xScale * 0.62, xScale * 1.42);
  }
  if (reliableYScales.length) {
    const cornerScale = reliableYScales.reduce((sum, value) => sum + value, 0) / reliableYScales.length;
    yScale = clamp(blendScale(yScale, cornerScale, 0.5), yScale * 0.56, yScale * 1.55);
  }
  const targetIsPortrait = targetFrame.aspectRatio < 0.62 || targetFrame.contentWidth < 430 && targetFrame.viewportHeight > targetFrame.contentWidth * 1.2;
  const targetIsWide = targetFrame.aspectRatio > 1.05;
  const contentWidthScale = targetFrame.contentWidth / layout.sourceFrame.contentWidth;
  const sameContentLane = contentWidthScale >= 0.82 && contentWidthScale <= 1.2;
  ({ xScale, yScale, scale } = clampAxisRatio({ xScale, yScale, scale }, targetIsPortrait
    ? { maxXOverY: 1.25, maxYOverX: 2.15 }
    : targetIsWide ? { maxXOverY: 1.75, maxYOverX: 1.45 } : { maxXOverY: 1.55, maxYOverX: 1.65 }));
  if (sameContentLane) {
    xScale = contentWidthScale;
    yScale = contentWidthScale;
    scale = contentWidthScale;
  }
  const fitXScale = targetFrame.contentWidth * 0.98 / Math.max(1, layout.box.width);
  if (xScale > fitXScale) {
    xScale = fitXScale;
    scale = calculateVisualScale(xScale, yScale, scale);
  }
  let x = primary.x;
  if (projectedBottom && Number.isFinite(projectedBottom.x) && Math.abs(projectedBottom.x - primary.x) <= Math.max(24, layout.box.width * scale * 0.25)) {
    x = (primary.x + projectedBottom.x) / 2;
  }
  const y = primary.y;
  const width = Math.max(0.01, layout.box.width * xScale);
  const height = Math.max(0.01, layout.box.height * yScale);
  const maxX = Math.max(0, targetFrame.surfaceWidth - width);
  const maxY = Math.max(0, targetFrame.documentHeight - height);
  const clampedX = clamp(x, 0, maxX);
  const clampedY = clamp(y, 0, maxY);
  const fallbackY = clamp(primary.fallbackY, 0, maxY);
  const anchorStrength = primary.lineAnchored ? 1 : sameContentLane ? 0.94 : 0.68;
  return {
    id: layout.id,
    x: clampedX,
    y: clampedY,
    width,
    height,
    scale,
    xScale,
    yScale,
    anchorX: clampedX,
    anchorY: clampedY,
    fallbackY,
    anchorStrength,
    sameContentLane,
    primaryAnchoredToLine: primary.lineAnchored
  };
}

export function stabilizeProjectedElementBox(projectedInput, previousInput, {
  positionThreshold = 0.65,
  sizeThreshold = 0.65
} = {}) {
  if (!projectedInput || !previousInput) {
    return projectedInput;
  }
  const previous = {
    x: finite(previousInput.x, previousInput.minX),
    y: finite(previousInput.y, previousInput.minY),
    width: Math.max(0.01, finite(previousInput.width, finite(previousInput.maxX) - finite(previousInput.minX))),
    height: Math.max(0.01, finite(previousInput.height, finite(previousInput.maxY) - finite(previousInput.minY)))
  };
  const projected = {
    x: finite(projectedInput.x),
    y: finite(projectedInput.y),
    width: Math.max(0.01, finite(projectedInput.width, 0.01)),
    height: Math.max(0.01, finite(projectedInput.height, 0.01))
  };
  const positionLimit = Math.max(0, finite(positionThreshold, 0.65));
  const sizeLimit = Math.max(0, finite(sizeThreshold, 0.65));
  const x = Math.abs(projected.x - previous.x) < positionLimit ? previous.x : projected.x;
  const y = Math.abs(projected.y - previous.y) < positionLimit ? previous.y : projected.y;
  const width = Math.abs(projected.width - previous.width) < sizeLimit ? previous.width : projected.width;
  const height = Math.abs(projected.height - previous.height) < sizeLimit ? previous.height : projected.height;
  const widthRatio = width / projected.width;
  const heightRatio = height / projected.height;
  return {
    ...projectedInput,
    x,
    y,
    width,
    height,
    xScale: finite(projectedInput.xScale, projectedInput.scale) * widthRatio,
    yScale: finite(projectedInput.yScale, projectedInput.scale) * heightRatio,
    scale: finite(projectedInput.scale, 1) * Math.sqrt(widthRatio * heightRatio),
    anchorX: Number.isFinite(Number(projectedInput.anchorX))
      ? Number(projectedInput.anchorX) + x - projected.x
      : projectedInput.anchorX,
    anchorY: Number.isFinite(Number(projectedInput.anchorY))
      ? Number(projectedInput.anchorY) + y - projected.y
      : projectedInput.anchorY
  };
}

function transitionBox(input) {
  if (!input) {
    return null;
  }
  const x = finite(input.x, input.minX);
  const y = finite(input.y, input.minY);
  const width = Math.max(0.01, finite(input.width, finite(input.maxX) - finite(input.minX)));
  const height = Math.max(0.01, finite(input.height, finite(input.maxY) - finite(input.minY)));
  return { x, y, width, height };
}

function projectedTransitionSignature(projectedItems, quantum) {
  const step = Math.max(0.5, finite(quantum, 3));
  return projectedItems
    .filter((item) => item?.id)
    .map((item) => {
      const box = transitionBox(item);
      return box ? [
        String(item.id),
        Math.round(box.x / step),
        Math.round(box.y / step),
        Math.round(box.width / step),
        Math.round(box.height / step)
      ].join(":") : "";
    })
    .filter(Boolean)
    .sort()
    .join("|");
}

export function settleProjectedElementTransition(projectedItems, previousById, pendingInput = null, {
  now = Date.now(),
  settleMs = 180,
  positionThreshold = 24,
  sizeRatioThreshold = 0.14,
  signatureQuantum = 3
} = {}) {
  const projected = Array.isArray(projectedItems) ? projectedItems.filter((item) => item?.id) : [];
  if (!projected.length) {
    return { commit: true, pending: null, abrupt: false };
  }
  const previous = previousById instanceof Map ? previousById : new Map();
  let abrupt = false;
  for (const item of projected) {
    const before = transitionBox(previous.get(item.id));
    const after = transitionBox(item);
    if (!before || !after) {
      continue;
    }
    const positionLimit = Math.max(
      Math.max(0, finite(positionThreshold, 24)),
      Math.min(56, Math.max(before.width, before.height) * 0.18)
    );
    const positionShift = Math.hypot(after.x - before.x, after.y - before.y);
    const sizeRatio = Math.max(
      Math.abs(after.width - before.width) / Math.max(1, before.width),
      Math.abs(after.height - before.height) / Math.max(1, before.height)
    );
    if (positionShift > positionLimit || sizeRatio > Math.max(0, finite(sizeRatioThreshold, 0.14))) {
      abrupt = true;
      break;
    }
  }
  if (!abrupt) {
    return { commit: true, pending: null, abrupt: false };
  }
  const signature = projectedTransitionSignature(projected, signatureQuantum);
  const timestamp = finite(now, Date.now());
  const pending = pendingInput?.signature === signature ? {
    signature,
    firstSeen: finite(pendingInput.firstSeen, timestamp),
    observations: Math.max(1, Math.floor(finite(pendingInput.observations, 1))) + 1
  } : {
    signature,
    firstSeen: timestamp,
    observations: 1
  };
  const commit = pending.observations >= 2 && timestamp - pending.firstSeen >= Math.max(0, finite(settleMs, 180));
  return {
    commit,
    pending: commit ? null : pending,
    abrupt: true
  };
}

function rectGap(a, b) {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function overlapCenter(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) {
    return null;
  }
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2
  };
}

function boxCorner(box, name) {
  return {
    x: box.x + (name === "topRight" || name === "bottomRight" ? box.width : 0),
    y: box.y + (name === "bottomLeft" || name === "bottomRight" ? box.height : 0)
  };
}

function nearestCornerPair(source, target) {
  let best = { sourceCorner: "topLeft", targetCorner: "topLeft", distance: Number.POSITIVE_INFINITY };
  for (const sourceCorner of CORNER_NAMES) {
    const sourcePoint = boxCorner(source, sourceCorner);
    for (const targetCorner of CORNER_NAMES) {
      const targetPoint = boxCorner(target, targetCorner);
      const distance = Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y);
      if (distance < best.distance) {
        best = { sourceCorner, targetCorner, distance };
      }
    }
  }
  return best;
}

function normalizeBoxAnchor(box, point) {
  return {
    u: clamp((point.x - box.x) / Math.max(0.01, box.width), 0, 1),
    v: clamp((point.y - box.y) / Math.max(0.01, box.height), 0, 1)
  };
}

function relationBoxPoint(box, relation, prefix) {
  const u = finite(relation?.[`${prefix}U`], NaN);
  const v = finite(relation?.[`${prefix}V`], NaN);
  if (Number.isFinite(u) && Number.isFinite(v)) {
    return {
      x: box.x + clamp(u, 0, 1) * box.width,
      y: box.y + clamp(v, 0, 1) * box.height
    };
  }
  return boxCorner(box, relation?.[`${prefix}Corner`]);
}

export function captureElementRelations(items, { nearDistance = 80, maxRelations = 3 } = {}) {
  const normalized = (Array.isArray(items) ? items : []).map((item) => ({
    id: typeof item?.id === "string" ? item.id : "",
    scale: clamp(finite(item?.scale, 1), 0.05, 20),
    xScale: clamp(finite(item?.xScale, item?.scale ?? 1), 0.05, 20),
    yScale: clamp(finite(item?.yScale, item?.scale ?? 1), 0.05, 20),
    bounds: normalizeBox({
      x: item?.bounds?.minX ?? item?.bounds?.x,
      y: item?.bounds?.minY ?? item?.bounds?.y,
      width: item?.bounds?.width ?? finite(item?.bounds?.maxX, 0) - finite(item?.bounds?.minX, 0),
      height: item?.bounds?.height ?? finite(item?.bounds?.maxY, 0) - finite(item?.bounds?.minY, 0)
    })
  })).filter((item) => item.id);
  const cellSize = Math.max(16, finite(nearDistance, 80));
  const buckets = new Map();
  const cellRange = (bounds, padding = 0) => ({
    minX: Math.floor((bounds.x - padding) / cellSize),
    maxX: Math.floor((bounds.x + bounds.width + padding) / cellSize),
    minY: Math.floor((bounds.y - padding) / cellSize),
    maxY: Math.floor((bounds.y + bounds.height + padding) / cellSize)
  });
  for (const item of normalized) {
    const range = cellRange(item.bounds);
    for (let x = range.minX; x <= range.maxX; x += 1) {
      for (let y = range.minY; y <= range.maxY; y += 1) {
        const key = `${x}:${y}`;
        const bucket = buckets.get(key) || [];
        bucket.push(item);
        buckets.set(key, bucket);
      }
    }
  }
  const relations = new Map();
  for (const source of normalized) {
    const candidates = [];
    const nearby = new Set();
    const range = cellRange(source.bounds, nearDistance);
    for (let x = range.minX; x <= range.maxX; x += 1) {
      for (let y = range.minY; y <= range.maxY; y += 1) {
        for (const item of buckets.get(`${x}:${y}`) || []) {
          nearby.add(item);
        }
      }
    }
    for (const target of nearby) {
      if (target === source) {
        continue;
      }
      const overlap = overlapArea(source.bounds, target.bounds);
      const gap = rectGap(source.bounds, target.bounds);
      if (overlap <= 0 && gap > nearDistance) {
        continue;
      }
      const kind = overlap > 0 ? "intersection" : "near";
      const relationScaleX = Math.max(0.05, (source.xScale + target.xScale) / 2);
      const relationScaleY = Math.max(0.05, (source.yScale + target.yScale) / 2);
      const cornerPair = nearestCornerPair(source.bounds, target.bounds);
      const intersectionCenter = kind === "intersection" ? overlapCenter(source.bounds, target.bounds) : null;
      const sourceAnchor = intersectionCenter ? normalizeBoxAnchor(source.bounds, intersectionCenter) : null;
      const targetAnchor = intersectionCenter ? normalizeBoxAnchor(target.bounds, intersectionCenter) : null;
      const sourceCornerPoint = intersectionCenter || boxCorner(source.bounds, cornerPair.sourceCorner);
      const targetCornerPoint = intersectionCenter || boxCorner(target.bounds, cornerPair.targetCorner);
      candidates.push({
        targetId: target.id,
        kind,
        sourceCorner: cornerPair.sourceCorner,
        targetCorner: cornerPair.targetCorner,
        ...(sourceAnchor ? { sourceU: sourceAnchor.u, sourceV: sourceAnchor.v } : {}),
        ...(targetAnchor ? { targetU: targetAnchor.u, targetV: targetAnchor.v } : {}),
        dx: (targetCornerPoint.x - sourceCornerPoint.x) / relationScaleX,
        dy: (targetCornerPoint.y - sourceCornerPoint.y) / relationScaleY,
        weight: kind === "intersection" ? 0.32 : 0.14,
        score: kind === "intersection" ? -overlap - 1 : gap
      });
    }
    candidates.sort((a, b) => a.score - b.score || a.targetId.localeCompare(b.targetId));
    relations.set(source.id, candidates.slice(0, maxRelations).map(({ score, ...relation }) => relation));
  }
  return relations;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) {
    return NaN;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stabilizeMarkdownRelationAnchors(projected, layoutsById) {
  const byId = new Map(projected.map((item) => [item.id, item]));
  const neighbors = new Map(projected.map((item) => [item.id, new Set()]));
  for (const item of projected) {
    const layout = normalizeElementLayout(layoutsById.get(item.id));
    for (const relation of layout?.relations || []) {
      if (!byId.has(relation.targetId)) {
        continue;
      }
      neighbors.get(item.id)?.add(relation.targetId);
      neighbors.get(relation.targetId)?.add(item.id);
    }
  }
  return projected.map((item) => {
    if (!item.primaryAnchoredToLine || !Number.isFinite(item.fallbackY)) {
      return item;
    }
    const neighborDeltas = Array.from(neighbors.get(item.id) || []).map((id) => byId.get(id))
      .filter((neighbor) => neighbor?.primaryAnchoredToLine && Number.isFinite(neighbor.fallbackY))
      .map((neighbor) => neighbor.y - neighbor.fallbackY);
    if (neighborDeltas.length < 2) {
      return item;
    }
    const center = median(neighborDeltas);
    const deviation = median(neighborDeltas.map((value) => Math.abs(value - center)));
    const tolerance = clamp(deviation * 3 + 32, 96, 240);
    const inliers = neighborDeltas.filter((value) => Math.abs(value - center) <= tolerance);
    if (inliers.length < 2) {
      return item;
    }
    const consensus = inliers.reduce((sum, value) => sum + value, 0) / inliers.length;
    const ownDelta = item.y - item.fallbackY;
    const correctionThreshold = Math.max(144, item.height * 0.65);
    if (Math.abs(ownDelta - consensus) <= correctionThreshold) {
      return item;
    }
    const correctedY = item.fallbackY + consensus;
    return {
      ...item,
      y: correctedY,
      anchorY: correctedY,
      anchorStrength: Math.min(0.92, finite(item.anchorStrength, 0.92)),
      relationCorrectedMarkdownAnchor: true
    };
  });
}

export function stabilizeElementRelations(projectedItems, layouts) {
  const layoutsById = layouts instanceof Map
    ? layouts
    : new Map((Array.isArray(layouts) ? layouts : []).map((layout) => [layout?.id, layout]));
  const projected = stabilizeMarkdownRelationAnchors(
    (Array.isArray(projectedItems) ? projectedItems : []).map((item) => ({ ...item })),
    layoutsById
  );
  const byId = new Map(projected.map((item) => [item.id, item]));
  const corrections = new Map();
  const visitedPairs = new Set();
  const anchorStrengthFor = (item) => {
    const value = Number(item?.anchorStrength);
    if (Number.isFinite(value)) {
      return clamp(value, 0, 1);
    }
    return item?.primaryAnchoredToLine ? 0.8 : 0.35;
  };
  const addCorrection = (id, x, y, strength) => {
    const current = corrections.get(id) || { x: 0, y: 0, weight: 0 };
    current.x += x * strength;
    current.y += y * strength;
    current.weight += strength;
    corrections.set(id, current);
  };
  for (const source of projected) {
    const layout = normalizeElementLayout(layoutsById.get(source.id));
    if (!layout) {
      continue;
    }
    for (const relation of layout.relations) {
      const target = byId.get(relation.targetId);
      if (!target) {
        continue;
      }
      const pairKey = source.id < target.id ? `${source.id}\u0000${target.id}` : `${target.id}\u0000${source.id}`;
      if (visitedPairs.has(pairKey)) {
        continue;
      }
      visitedPairs.add(pairKey);
      const relationScaleX = (finite(source.xScale, source.scale) + finite(target.xScale, target.scale)) / 2;
      const relationScaleY = (finite(source.yScale, source.scale) + finite(target.yScale, target.scale)) / 2;
      const sourcePoint = relationBoxPoint(source, relation, "source");
      const targetPoint = relationBoxPoint(target, relation, "target");
      const errorX = targetPoint.x - sourcePoint.x - relation.dx * relationScaleX;
      const errorY = targetPoint.y - sourcePoint.y - relation.dy * relationScaleY;
      const limitX = relation.kind === "near"
        ? Math.min(72, Math.max(24, Math.min(source.width, target.width) * 0.35))
        : Math.min(96, Math.max(32, Math.min(source.width, target.width) * 0.5));
      const limitY = relation.kind === "near"
        ? Math.min(72, Math.max(24, Math.min(source.height, target.height) * 0.35))
        : Math.min(96, Math.max(32, Math.min(source.height, target.height) * 0.5));
      const strength = relation.kind === "near"
        ? clamp(relation.weight * 1.7, 0.16, 0.34)
        : clamp(relation.weight * 1.7, 0.32, 0.62);
      const sourceMobility = clamp(1 - anchorStrengthFor(source) * 0.78, 0.18, 1);
      const targetMobility = clamp(1 - anchorStrengthFor(target) * 0.78, 0.18, 1);
      const mobility = Math.max(0.01, sourceMobility + targetMobility);
      const sourceShare = sourceMobility / mobility;
      const targetShare = targetMobility / mobility;
      const clampedErrorX = clamp(errorX, -limitX, limitX);
      const clampedErrorY = clamp(errorY, -limitY, limitY);
      addCorrection(source.id, clampedErrorX * sourceShare, clampedErrorY * sourceShare, strength);
      addCorrection(target.id, -clampedErrorX * targetShare, -clampedErrorY * targetShare, strength);
    }
  }
  return projected.map((item) => {
    const correction = corrections.get(item.id);
    if (!correction) {
      return item;
    }
    const divisor = Math.max(0.001, correction.weight);
    const anchorStrength = anchorStrengthFor(item);
    const blend = Math.min(0.82 - anchorStrength * 0.34, correction.weight);
    const nextX = item.x + (correction.x / divisor) * blend;
    const nextY = item.y + (correction.y / divisor) * blend;
    const fenceRatio = 0.18 + (1 - anchorStrength) * 0.82;
    const anchorFenceX = Math.max(12, Math.min(anchorStrength >= 0.9 ? 36 : anchorStrength >= 0.65 ? 72 : 120, item.width * fenceRatio));
    const anchorFenceY = Math.max(12, Math.min(anchorStrength >= 0.9 ? 40 : anchorStrength >= 0.65 ? 84 : 140, item.height * fenceRatio));
    return {
      ...item,
      x: Number.isFinite(item.anchorX) ? clamp(nextX, item.anchorX - anchorFenceX, item.anchorX + anchorFenceX) : nextX,
      y: Number.isFinite(item.anchorY) ? clamp(nextY, item.anchorY - anchorFenceY, item.anchorY + anchorFenceY) : nextY
    };
  });
}

export function projectElementPoints(points, layoutInput, projectedBox, { canvasWidth, canvasHeight, preserveAspectRatio = false } = {}) {
  const layout = normalizeElementLayout(layoutInput);
  if (!layout || !projectedBox) {
    return Array.isArray(points) ? points.map((point) => ({ ...point })) : [];
  }
  const targetWidth = Math.max(1, finite(canvasWidth, 1));
  const targetHeight = Math.max(1, finite(canvasHeight, 1));
  const source = layout.sourceFrame;
  const sourceWidth = Math.max(0.01, layout.box.width);
  const sourceHeight = Math.max(0.01, layout.box.height);
  const projectedWidth = Math.max(0.01, finite(projectedBox.width, sourceWidth));
  const projectedHeight = Math.max(0.01, finite(projectedBox.height, sourceHeight));
  const uniformScale = Math.min(projectedWidth / sourceWidth, projectedHeight / sourceHeight);
  return (Array.isArray(points) ? points : []).map((point) => {
    const anchor = point?.anchor;
    const sourceX = anchor && Number.isFinite(Number(anchor.x))
      ? source.contentLeft + Number(anchor.x) * source.contentWidth
      : clamp(finite(point?.x, 0), 0, 1) * source.surfaceWidth;
    const sourceY = anchor && Number.isFinite(Number(anchor.y))
      ? Number(anchor.y) * source.documentHeight
      : clamp(finite(point?.y, 0), 0, 1) * source.documentHeight;
    const localX = (sourceX - layout.box.x) / layout.box.width;
    const localY = (sourceY - layout.box.y) / layout.box.height;
    const projectedLocalX = preserveAspectRatio
      ? (sourceX - layout.box.x) * uniformScale
      : localX * projectedBox.width;
    const projectedLocalY = preserveAspectRatio
      ? (sourceY - layout.box.y) * uniformScale
      : localY * projectedBox.height;
    return {
      ...point,
      x: clamp((projectedBox.x + projectedLocalX) / targetWidth, 0, 1),
      y: clamp((projectedBox.y + projectedLocalY) / targetHeight, 0, 1)
    };
  });
}

export function scaleElementMetrics(metricsInput, scaleInput) {
  const metrics = normalizeMetrics(metricsInput);
  const scaleBox = typeof scaleInput === "object" && scaleInput ? scaleInput : null;
  const scale = clamp(finite(scaleBox?.scale, finite(scaleInput, 1)), 0.42, 2.4);
  const xScale = clamp(finite(scaleBox?.xScale, scale), 0.34, 2.8);
  const yScale = clamp(finite(scaleBox?.yScale, scale), 0.34, 2.8);
  return {
    width: metrics.width ? clamp(metrics.width * scale, 0.5, 80) : undefined,
    fontSize: metrics.fontSize ? clamp(metrics.fontSize * scale, 10, 72) : undefined,
    textWidth: metrics.textWidth ? clamp(metrics.textWidth * xScale, 24, 900) : undefined,
    previewWidth: metrics.previewWidth ? clamp(metrics.previewWidth * xScale, 80, 900) : undefined,
    previewHeight: metrics.previewHeight ? clamp(metrics.previewHeight * yScale, 40, 700) : undefined
  };
}
