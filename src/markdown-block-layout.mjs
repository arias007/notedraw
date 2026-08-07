function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMarkdownFloatBox(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) {
    return null;
  }
  const width = clamp(Number(value.width) || 0.5, 0.08, 1);
  const height = clamp(Number(value.height) || 0.1, 0.02, 1);
  return {
    x: clamp(Number(value.x), 0, Math.max(0, 1 - width)),
    y: clamp(Number(value.y), 0, Math.max(0, 1 - height)),
    width,
    height
  };
}
