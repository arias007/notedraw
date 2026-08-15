import { shouldPlaceStrokeBelowMarkdown } from "./note-flow-layout.mjs";

export const SELECTION_FILTER_ALL = "all";
export const SELECTION_FILTER_FLOATING = "floating";
export const SELECTION_FILTER_MARKDOWN = "markdown";

function uniqueIndexes(indexes, strokeCount) {
  return Array.from(new Set((indexes || []).map(Number).filter((index) => {
    return Number.isInteger(index) && index >= 0 && index < strokeCount;
  }))).sort((a, b) => a - b);
}

function uniqueIds(ids) {
  return Array.from(new Set((ids || []).map((id) => String(id || "")).filter(Boolean))).sort();
}

export function createSelectionFilterSnapshot(strokes, strokeIndexes, markdownBlockIds) {
  const sourceStrokes = Array.isArray(strokes) ? strokes : [];
  const allStrokeIndexes = uniqueIndexes(strokeIndexes, sourceStrokes.length);
  const allMarkdownBlockIds = uniqueIds(markdownBlockIds);
  const floatingStrokeIndexes = allStrokeIndexes.filter((index) => !shouldPlaceStrokeBelowMarkdown(sourceStrokes[index]));
  const markdownStrokeIndexes = allStrokeIndexes.filter((index) => shouldPlaceStrokeBelowMarkdown(sourceStrokes[index]));
  return {
    allStrokeIndexes,
    allMarkdownBlockIds,
    floatingStrokeIndexes,
    markdownStrokeIndexes,
    hasMixedSelection: floatingStrokeIndexes.length > 0
      && markdownStrokeIndexes.length + allMarkdownBlockIds.length > 0
  };
}

export function nextSelectionFilterMode(mode) {
  if (mode === SELECTION_FILTER_FLOATING) {
    return SELECTION_FILTER_MARKDOWN;
  }
  if (mode === SELECTION_FILTER_MARKDOWN) {
    return SELECTION_FILTER_ALL;
  }
  return SELECTION_FILTER_FLOATING;
}

export function selectionForFilterMode(snapshot, mode) {
  if (!snapshot) {
    return { strokeIndexes: [], markdownBlockIds: [] };
  }
  if (mode === SELECTION_FILTER_FLOATING) {
    return { strokeIndexes: snapshot.floatingStrokeIndexes, markdownBlockIds: [] };
  }
  if (mode === SELECTION_FILTER_MARKDOWN) {
    return {
      strokeIndexes: snapshot.markdownStrokeIndexes,
      markdownBlockIds: snapshot.allMarkdownBlockIds
    };
  }
  return {
    strokeIndexes: snapshot.allStrokeIndexes,
    markdownBlockIds: snapshot.allMarkdownBlockIds
  };
}

export function selectionMatchesFilterMode(snapshot, mode, strokeIndexes, markdownBlockIds) {
  const expected = selectionForFilterMode(snapshot, mode);
  const actualStrokes = uniqueIndexes(strokeIndexes, Number.MAX_SAFE_INTEGER);
  const actualBlocks = uniqueIds(markdownBlockIds);
  return expected.strokeIndexes.length === actualStrokes.length
    && expected.markdownBlockIds.length === actualBlocks.length
    && expected.strokeIndexes.every((index, position) => index === actualStrokes[position])
    && expected.markdownBlockIds.every((id, position) => id === actualBlocks[position]);
}
