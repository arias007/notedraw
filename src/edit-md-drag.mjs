/**
 * Drag-to-select for the edit-md tool on the source surface.
 *
 * The edit-md branch of `onPointerDown` abandons pointer interaction (it must,
 * or ink would be drawn over the text), and abandoning it also dropped every
 * drag. A press started on source text therefore only ever placed a caret, and
 * selecting a range meant Shift+Arrow — the mode that ships as the default on
 * the source surface felt broken.
 *
 * These helpers keep the gesture bookkeeping pure so it can be tested without a
 * DOM: the controller feeds in CodeMirror's `posAtCoords` and the pointer
 * coordinates, and dispatches whatever selection comes back.
 */

/** Movements below this many CSS pixels stay a tap (caret placement). */
export const EDIT_MD_DRAG_THRESHOLD_PX = 3;

export function sameSourcePoint(a, b, tolerance = 0.5) {
  if (!a || !b) {
    return false;
  }
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

/**
 * Decide what a pointer move means for the in-progress edit-md drag.
 *
 * Returns:
 *   null                          → nothing to do (no drag, or still a tap)
 *   { anchor, head, reversed }    → a selection to dispatch
 */
export function resolveEditMdDragSelection({
  anchor,
  startClient,
  clientPoint,
  posAtCoords,
  threshold = EDIT_MD_DRAG_THRESHOLD_PX
} = {}) {
  if (!Number.isFinite(anchor) || typeof posAtCoords !== "function") {
    return null;
  }
  if (!clientPoint || !Number.isFinite(clientPoint.x) || !Number.isFinite(clientPoint.y)) {
    return null;
  }
  if (startClient && Number.isFinite(startClient.x) && Number.isFinite(startClient.y)) {
    const distance = Math.hypot(clientPoint.x - startClient.x, clientPoint.y - startClient.y);
    if (distance < Math.max(0, Number(threshold) || 0)) {
      return null;
    }
  }
  let head;
  try {
    head = posAtCoords(clientPoint);
  } catch (error) {
    return null;
  }
  if (!Number.isFinite(head) || head === anchor) {
    return null;
  }
  return {
    anchor,
    head,
    reversed: head < anchor
  };
}

/**
 * A drag that reaches past either end of the document, or that leaves the text
 * column, should keep the anchor and simply follow the pointer. CodeMirror
 * clamps `posAtCoords` to the nearest position for us, so nothing to do but
 * report whether the gesture should still own the pointer.
 */
export function editMdDragIsActive(state) {
  return Boolean(state && Number.isFinite(state.anchor) && Number.isFinite(state.pointerId));
}
