function normalizeRenderedText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeMarkdownText(value) {
  let text = String(value || "");
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "$1")
    .replace(/<\/?(span|u|mark|kbd|sup|sub|small|strong|b|em|i|code)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return normalizeRenderedText(text);
}

function collectCandidates(source) {
  const input = String(source || "");
  const parts = input.split(/(\r?\n)/);
  const rawLines = [];
  let offset = 0;
  for (let index = 0; index < parts.length; index += 2) {
    const raw = parts[index] || "";
    const newline = parts[index + 1] || "";
    rawLines.push({ raw, start: offset, end: offset + raw.length });
    offset += raw.length + newline.length;
  }
  const candidates = [];
  for (let line = 0; line < rawLines.length; line += 1) {
    const text = normalizeMarkdownText(rawLines[line].raw);
    if (text) {
      candidates.push({
        lineStart: line,
        lineEnd: line,
        start: rawLines[line].start,
        end: rawLines[line].end,
        sourceText: input.slice(rawLines[line].start, rawLines[line].end),
        text,
        kind: "line"
      });
    }
  }
  let blockStart = -1;
  let blockLines = [];
  const flushBlock = (endLine) => {
    if (blockStart < 0) {
      return;
    }
    const text = normalizeMarkdownText(blockLines.join("\n"));
    if (text) {
      const start = rawLines[blockStart].start;
      const end = rawLines[endLine].end;
      candidates.push({
        lineStart: blockStart,
        lineEnd: endLine,
        start,
        end,
        sourceText: input.slice(start, end),
        text,
        kind: "block"
      });
    }
    blockStart = -1;
    blockLines = [];
  };
  for (let line = 0; line < rawLines.length; line += 1) {
    if (!rawLines[line].raw.trim()) {
      flushBlock(line - 1);
      continue;
    }
    if (blockStart < 0) {
      blockStart = line;
    }
    blockLines.push(rawLines[line].raw);
  }
  flushBlock(rawLines.length - 1);
  return candidates;
}

export function createMarkdownSourceIndex(source) {
  const input = String(source || "");
  const candidates = collectCandidates(input);
  const exact = new Map();
  const compact = new Map();
  const append = (map, key, candidate) => {
    const values = map.get(key) || [];
    values.push(candidate);
    map.set(key, values);
  };
  for (const candidate of candidates) {
    append(exact, candidate.text, candidate);
    append(compact, candidate.text.replace(/\s+/g, ""), candidate);
  }
  return {
    source: input,
    candidates,
    exact,
    compact
  };
}

function indexedCandidates(source, sourceIndex) {
  const input = String(source || "");
  return sourceIndex?.source === input && Array.isArray(sourceIndex.candidates)
    ? sourceIndex.candidates
    : collectCandidates(input);
}

function indexedExactCandidates(source, rendered, compactRendered, sourceIndex) {
  const input = String(source || "");
  if (sourceIndex?.source === input && sourceIndex.exact instanceof Map && sourceIndex.compact instanceof Map) {
    return uniqueSourceCandidates([
      ...(sourceIndex.exact.get(rendered) || []),
      ...(sourceIndex.compact.get(compactRendered) || [])
    ]);
  }
  return uniqueSourceCandidates(indexedCandidates(input, sourceIndex).filter((candidate) => {
    return candidate.text === rendered || candidate.text.replace(/\s+/g, "") === compactRendered;
  }));
}

function candidateDistanceFromRange(candidate, lineStart, lineEnd) {
  if (!Number.isFinite(lineStart)) {
    return Number.POSITIVE_INFINITY;
  }
  const start = Math.min(lineStart, Number.isFinite(lineEnd) ? lineEnd : lineStart);
  const end = Math.max(lineStart, Number.isFinite(lineEnd) ? lineEnd : lineStart);
  if (candidate.lineEnd >= start && candidate.lineStart <= end) {
    return 0;
  }
  return candidate.lineStart > end ? candidate.lineStart - end : start - candidate.lineEnd;
}

function uniqueSourceCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.start}:${candidate.end}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sourceTarget(candidate, renderedText) {
  return candidate ? {
    start: candidate.start,
    end: candidate.end,
    line: candidate.lineStart,
    endLine: candidate.lineEnd,
    text: candidate.sourceText,
    normalizedText: normalizeRenderedText(renderedText),
    normalizedMarkdown: candidate.text
  } : null;
}

export function findRenderedMarkdownSourceTargets(source, renderedText, sourceIndex = null) {
  const rendered = normalizeRenderedText(renderedText);
  if (!rendered) {
    return [];
  }
  const compactRendered = rendered.replace(/\s+/g, "");
  const candidates = indexedCandidates(source, sourceIndex);
  const exact = indexedExactCandidates(source, rendered, compactRendered, sourceIndex);
  if (exact.length) {
    return exact.map((candidate) => sourceTarget(candidate, renderedText));
  }
  return uniqueSourceCandidates(candidates.map((candidate) => {
    const contains = candidate.text.includes(rendered) || rendered.includes(candidate.text);
    const overlap = contains ? Math.min(candidate.text.length, rendered.length) / Math.max(candidate.text.length, rendered.length) : 0;
    return { candidate, overlap };
  }).filter(({ overlap }) => overlap >= 0.75).map(({ candidate }) => candidate))
    .map((candidate) => sourceTarget(candidate, renderedText));
}

