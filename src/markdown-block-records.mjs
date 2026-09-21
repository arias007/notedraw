function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

// A line range alone does not identify a block: task renderers number the items
// of every list from zero, so a task's synthetic line can coincide with a
// different block's real source line. Merging on the range alone silently
// deleted the task's own record and left that task in a vertical row.
function semanticMarkdownBlockKey(block) {
  const path = String(block?.path || "");
  const lineStart = finiteInteger(block?.lineStart);
  const lineEnd = finiteInteger(block?.lineEnd);
  if (!path || lineStart === null || lineEnd === null || lineStart < 0 || lineEnd < lineStart) {
    return "";
  }
  return `${path}\0${lineStart}\0${lineEnd}\0${String(block?.explicitLineGroup || "")}`;
}

// The same block is often captured at two render granularities: a task appears
// both as "- [ ] Parallel task" and as "Parallel task", a callout inner text as
// "This is a note." while its owner carries "Note\nThis is a note.". Those must
// still collapse. Two genuinely different blocks that merely share a line range
// have unrelated text, and must not.
function normalizeHintForIdentity(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[-*+]\s*\[[ xX]\]\s*/, "")
    .trim()
    .toLowerCase();
}

function hintCompatible(left, right) {
  const a = normalizeHintForIdentity(left);
  const b = normalizeHintForIdentity(right);
  if (!a || !b) {
    return true;
  }
  return a === b || a.includes(b) || b.includes(a);
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

function hasExplicitParallelMarkdownLayout(record) {
  if (!record || record.floating) {
    return false;
  }
  const span = Number(record.span);
  const widthScale = Number(record.widthScale);
  return (Number.isFinite(span) && span > 0 && span < 12)
    || (Number.isFinite(widthScale) && widthScale > 0 && widthScale < 0.999);
}

function markdownInlineWidthMode(record) {
  if (record?.inlineWidthMode === "fixed" || record?.inlineWidthMode === "fit") {
    return record.inlineWidthMode;
  }
  const span = Number(record?.span);
  const widthScale = Number(record?.widthScale);
  return span < 12 || widthScale < 0.999 ? "fixed" : "fit";
}

function mergeSemanticMarkdownBlocks(current, duplicate) {
  const records = [current, duplicate];
  // Re-rendered Markdown can create a fresh default owner (span=12) for a
  // block that already has a user-confirmed parallel layout. The default
  // owner must not erase that layout while the DOM is being rebuilt.
  const layoutSource = hasExplicitParallelMarkdownLayout(current)
    ? current
    : hasExplicitParallelMarkdownLayout(duplicate)
      ? duplicate
      : null;
  const explicitFloating = records.find((record) => record?.floating && record?.floatingExplicit && record?.floatBox);
  const implicitFloating = records.every((record) => record?.floating && record?.floatBox)
    ? records.find((record) => record?.floatBox)
    : null;
  const floatingSource = explicitFloating || implicitFloating;
  return {
    ...current,
    textHint: shortestUsefulHint(current.textHint, duplicate.textHint),
    span: layoutSource
      ? Number(layoutSource.span) || 1
      : Math.max(Number(current.span) || 1, Number(duplicate.span) || 1),
    noteFlowAutoSpan: Boolean(current.noteFlowAutoSpan && duplicate.noteFlowAutoSpan),
    widthScale: layoutSource
      ? Number(layoutSource.widthScale) || 1
      : Math.max(Number(current.widthScale) || 0, Number(duplicate.widthScale) || 0),
    inlineWidthMode: layoutSource
      ? markdownInlineWidthMode(layoutSource)
      : markdownInlineWidthMode(current) === "fixed" || markdownInlineWidthMode(duplicate) === "fixed"
        ? "fixed"
        : "fit",
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
    groupId: firstValue(records, "groupId") || "",
    commandId: firstValue(records, "commandId") || "",
    commandName: firstValue(records, "commandName") || ""
  };
}

function repeatedSingleLineHint(value) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 && lines.every((line) => line === lines[0]) ? lines[0] : "";
}

