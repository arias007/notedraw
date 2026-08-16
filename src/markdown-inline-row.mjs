function uniqueIds(values) {
  const seen = new Set();
  return (values || []).map((value) => String(value || "")).filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

export function distributeInlineRowSpans(itemCount, columns = 12) {
  const count = Math.max(0, Math.floor(Number(itemCount) || 0));
  const totalColumns = Math.max(1, Math.floor(Number(columns) || 12));
  if (!count || count > totalColumns) {
    return [];
  }
  const base = Math.floor(totalColumns / count);
  const remainder = totalColumns % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function allocateInlineRow({
  existingIds = [],
  movingIds = [],
  targetId = "",
  side = "right",
  extraMovingCount = 0,
  columns = 12
} = {}) {
  const target = String(targetId || "__notedraw-inline-target__");
  const moving = uniqueIds(movingIds);
  const movingSet = new Set(moving);
  const existing = uniqueIds(existingIds).filter((id) => !movingSet.has(id));
  if (!existing.includes(target)) {
    existing.push(target);
  }
  const extraCount = Math.max(0, Math.floor(Number(extraMovingCount) || 0));
  for (let index = 0; index < extraCount; index += 1) {
    moving.push(`__notedraw-inline-extra-${index}__`);
  }
  const targetIndex = Math.max(0, existing.indexOf(target));
  const insertionIndex = side === "left" ? targetIndex : targetIndex + 1;
  const orderedIds = existing.slice();
  orderedIds.splice(insertionIndex, 0, ...moving);
  const spans = distributeInlineRowSpans(orderedIds.length, columns);
  const spanById = new Map(orderedIds.map((id, index) => [id, spans[index] || Number(columns) || 12]));
  return {
    canFit: spans.length === orderedIds.length,
    orderedIds,
    spans,
    spanById,
    totalCount: orderedIds.length
  };
}
