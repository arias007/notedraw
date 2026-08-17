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
    .replace(/^\s*(?:```|~~~)[^\n]*$/gm, "")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/^\s*\$\$\s*$/gm, "")
    .replace(/^\s*:::[^\n]*$/gm, "")
    .replace(/<\/?(span|u|mark|kbd|sup|sub|small|strong|b|em|i|code)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/!\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/!\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .split("\n")
    .map((line) => {
      if (!line.includes("|")) {
        return line;
      }
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      if (cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        return "";
      }
      return cells.length > 1 ? cells.join("\t") : line;
    })
    .join("\n");
  return normalizeRenderedText(text);
}

function calloutRenderedAliases(sourceText) {
  const lines = String(sourceText || "").split(/\r?\n/).map((line) => line.replace(/^\s{0,3}>\s?/, ""));
  const marker = String(lines[0] || "").trim().match(/^\[!([^\]]+)\][+-]?(?:\s+(.+?))?\s*$/);
  if (!marker) {
    return [];
  }
  const type = normalizeRenderedText(marker[1]);
  const customTitle = normalizeMarkdownText(marker[2] || "");
  const defaultTitle = type ? `${type.charAt(0).toUpperCase()}${type.slice(1)}` : "";
  const body = normalizeMarkdownText(lines.slice(1).join("\n"));
  const title = customTitle || defaultTitle;
  return [
    normalizeRenderedText([title, body].filter(Boolean).join("\n")),
    normalizeRenderedText([type, body].filter(Boolean).join("\n")),
    body
  ].filter(Boolean);
}

function footnoteRenderedAliases(sourceText) {
  const source = String(sourceText || "");
  if (!/\[\^[^\]]+\](?:\([^)]+\))?/.test(source)) {
    return [];
  }
  const keepLabel = source
    .replace(/\[\^([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\^([^\]]+)\]/g, "$1");
  const omitLabel = source
    .replace(/\[\^[^\]]+\]\([^)]+\)/g, "")
    .replace(/\[\^[^\]]+\]/g, "");
  return [normalizeMarkdownText(keepLabel), normalizeMarkdownText(omitLabel)].filter(Boolean);
}

function candidateRenderedAliases(candidate) {
  return Array.from(new Set([
    normalizeRenderedText(candidate?.text),
    candidate?.kind === "thematic-break" ? "---" : "",
    ...calloutRenderedAliases(candidate?.sourceText),
    ...footnoteRenderedAliases(candidate?.sourceText)
  ].filter(Boolean)));
}

function isMarkdownTableDelimiter(rawLine) {
  const cells = String(rawLine || "").trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function markdownLineKind(rawLine) {
  const raw = String(rawLine || "");
  const trimmed = raw.trim();
  if (!trimmed) return "blank";
  if (/^\s{0,3}(?:```|~~~)/.test(raw)) return "fence";
  if (/^\s{0,3}#{1,6}(?:\s+|$)/.test(raw)) return "heading";
  if (/^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(raw)) return "thematic-break";
  if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(raw)) return "list-item";
  if (/^\s{0,3}>/.test(raw)) return "blockquote";
  if (/^\s*(?:!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\])\s*$/.test(raw)) return "media";
  if (/^\s*\|/.test(raw) || isMarkdownTableDelimiter(raw)) return "table";
  if (/^\s{0,3}(?:\$\$|:::)/.test(raw)) return "container";
  return "paragraph";
}

