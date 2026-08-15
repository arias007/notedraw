function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function captureInitialReadingLayout(previewEl, sizer, renderer = null) {
  const previewRect = previewEl?.getBoundingClientRect?.();
  const sizerRect = sizer?.getBoundingClientRect?.();
  const sections = Array.isArray(renderer?.sections) ? renderer.sections : [];
  return {
    previewWidth: Math.max(0, finite(previewEl?.clientWidth, previewRect?.width)),
    sizerHeight: Math.max(
      0,
      finite(sizer?.scrollHeight),
      finite(sizer?.offsetHeight),
      finite(sizerRect?.height)
    ),
    sectionCount: sections.length,
    renderedSectionCount: sections.filter((section) => section?.shown !== false && section?.el?.isConnected).length,
    measuredSectionCount: sections.filter((section) => finite(section?.height) > 0).length
  };
}

export function initialReadingLayoutSignature(metrics = {}) {
  return [
    Math.round(finite(metrics.previewWidth)),
    Math.round(finite(metrics.sizerHeight)),
    Math.max(0, Math.round(finite(metrics.sectionCount))),
    Math.max(0, Math.round(finite(metrics.renderedSectionCount))),
    Math.max(0, Math.round(finite(metrics.measuredSectionCount)))
  ].join(":");
}

export function isInitialReadingLayoutUsable(metrics = {}) {
  const sectionCount = Math.max(0, Math.round(finite(metrics.sectionCount)));
  return finite(metrics.previewWidth) > 8
    && finite(metrics.sizerHeight) > 0
    && (sectionCount === 0 || finite(metrics.renderedSectionCount) > 0);
}

export async function waitForStableReadingLayout(readMetrics, {
  requestFrame,
  shouldAbort = () => false,
  stableFrames = 3,
  maxFrames = 24
} = {}) {
  if (typeof readMetrics !== "function" || typeof requestFrame !== "function") {
    return false;
  }
  const requiredStableFrames = Math.max(1, Math.round(finite(stableFrames, 3)));
  const frameLimit = Math.max(requiredStableFrames, Math.round(finite(maxFrames, 24)));
  let previousSignature = "";
  let stableCount = 0;
  let lastUsable = false;

  for (let frame = 0; frame < frameLimit; frame += 1) {
    await requestFrame();
    if (shouldAbort()) {
      return false;
    }
    const metrics = readMetrics();
    lastUsable = isInitialReadingLayoutUsable(metrics);
    if (!lastUsable) {
      previousSignature = "";
      stableCount = 0;
      continue;
    }
    const signature = initialReadingLayoutSignature(metrics);
    stableCount = signature === previousSignature ? stableCount + 1 : 1;
    previousSignature = signature;
    if (stableCount >= requiredStableFrames) {
      return true;
    }
  }
  return lastUsable;
}
