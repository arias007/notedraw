const DEFAULT_MIN_WINDOW_HEIGHT = 1024;
const DEFAULT_MAX_WINDOW_HEIGHT = 4096;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function measureWithoutFloatingMarkdown(root, measure) {
  const elements = Array.from(root?.querySelectorAll?.(".notedraw-md-block.is-floating") || []);
  if (!elements.length) {
    return measure();
  }
  const states = elements.map((element) => ({
    element,
    value: element.style?.getPropertyValue?.("display") || "",
    priority: element.style?.getPropertyPriority?.("display") || ""
  }));
  try {
    for (const { element } of states) {
      element.style?.setProperty?.("display", "none", "important");
    }
    return measure();
  } finally {
    for (const { element, value, priority } of states) {
      if (value) {
        element.style?.setProperty?.("display", value, priority);
      } else {
        element.style?.removeProperty?.("display");
      }
    }
  }
}

export function measureCanvasExtent(previewEl, measureEl = null, visualScale = 1) {
  const previewRect = previewEl.getBoundingClientRect();
  const measureRect = measureEl?.getBoundingClientRect?.();
  const measureIsPreview = !measureEl || measureEl === previewEl;
  const scale = Math.max(0.01, Number(visualScale) || 1);
  const scrollLeft = Math.max(0, Number(previewEl.scrollLeft) || 0);
  const scrollTop = Math.max(0, Number(previewEl.scrollTop) || 0);
  const relativeRight = measureRect ? (measureRect.right - previewRect.left + scrollLeft) / scale : 0;
  const relativeBottom = measureRect ? (measureRect.bottom - previewRect.top + scrollTop) / scale : 0;
  const horizontalOverflow = measureWithoutFloatingMarkdown(measureEl || previewEl, () => Math.max(
    measureIsPreview ? (previewEl.scrollWidth || 0) / scale : 0,
    measureEl?.scrollWidth || 0
  ));
  const width = Math.max(
    horizontalOverflow,
    previewEl.clientWidth || 0,
    measureEl?.offsetWidth || 0,
    relativeRight,
    previewRect.width || 0,
    (measureRect?.width || 0) / scale
  );
  const height = Math.max(
    measureIsPreview ? (previewEl.scrollHeight || 0) / scale : 0,
    previewEl.clientHeight || 0,
    measureEl?.scrollHeight || 0,
    measureEl?.offsetHeight || 0,
    relativeBottom,
    measureIsPreview ? previewEl.offsetHeight || 0 : 0,
    previewRect.height || 0,
    (measureRect?.height || 0) / scale
  );
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    visibleWidth: Math.max(1, previewRect.width || width)
  };
}

export function calculateCanvasWindow({
  documentHeight,
  viewportTop = 0,
  viewportHeight,
  previousTop = null,
  previousHeight = 0,
  overscanScreens = 1,
  minWindowHeight = DEFAULT_MIN_WINDOW_HEIGHT,
  maxWindowHeight = DEFAULT_MAX_WINDOW_HEIGHT
}) {
  const height = Math.max(1, finitePositive(documentHeight, 1));
  const visibleHeight = Math.min(height, finitePositive(viewportHeight, height));
  const maxTop = Math.max(0, height - visibleHeight);
  const visibleTop = clamp(Number(viewportTop) || 0, 0, maxTop);
  const overscan = Math.max(0, Number(overscanScreens) || 0);
  const maximum = Math.max(visibleHeight, finitePositive(maxWindowHeight, DEFAULT_MAX_WINDOW_HEIGHT));
  const minimum = Math.min(maximum, Math.max(visibleHeight, finitePositive(minWindowHeight, DEFAULT_MIN_WINDOW_HEIGHT)));
  const targetHeight = Math.min(height, Math.max(minimum, Math.min(maximum, visibleHeight * (1 + overscan * 2))));
  const priorTop = Number(previousTop);
  const priorHeight = Number(previousHeight);
  const canReusePrevious = Number.isFinite(priorTop) && priorTop >= 0 && Number.isFinite(priorHeight) && Math.abs(priorHeight - targetHeight) < 1;

  if (canReusePrevious) {
    const priorBottom = priorTop + priorHeight;
    const guard = Math.max(0, Math.min(visibleHeight * 0.35, (priorHeight - visibleHeight) / 2));
    const safeTop = priorTop <= 0 ? 0 : priorTop + guard;
    const safeBottom = priorBottom >= height ? height : priorBottom - guard;
    if (visibleTop >= safeTop && visibleTop + visibleHeight <= safeBottom) {
      return { top: priorTop, height: priorHeight, changed: false };
    }
  }

  const centeredTop = visibleTop - (targetHeight - visibleHeight) / 2;
  const top = clamp(Math.round(centeredTop), 0, Math.max(0, height - targetHeight));
  return {
    top,
    height: targetHeight,
    changed: !canReusePrevious || Math.abs(top - priorTop) >= 1
  };
}