function collectSemanticBlocks(input, rawLines) {
  const blocks = [];
  let active = null;
  let fenceMarker = "";
  let containerMarker = "";

  const appendBlock = (lineStart, lineEnd, kind) => {
    if (lineStart < 0 || lineEnd < lineStart || !rawLines[lineStart] || !rawLines[lineEnd]) {
      return;
    }
    const start = rawLines[lineStart].start;
    const end = rawLines[lineEnd].end;
    const sourceText = input.slice(start, end);
    const identitySource = kind === "heading" && lineEnd > lineStart
      ? rawLines[lineStart].raw
      : sourceText;
    const text = normalizeMarkdownText(identitySource);
    if (!text && !["thematic-break", "media"].includes(kind)) {
      return;
    }
    blocks.push({ lineStart, lineEnd, start, end, sourceText, text, kind });
  };
  const flush = () => {
    if (active) {
      appendBlock(active.start, active.end, active.kind);
      active = null;
    }
  };
  const begin = (line, kind) => {
    active = { start: line, end: line, kind };
  };

  for (let line = 0; line < rawLines.length; line += 1) {
    const raw = rawLines[line].raw;
    const nextRaw = rawLines[line + 1]?.raw || "";
    const kind = raw.includes("|") && isMarkdownTableDelimiter(nextRaw)
      ? "table"
      : markdownLineKind(raw);
    if (active?.kind === "fence") {
      active.end = line;
      if (line > active.start && raw.trim().startsWith(fenceMarker)) {
        flush();
        fenceMarker = "";
      }
      continue;
    }
    if (active?.kind === "container") {
      active.end = line;
      if (line > active.start && raw.trim().startsWith(containerMarker)) {
        flush();
        containerMarker = "";
      }
      continue;
    }
    if (active?.kind === "paragraph" && active.start === active.end && /^\s*(?:=+|-+)\s*$/.test(raw)) {
      active.end = line;
      active.kind = "heading";
      flush();
      continue;
    }
    if (kind === "blank") {
      flush();
      continue;
    }
    if (kind === "fence") {
      flush();
      fenceMarker = raw.trim().startsWith("~~~") ? "~~~" : "```";
      begin(line, "fence");
      continue;
    }
    if (["heading", "thematic-break", "media"].includes(kind)) {
      flush();
      appendBlock(line, line, kind);
      continue;
    }
    if (active?.kind === "list-item" && /^\s{2,}\S/.test(raw)) {
      active.end = line;
      continue;
    }
    if (active?.kind === "list-item" && kind === "paragraph") {
      // CommonMark permits a lazy continuation without indentation. It is
      // still part of the list item owner until a blank or block boundary.
      active.end = line;
      continue;
    }
    if (kind === "list-item") {
      flush();
      begin(line, kind);
      continue;
    }
    if (active?.kind === "table" && raw.includes("|")) {
      active.end = line;
      continue;
    }
    if (["blockquote", "table", "container"].includes(kind)) {
      if (kind === "container") {
        flush();
        const trimmed = raw.trim();
        containerMarker = trimmed.startsWith("$$") ? "$$" : ":::";
        if (trimmed.length > containerMarker.length && trimmed.endsWith(containerMarker)) {
          appendBlock(line, line, kind);
          containerMarker = "";
          continue;
        }
        begin(line, kind);
      } else if (active?.kind === kind) {
        active.end = line;
      } else {
        flush();
        begin(line, kind);
      }
      continue;
    }
    if (active?.kind === "paragraph") {
      active.end = line;
    } else {
      flush();
      begin(line, "paragraph");
    }
  }
  flush();
  return blocks;
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
  const semanticBlocks = collectSemanticBlocks(input, rawLines);
  candidates.push(...semanticBlocks);
  // Keep line candidates only as a compatibility fallback for renderers that
  // expose a fragment without a complete owner. Complete owners are inserted
  // first so all exact matches prefer the semantic range.
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
    for (const alias of candidateRenderedAliases(candidate)) {
      append(exact, alias, candidate);
      append(compact, alias.replace(/\s+/g, ""), candidate);
    }
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
    return candidateRenderedAliases(candidate).some((alias) => (
      alias === rendered || alias.replace(/\s+/g, "") === compactRendered
    ));
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

function normalizeEmbedDestination(value) {
  let target = String(value || "").trim().replace(/^!/, "");
  const wiki = target.match(/^\[\[([\s\S]+)\]\]$/);
  if (wiki) {
    target = wiki[1];
  }
  target = target.split("|")[0].trim().replace(/^<|>$/g, "");
  try {
    target = decodeURIComponent(target);
  } catch {
    // Keep the original destination when it is not URI encoded.
  }
  return target.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\.md(?=#|$)/i, "").toLowerCase();
}

function embedDestinations(sourceText) {
  const text = String(sourceText || "");
  const destinations = [];
  for (const match of text.matchAll(/!\[\[([^\]]+)\]\]/g)) {
    destinations.push(normalizeEmbedDestination(match[1]));
  }
  for (const match of text.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g)) {
    destinations.push(normalizeEmbedDestination(match[1] || match[2]));
  }
  return destinations.filter(Boolean);
}