export function resolveRenderedMarkdownSourceTarget(source, renderedText, sourceInfo = {}, sourceIndex = null) {
  const rendered = normalizeRenderedText(renderedText);
  if (!rendered) {
    return null;
  }
  const compactRendered = rendered.replace(/\s+/g, "");
  const candidates = indexedCandidates(source, sourceIndex);
  const exact = indexedExactCandidates(source, rendered, compactRendered, sourceIndex);
  const lineStart = sourceInfo?.lineStart === null || sourceInfo?.lineStart === undefined || sourceInfo?.lineStart === ""
    ? Number.NaN
    : Number(sourceInfo.lineStart);
  const lineEnd = sourceInfo?.lineEnd === null || sourceInfo?.lineEnd === undefined || sourceInfo?.lineEnd === ""
    ? Number.NaN
    : Number(sourceInfo.lineEnd);
  const choose = (matches, { allowUnique = false, maxDistance = 2 } = {}) => {
    if (allowUnique && matches.length === 1) {
      return matches[0];
    }
    if (!Number.isFinite(lineStart)) {
      return null;
    }
    const ranked = matches.map((candidate) => ({
      candidate,
      distance: candidateDistanceFromRange(candidate, lineStart, lineEnd)
    })).sort((a, b) => a.distance - b.distance || a.candidate.lineStart - b.candidate.lineStart);
    if (!ranked.length || ranked[0].distance > maxDistance || ranked[1]?.distance === ranked[0].distance) {
      return null;
    }
    return ranked[0].candidate;
  };
  const exactMatch = choose(exact, { allowUnique: true });
  if (exactMatch) {
    return sourceTarget(exactMatch, renderedText);
  }
  if (exact.length > 1) {
    return null;
  }
  const partial = uniqueSourceCandidates(candidates.map((candidate) => {
    const contains = candidate.text.includes(rendered) || rendered.includes(candidate.text);
    const overlap = contains ? Math.min(candidate.text.length, rendered.length) / Math.max(candidate.text.length, rendered.length) : 0;
    return { candidate, overlap };
  }).filter(({ overlap }) => overlap >= 0.75).map(({ candidate }) => candidate));
  return sourceTarget(choose(partial, { maxDistance: 1 }), renderedText);
}

export function matchRenderedTextToMarkdown(source, renderedText, sourceIndex = null) {
  const rendered = normalizeRenderedText(renderedText);
  if (!rendered) {
    return null;
  }
  const candidates = indexedCandidates(source, sourceIndex);
  const indexedExact = sourceIndex?.source === String(source || "") && sourceIndex.exact instanceof Map
    ? sourceIndex.exact.get(rendered) || []
    : candidates.filter((candidate) => candidate.text === rendered);
  const exact = indexedExact
    .slice()
    .sort((a, b) => (a.lineEnd - a.lineStart) - (b.lineEnd - b.lineStart) || (a.kind === "line" ? -1 : 1))[0];
  if (exact) {
    return { lineStart: exact.lineStart, lineEnd: exact.lineEnd, confidence: 1 };
  }
  const compactRendered = rendered.replace(/\s+/g, "");
  const indexedCompact = sourceIndex?.source === String(source || "") && sourceIndex.compact instanceof Map
    ? sourceIndex.compact.get(compactRendered) || []
    : candidates.filter((candidate) => candidate.text.replace(/\s+/g, "") === compactRendered);
  const whitespaceEquivalent = indexedCompact
    .slice()
    .sort((a, b) => (a.lineEnd - a.lineStart) - (b.lineEnd - b.lineStart) || (a.kind === "line" ? -1 : 1))[0];
  if (whitespaceEquivalent) {
    return { lineStart: whitespaceEquivalent.lineStart, lineEnd: whitespaceEquivalent.lineEnd, confidence: 0.98 };
  }
  const partial = candidates.map((candidate) => {
    const contains = candidate.text.includes(rendered) || rendered.includes(candidate.text);
    const overlap = contains ? Math.min(candidate.text.length, rendered.length) / Math.max(candidate.text.length, rendered.length) : 0;
    return { candidate, overlap };
  }).filter(({ overlap }) => overlap >= 0.55)
    .sort((a, b) => b.overlap - a.overlap || (a.candidate.lineEnd - a.candidate.lineStart) - (b.candidate.lineEnd - b.candidate.lineStart))[0];
  if (!partial) {
    return null;
  }
  return {
    lineStart: partial.candidate.lineStart,
    lineEnd: partial.candidate.lineEnd,
    confidence: Math.min(0.92, Math.max(0.75, partial.overlap))
  };
}
