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