export function resolveMarkdownEmbedSourceTarget(source, embedDestination, sourceInfo = {}, sourceIndex = null) {
  const expected = normalizeEmbedDestination(embedDestination);
  if (!expected) {
    return null;
  }
  const expectedPath = expected.split("#")[0];
  const candidates = uniqueSourceCandidates(indexedCandidates(source, sourceIndex).filter((candidate) => {
    return embedDestinations(candidate.sourceText).some((destination) => {
      return destination === expected || destination.split("#")[0] === expectedPath;
    });
  }));
  if (!candidates.length) {
    return null;
  }
  const exact = candidates.filter((candidate) => embedDestinations(candidate.sourceText).includes(expected));
  const matches = exact.length ? exact : candidates;
  const lineStart = sourceInfo?.lineStart === null || sourceInfo?.lineStart === undefined || sourceInfo?.lineStart === ""
    ? Number.NaN
    : Number(sourceInfo.lineStart);
  const lineEnd = sourceInfo?.lineEnd === null || sourceInfo?.lineEnd === undefined || sourceInfo?.lineEnd === ""
    ? Number.NaN
    : Number(sourceInfo.lineEnd);
  const ranked = matches.map((candidate) => ({
    candidate,
    distance: candidateDistanceFromRange(
      candidate,
      Number.isFinite(lineStart) ? lineStart : Number.NaN,
      Number.isFinite(lineEnd) ? lineEnd : lineStart
    )
  })).sort((a, b) => a.distance - b.distance || a.candidate.lineStart - b.candidate.lineStart);
  if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) {
    return null;
  }
  if (matches.length > 1 && !Number.isFinite(lineStart)) {
    return null;
  }
  return sourceTarget(ranked[0].candidate, ranked[0].candidate.sourceText);
}

function sourceTarget(candidate, renderedText) {
  return candidate ? {
    start: candidate.start,
    end: candidate.end,
    line: candidate.lineStart,
    endLine: candidate.lineEnd,
    text: candidate.sourceText,
    kind: candidate.kind,
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
    })).sort((a, b) => {
      const distance = a.distance - b.distance;
      if (distance) return distance;
      const aSpan = a.candidate.lineEnd - a.candidate.lineStart;
      const bSpan = b.candidate.lineEnd - b.candidate.lineStart;
      const aSemantic = a.candidate.kind === "line" ? 1 : 0;
      const bSemantic = b.candidate.kind === "line" ? 1 : 0;
      return aSemantic - bSemantic || bSpan - aSpan || a.candidate.lineStart - b.candidate.lineStart;
    });
    const first = ranked[0];
    const second = ranked[1];
    const equallyRanked = first && second
      && first.distance === second.distance
      && (first.candidate.kind === "line") === (second.candidate.kind === "line")
      && first.candidate.lineEnd - first.candidate.lineStart === second.candidate.lineEnd - second.candidate.lineStart;
    if (!first || first.distance > maxDistance || equallyRanked) {
      return null;
    }
    return first.candidate;
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
    .sort((a, b) => (a.kind === "line" ? 1 : 0) - (b.kind === "line" ? 1 : 0)
      || (b.lineEnd - b.lineStart) - (a.lineEnd - a.lineStart))[0];
  if (exact) {
    return { lineStart: exact.lineStart, lineEnd: exact.lineEnd, confidence: 1 };
  }
  const compactRendered = rendered.replace(/\s+/g, "");
  const indexedCompact = sourceIndex?.source === String(source || "") && sourceIndex.compact instanceof Map
    ? sourceIndex.compact.get(compactRendered) || []
    : candidates.filter((candidate) => candidate.text.replace(/\s+/g, "") === compactRendered);
  const whitespaceEquivalent = indexedCompact
    .slice()
    .sort((a, b) => (a.kind === "line" ? 1 : 0) - (b.kind === "line" ? 1 : 0)
      || (b.lineEnd - b.lineStart) - (a.lineEnd - a.lineStart))[0];
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
