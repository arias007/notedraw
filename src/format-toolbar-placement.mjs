/**
 * Where the floating format bar should sit.
 *
 * The bar follows the caret, which means it used to hover *over* the note text.
 * A press that landed on a line underneath one of its buttons was consumed by
 * the button instead of placing a caret — reported as "the floating format
 * toolbar blocks clicks on note text" (issue #7). Below-one-line placement only
 * ever moved the problem one line down.
 *
 * The rule now: never cover the block being edited. Prefer the free margin
 * beside the Markdown lane (desktop windows and split panes leave one), then
 * above the block, then below it, and only fall back to a caret-relative spot
 * when the viewport is too short for any of those.
 */

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rectOf(input) {
  if (!input) {
    return null;
  }
  const left = num(input.left);
  const top = num(input.top);
  const right = Number.isFinite(Number(input.right)) ? Number(input.right) : left + num(input.width);
  const bottom = Number.isFinite(Number(input.bottom)) ? Number(input.bottom) : top + num(input.height);
  if (!(right > left)) {
    return null;
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export const FORMAT_TOOLBAR_MARGIN_GAP = 8;
export const FORMAT_TOOLBAR_BLOCK_GAP = 10;

/**
 * @returns {{left:number, top:number, docked:string}}
 *   docked ∈ margin | above-block | below-block | anchor
 */
export function resolveFormatToolbarPlacement({
  anchor = null,
  block = null,
  lane = null,
  size = null,
  viewport = null,
  gap = 14
} = {}) {
  const bar = {
    width: Math.max(120, num(size?.width, 280)),
    height: Math.max(28, num(size?.height, 34))
  };
  const view = viewport
    ? {
      left: num(viewport.left),
      top: num(viewport.top),
      width: Math.max(80, num(viewport.width, 320)),
      height: Math.max(80, num(viewport.height, 480))
    }
    : { left: 0, top: 0, width: 1920, height: 1080 };
  const minLeft = view.left + FORMAT_TOOLBAR_MARGIN_GAP;
  const maxLeft = Math.max(minLeft, view.left + view.width - bar.width - FORMAT_TOOLBAR_MARGIN_GAP);
  const minTop = view.top + FORMAT_TOOLBAR_MARGIN_GAP;
  const maxTop = Math.max(minTop, view.top + view.height - bar.height - FORMAT_TOOLBAR_MARGIN_GAP);

  const anchorRect = rectOf(anchor);
  const blockRect = rectOf(block);
  const laneRect = rectOf(lane);
  const centerOn = anchorRect ? anchorRect.left + anchorRect.width / 2 - bar.width / 2 : minLeft;

  // 1. Free margin to the right of the text column: never covers a single line.
  if (laneRect) {
    const laneRight = laneRect.left + laneRect.width;
    const freeRight = view.left + view.width - laneRight;
    if (freeRight >= bar.width + FORMAT_TOOLBAR_MARGIN_GAP * 2) {
      const top = clamp(
        anchorRect ? Math.round(anchorRect.top - bar.height / 2) : Math.round(minTop),
        minTop,
        maxTop
      );
      return {
        left: Math.round(clamp(laneRight + FORMAT_TOOLBAR_MARGIN_GAP, minLeft, maxLeft)),
        top,
        docked: "margin"
      };
    }
  }

  const left = Math.round(clamp(centerOn, minLeft, maxLeft));

  // 2. Fully above the edited block.
  if (blockRect) {
    const aboveBlock = Math.round(blockRect.top - bar.height - FORMAT_TOOLBAR_BLOCK_GAP);
    if (aboveBlock >= minTop) {
      return { left, top: aboveBlock, docked: "above-block" };
    }
    // 3. Fully below it.
    const belowBlock = Math.round(blockRect.bottom + FORMAT_TOOLBAR_BLOCK_GAP);
    if (belowBlock <= maxTop) {
      return { left, top: belowBlock, docked: "below-block" };
    }
  }

  // 4. Last resort: caret-relative, but skip the caret line itself.
  const lineStep = Math.max(22, Math.round((anchorRect?.height || 18) + 6));
  const belowOneLine = Math.round((anchorRect?.bottom || minTop) + gap + lineStep);
  const below = Math.round((anchorRect?.bottom || minTop) + gap);
  const above = Math.round((anchorRect?.top || minTop) - bar.height - gap);
  const top = belowOneLine <= maxTop
    ? belowOneLine
    : below <= maxTop
      ? below
      : above >= minTop
        ? above
        : clamp(belowOneLine, minTop, maxTop);
  return { left, top, docked: "anchor" };
}
