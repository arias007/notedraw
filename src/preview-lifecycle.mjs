export function shouldMountRootPreview({
  sourceMode,
  visible,
  hasSurface,
  sourceHasContent,
  renderedContent
} = {}) {
  return Boolean(
    hasSurface
      && visible
      && !sourceMode
      && (!sourceHasContent || renderedContent)
  );
}

export function shouldResetDormantRootPreview({
  sourceMode,
  visible,
  sourceHasContent,
  renderedContent
} = {}) {
  return Boolean(sourceHasContent && !renderedContent && sourceMode && !visible);
}

export function shouldRecoverEmptyRootPreview({
  sourceMode,
  visible,
  hasSurface,
  sourceHasContent,
  renderedContent,
  rendererMatches
} = {}) {
  return Boolean(
    hasSurface
      && visible
      && !sourceMode
      && sourceHasContent
      && !renderedContent
      && rendererMatches
  );
}

export function pickRootPreview(previews = [], rendererPreview = null, isVisible = () => false, isLaidOut = () => false) {
  const candidates = Array.from(new Set(previews)).filter(Boolean);
  return candidates.find((preview) => isVisible(preview))
    || candidates.find((preview) => isLaidOut(preview))
    || candidates.find((preview) => preview === rendererPreview)
    || candidates[0]
    || null;
}
