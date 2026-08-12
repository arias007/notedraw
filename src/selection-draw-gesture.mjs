export const SELECTED_DRAW_GESTURE_DRAW_OR_DESELECT = "draw-or-deselect";
export const SELECTED_DRAW_GESTURE_MANIPULATE = "manipulate";

export function fitSelectionFrameToCanvas(frame, {
  canvasWidth,
  canvasHeight,
  inset = 0
} = {}) {
  if (!frame) {
    return null;
  }
  const width = Math.max(0, Number(canvasWidth) || 0);
  const height = Math.max(0, Number(canvasHeight) || 0);
  const x1 = Math.min(Number(frame.x) || 0, (Number(frame.x) || 0) + (Number(frame.width) || 0));
  const x2 = Math.max(Number(frame.x) || 0, (Number(frame.x) || 0) + (Number(frame.width) || 0));
  const y1 = Math.min(Number(frame.y) || 0, (Number(frame.y) || 0) + (Number(frame.height) || 0));
  const y2 = Math.max(Number(frame.y) || 0, (Number(frame.y) || 0) + (Number(frame.height) || 0));
  if (!width || !height) {
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  const safeInset = Math.max(0, Math.min(Number(inset) || 0, width / 2, height / 2));
  const minX = safeInset;
  const maxX = Math.max(minX, width - safeInset);
  const minY = safeInset;
  const maxY = Math.max(minY, height - safeInset);
  const clampTo = (value, min, max) => Math.min(max, Math.max(min, value));
  const left = clampTo(x1, minX, maxX);
  const right = clampTo(x2, minX, maxX);
  const top = clampTo(y1, minY, maxY);
  const bottom = clampTo(y2, minY, maxY);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

export function resolveSelectedDrawGesture({
  toolMode,
  hasSelection,
  hitStrokeIndex = -1,
  insideSelectionFrame = false
} = {}) {
  if (toolMode !== "draw" || !hasSelection) {
    return null;
  }
  if (hitStrokeIndex >= 0 || insideSelectionFrame) {
    return SELECTED_DRAW_GESTURE_MANIPULATE;
  }
  return SELECTED_DRAW_GESTURE_DRAW_OR_DESELECT;
}