export function calculateQualityWindowLimit({
  cssWidth,
  viewportHeight,
  devicePixelRatio = 1,
  maxDevicePixelRatio = 4,
  maxPixels = 6 * 1024 * 1024,
  maxWindowHeight = DEFAULT_MAX_WINDOW_HEIGHT
}) {
  const width = Math.max(1, finitePositive(cssWidth, 1));
  const visibleHeight = Math.max(1, finitePositive(viewportHeight, 1));
  const scale = Math.min(
    finitePositive(devicePixelRatio, 1),
    finitePositive(maxDevicePixelRatio, 4)
  );
  const pixelLimit = finitePositive(maxPixels, 6 * 1024 * 1024);
  const heightAtNativeScale = Math.floor(pixelLimit / (width * scale * scale));
  return Math.max(
    visibleHeight,
    Math.min(finitePositive(maxWindowHeight, DEFAULT_MAX_WINDOW_HEIGHT), heightAtNativeScale)
  );
}

export function calculateZoomAwareWindowFloor({
  visualScale = 1,
  baseWindowHeight = DEFAULT_MIN_WINDOW_HEIGHT,
  minimumWindowHeight = 32
} = {}) {
  const scale = Math.max(1, finitePositive(visualScale, 1));
  const base = finitePositive(baseWindowHeight, DEFAULT_MIN_WINDOW_HEIGHT);
  const minimum = finitePositive(minimumWindowHeight, 32);
  return Math.max(minimum, base / scale);
}

export function shouldClearStaleReadingVirtualMinHeight({
  inlineMinHeight,
  sectionHeight,
  viewportHeight
} = {}) {
  const inline = Math.max(0, Number(inlineMinHeight) || 0);
  const sections = Math.max(1, Number(sectionHeight) || 1);
  const viewport = Math.max(1, Number(viewportHeight) || 1);
  return inline > Math.max(sections * 1.75, sections + viewport * 2);
}

export function calculateCanvasBackingStore({
  cssWidth,
  cssHeight,
  devicePixelRatio = 1,
  maxDevicePixelRatio = 2,
  maxDimension = 8192,
  maxPixels = 8 * 1024 * 1024
}) {
  const width = Math.max(1, finitePositive(cssWidth, 1));
  const height = Math.max(1, finitePositive(cssHeight, 1));
  const deviceScale = finitePositive(devicePixelRatio, 1);
  const requestedScale = Math.min(
    deviceScale,
    finitePositive(maxDevicePixelRatio, 2)
  );
  const dimensionLimit = finitePositive(maxDimension, 8192);
  const pixelLimit = finitePositive(maxPixels, 8 * 1024 * 1024);
  const scale = Math.max(0.01, Math.min(
    requestedScale,
    dimensionLimit / width,
    dimensionLimit / height,
    Math.sqrt(pixelLimit / (width * height))
  ));

  const backingWidth = Math.max(1, Math.floor(width * scale));
  const backingHeight = Math.max(1, Math.floor(height * scale));
  const effectiveScale = Math.min(backingWidth / width, backingHeight / height);
  return {
    width: backingWidth,
    height: backingHeight,
    scale: effectiveScale,
    limited: effectiveScale + 1e-6 < deviceScale
  };
}
