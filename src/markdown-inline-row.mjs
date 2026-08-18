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

function fitPreferredSpans(preferred, columns) {
  if (!preferred.length || preferred.length > columns) {
    return [];
  }
  const available = columns - preferred.length;
  const weights = preferred.map((span) => Math.max(0, span - 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!totalWeight || available <= 0) {
    return preferred.map(() => 1);
  }
  const exactExtras = weights.map((weight) => weight / totalWeight * available);
  const extras = exactExtras.map(Math.floor);
  let remainder = available - extras.reduce((sum, value) => sum + value, 0);
  const order = exactExtras
    .map((value, index) => ({ index, fraction: value - extras[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const item of order) {
    if (remainder <= 0) {
      break;
    }
    extras[item.index] += 1;
    remainder -= 1;
  }
  return extras.map((extra) => extra + 1);
}

export function allocateInlineRow({
  existingIds = [],
  movingIds = [],
  targetId = "",
  side = "right",
  extraMovingCount = 0,
  columns = 12,
  preferredSpanById = null
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
  const totalColumns = Math.max(1, Math.floor(Number(columns) || 12));
  const preferredSpan = (id) => {
    const raw = preferredSpanById instanceof Map
      ? preferredSpanById.get(id)
      : preferredSpanById?.[id];
    return Math.max(1, Math.min(totalColumns, Math.round(Number(raw) || totalColumns)));
  };
  let spans = [];
  if (preferredSpanById && orderedIds.length <= totalColumns) {
    const preferred = orderedIds.map(preferredSpan);
    spans = preferred.reduce((sum, span) => sum + span, 0) <= totalColumns
      ? preferred
      : fitPreferredSpans(preferred, totalColumns);
  } else {
    spans = distributeInlineRowSpans(orderedIds.length, totalColumns);
  }
  const spanById = new Map(orderedIds.map((id, index) => [id, spans[index] || Number(columns) || 12]));
  return {
    canFit: spans.length === orderedIds.length,
    orderedIds,
    spans,
    spanById,
    totalCount: orderedIds.length
  };
}
