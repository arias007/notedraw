function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function semanticMarkdownBlockKey(block) {
  const path = String(block?.path || "");
  const lineStart = finiteInteger(block?.lineStart);
  const lineEnd = finiteInteger(block?.lineEnd);
  if (!path || lineStart === null || lineEnd === null || lineStart < 0 || lineEnd < lineStart) {
    return "";
  }
  return `${path}\0${lineStart}\0${lineEnd}\0${String(block?.explicitLineGroup || "")}`;
}

function shortestUsefulHint(...values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).sort((left, right) => {
    const leftLines = left.split(/\r?\n/).length;
    const rightLines = right.split(/\r?\n/).length;
    return leftLines - rightLines || left.length - right.length;
  })[0] || "";
}

function firstValue(records, property, predicate = Boolean) {
  return records.map((record) => record?.[property]).find(predicate);
}

function mergeSemanticMarkdownBlocks(current, duplicate) {
  const records = [current, duplicate];
  const explicitFloating = records.find((record) => record?.floating && record?.floatingExplicit && record?.floatBox);
  const implicitFloating = records.every((record) => record?.floating && record?.floatBox)
    ? records.find((record) => record?.floatBox)
    : null;
  const floatingSource = explicitFloating || implicitFloating;
  return {
    ...current,
    textHint: shortestUsefulHint(current.textHint, duplicate.textHint),
    span: Math.max(Number(current.span) || 1, Number(duplicate.span) || 1),
    noteFlowAutoSpan: Boolean(current.noteFlowAutoSpan && duplicate.noteFlowAutoSpan),
    widthScale: Math.max(Number(current.widthScale) || 0, Number(duplicate.widthScale) || 0),
    minHeight: Math.max(Number(current.minHeight) || 0, Number(duplicate.minHeight) || 0),
    borderColor: firstValue(records, "borderColor") || "",
    backgroundColor: firstValue(records, "backgroundColor") || "",
    contentColor: firstValue(records, "contentColor") || "",
    contentOpacity: Math.max(Number(current.contentOpacity) || 0, Number(duplicate.contentOpacity) || 0),
    contentScale: Math.max(Number(current.contentScale) || 0, Number(duplicate.contentScale) || 0),
    floating: Boolean(floatingSource),
    floatingExplicit: Boolean(explicitFloating),
    floatBox: floatingSource?.floatBox || null,
    locked: Boolean(current.locked || duplicate.locked),
    groupId: firstValue(records, "groupId") || ""
  };
}

function repeatedSingleLineHint(value) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 && lines.every((line) => line === lines[0]) ? lines[0] : "";
}

export function dedupeMarkdownBlockRecords(value) {
  const records = Array.isArray(value) ? value.filter(Boolean) : [];
  const merged = [];
  const indexes = new Map();
  for (const record of records) {
    const key = semanticMarkdownBlockKey(record);
    if (!key || !indexes.has(key)) {
      if (key) {
        indexes.set(key, merged.length);
      }
      merged.push({ ...record });
      continue;
    }
    const index = indexes.get(key);
    merged[index] = mergeSemanticMarkdownBlocks(merged[index], record);
  }

  const reliableHints = new Set(merged.filter((record) => Number(record.lineStart) > 0)
    .map((record) => String(record.textHint || "").trim()).filter(Boolean));
  return merged.filter((record) => {
    if (Number(record.lineStart) !== 0 || Number(record.lineEnd) !== 0 || record.explicitLineGroup) {
      return true;
    }
    const repeated = repeatedSingleLineHint(record.textHint);
    return !repeated || !reliableHints.has(repeated);
  });
}