// The same rendered block can end up described by two records when a renderer
// replaces a list: the original single-line task keeps line 2..2 while a stale
// capture of the whole list survives as line 2..6 with the very same text. The
// semantic key differs, so they never merge, and identity matching is then free
// to bind either one to the live element. The two records disagree about the
// block, which makes a parallel row repack differently on every pass — the row
// jitters. Collapse any records that share a path and text and whose line
// ranges overlap into the tightest description.
function mergeOverlappingHintDuplicates(records) {
  const grouped = new Map();
  const passthrough = [];
  for (const record of records) {
    const hint = String(record?.textHint || "").trim();
    const start = finiteInteger(record?.lineStart);
    const end = finiteInteger(record?.lineEnd);
    if (!hint || start === null || end === null || end < start || start === 0 && end === 0) {
      passthrough.push(record);
      continue;
    }
    const key = `${String(record?.path || "")}\0${hint}`;
    const group = grouped.get(key) || [];
    group.push({ record, start, end });
    grouped.set(key, group);
  }
  const output = passthrough.slice();
  for (const group of grouped.values()) {
    if (group.length === 1) {
      output.push(group[0].record);
      continue;
    }
    // The member that already carries the user's parallel layout is the
    // authoritative description; among equals the tightest line range wins.
    // The surviving record MUST keep that tight range. Widening it (for
    // example a task on line 2 becoming 2..6) makes the record stop matching
    // the live element after Obsidian re-renders, so the side-by-side row is
    // silently dropped and the block collapses to a vertical full-width row.
    const ordered = group.slice().sort((left, right) => (
      Number(hasExplicitParallelMarkdownLayout(right.record)) - Number(hasExplicitParallelMarkdownLayout(left.record))
      || (left.end - left.start) - (right.end - right.start)
      || left.start - right.start
    ));
    const kept = [];
    for (const item of ordered) {
      const host = kept.find((candidate) => item.start <= candidate.coverEnd && candidate.coverStart <= item.end);
      if (!host) {
        kept.push({ record: { ...item.record }, start: item.start, end: item.end, coverStart: item.start, coverEnd: item.end });
        continue;
      }
      host.record = mergeSemanticMarkdownBlocks(host.record, item.record);
      // Track the widest description only for overlap detection; the record
      // itself keeps the tightest range it was created with.
      host.coverStart = Math.min(host.coverStart, item.start);
      host.coverEnd = Math.max(host.coverEnd, item.end);
    }
    output.push(...kept.map((item) => item.record));
  }
  return output;
}

export function dedupeMarkdownBlockRecords(value) {
  const records = Array.isArray(value) ? value.filter(Boolean) : [];
  const merged = [];
  // Bucket by line range, but only fold records inside a bucket whose rendered
  // text is actually compatible. Folding purely on the range collapsed two
  // different blocks whenever a synthetic task line collided with a real one.
  const buckets = new Map();
  for (const record of records) {
    const key = semanticMarkdownBlockKey(record);
    if (!key) {
      merged.push({ ...record });
      continue;
    }
    const bucket = buckets.get(key) || [];
    const host = bucket.find((entry) => hintCompatible(entry.hint, record.textHint));
    if (host) {
      merged[host.index] = mergeSemanticMarkdownBlocks(merged[host.index], record);
      host.hint = merged[host.index].textHint;
      continue;
    }
    bucket.push({ index: merged.length, hint: record.textHint });
    buckets.set(key, bucket);
    merged.push({ ...record });
  }

  const collapsed = mergeOverlappingHintDuplicates(merged);
  const reliableHints = new Set(collapsed.filter((record) => Number(record.lineStart) > 0)
    .map((record) => String(record.textHint || "").trim()).filter(Boolean));
  return collapsed.filter((record) => {
    if (Number(record.lineStart) !== 0 || Number(record.lineEnd) !== 0 || record.explicitLineGroup) {
      return true;
    }
    const repeated = repeatedSingleLineHint(record.textHint);
    return !repeated || !reliableHints.has(repeated);
  });
}
