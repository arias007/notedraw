const DEFAULT_MAX_NODES = 240;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stripInlineMarkdown(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target)
    .replace(/<https?:\/\/[^>]+>/g, (match) => match.slice(1, -1))
    .replace(/<[^>]+>/g, " ")
    .replace(/(^|\s)([*_~`]{1,3})(?=\S)/g, "$1")
    .replace(/(\S)([*_~`]{1,3})(?=\s|$)/g, "$1")
    .replace(/\\([#*_[\]()`>+.!~-])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function leadingIndent(value) {
  let count = 0;
  for (const character of String(value || "")) {
    if (character === " ") {
      count += 1;
    } else if (character === "\t") {
      count += 4;
    } else {
      break;
    }
  }
  return count;
}

export function parseMarkdownMindMap(source, {
  title = "Mind map",
  maxNodes = DEFAULT_MAX_NODES
} = {}) {
  const nodes = [{ id: "root", parentId: null, text: stripInlineMarkdown(title) || "Mind map", type: "root", sourceLine: -1 }];
  const headingStack = [];
  const listStack = [];
  let currentSectionId = "root";
  let paragraphLines = [];
  let paragraphSourceLines = [];
  let paragraphStart = -1;
  let codeFence = "";
  let codeLines = [];
  let codeStart = -1;
  let codeEnd = -1;
  let frontmatter = false;
  let truncated = false;
  let sequence = 0;

  const canAdd = () => nodes.length < Math.max(2, Number(maxNodes) || DEFAULT_MAX_NODES);
  const addNode = (text, parentId, type, sourceLine, sourceEndLine = sourceLine, sourceText = "") => {
    const normalized = stripInlineMarkdown(text);
    if (!normalized || !canAdd()) {
      truncated = truncated || Boolean(normalized);
      return null;
    }
    const node = {
      id: `node-${(++sequence).toString(36)}`,
      parentId: parentId || "root",
      text: normalized,
      type,
      sourceLine,
      sourceEndLine,
      sourceText: String(sourceText || "")
    };
    nodes.push(node);
    return node;
  };
  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }
    addNode(
      paragraphLines.join(" "),
      currentSectionId,
      "paragraph",
      paragraphStart,
      paragraphStart + paragraphSourceLines.length - 1,
      paragraphSourceLines.join("\n")
    );
    paragraphLines = [];
    paragraphSourceLines = [];
    paragraphStart = -1;
  };
  const flushCode = () => {
    if (!codeLines.length && !codeFence) {
      return;
    }
    const language = codeFence.replace(/^`{3,}|^~{3,}/, "").trim();
    const body = codeLines.join(" ").replace(/\s+/g, " ").trim();
    addNode(
      [language ? `Code (${language})` : "Code", body].filter(Boolean).join(": "),
      currentSectionId,
      "code",
      codeStart,
      codeEnd >= codeStart ? codeEnd : codeStart + codeLines.length,
      lines.slice(codeStart, (codeEnd >= codeStart ? codeEnd : codeStart + codeLines.length) + 1).join("\n")
    );
    codeLines = [];
    codeFence = "";
    codeStart = -1;
    codeEnd = -1;
  };

  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (index === 0 && trimmed === "---") {
      frontmatter = true;
      continue;
    }
    if (frontmatter) {
      if (trimmed === "---") {
        frontmatter = false;
      }
      continue;
    }
    const fence = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (codeFence) {
      if (fence && fence[1][0] === codeFence[0]) {
        codeEnd = index;
        flushCode();
      } else if (trimmed) {
        codeLines.push(trimmed);
      }
      continue;
    }
    if (fence) {
      flushParagraph();
      codeFence = `${fence[1]}${fence[2] || ""}`;
      codeStart = index;
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      listStack.length = 0;
      const level = heading[1].length;
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      const parentId = headingStack[headingStack.length - 1]?.id || "root";
      const node = addNode(heading[2], parentId, "heading", index, index, line);
      if (node) {
        headingStack.push({ level, id: node.id });
        currentSectionId = node.id;
      }
      continue;
    }
    const list = line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(.*)$/);
    if (list) {
      flushParagraph();
      const indent = leadingIndent(list[1]);
      while (listStack.length && listStack[listStack.length - 1].indent >= indent) {
        listStack.pop();
      }
      const parentId = listStack[listStack.length - 1]?.id || currentSectionId;
      const task = list[2].match(/^\[([ xX])\]\s*(.*)$/);
      const text = task ? `[${task[1].toLowerCase() === "x" ? "x" : " "}] ${task[2]}` : list[2];
      const node = addNode(text, parentId, task ? "task" : "list", index, index, line);
      if (node) {
        listStack.push({ indent, id: node.id });
      }
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      listStack.length = 0;
      continue;
    }
    if (/^\|?\s*:?-{3,}/.test(trimmed)) {
      continue;
    }
    const quote = trimmed.match(/^>\s?(.*)$/);
    const table = trimmed.includes("|") && trimmed.replace(/\|/g, "").trim() !== trimmed;
    if (quote || table) {
      flushParagraph();
      listStack.length = 0;
      addNode(
        quote ? quote[1] : trimmed.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).filter(Boolean).join(" | "),
        currentSectionId,
        quote ? "quote" : "table",
        index,
        index,
        line
      );
      continue;
    }
    if (paragraphStart < 0) {
      paragraphStart = index;
    }
    paragraphLines.push(trimmed);
    paragraphSourceLines.push(line);
    listStack.length = 0;
  }
  if (codeFence && codeStart >= 0) {
    codeEnd = lines.length - 1;
  }
  flushParagraph();
  flushCode();
  return { nodes, truncated };
}

export function replaceMarkdownMindMapNodeText(source, node, nextText) {
  const text = String(nextText || "").trim();
  const type = String(node?.type || "");
  if (!text || type === "root") {
    return { source: String(source || ""), changed: false, reason: type === "root" ? "root-node" : "empty-text" };
  }
  const input = String(source || "");
  const newline = input.includes("\r\n") ? "\r\n" : "\n";
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  let startLine = Number(node?.sourceLine);
  let endLine = Number(node?.sourceEndLine);
  if (!Number.isInteger(startLine) || startLine < 0 || startLine >= lines.length) {
    const raw = String(node?.sourceText || "").replace(/\r\n?/g, "\n");
    const offset = raw ? lines.join("\n").indexOf(raw) : -1;
    if (offset < 0) {
      return { source: input, changed: false, reason: "source-range-not-found" };
    }
    startLine = lines.join("\n").slice(0, offset).split("\n").length - 1;
    endLine = startLine + raw.split("\n").length - 1;
  }
  if (!Number.isInteger(endLine) || endLine < startLine) {
    endLine = startLine;
  }
  endLine = Math.min(lines.length - 1, endLine);
  const original = lines.slice(startLine, endLine + 1);
  let replacement = [text];
  if (type === "heading") {
    const match = original[0]?.match(/^(\s{0,3}#{1,6}\s+)(.*?)(\s*#*\s*)$/);
    replacement = [match ? `${match[1]}${text}${match[3] || ""}` : text];
  } else if (type === "list" || type === "task") {
    const match = original[0]?.match(/^(\s*(?:[-+*]|\d+[.)])\s+)(?:\[([ xX])\]\s*)?(.*)$/);
    if (match) {
      const requestedTask = text.match(/^\[([ xX])\]\s*(.*)$/);
      const marker = requestedTask ? requestedTask[1] : match[2];
      const body = requestedTask ? requestedTask[2] : text;
      replacement = [`${match[1]}${marker !== undefined ? `[${String(marker).toLowerCase() === "x" ? "x" : " "}] ` : ""}${body}`];
    }
  } else if (type === "quote") {
    const prefix = original[0]?.match(/^(\s*>\s?)/)?.[1] || "> ";
    replacement = [`${prefix}${text}`];
  } else if (type === "table") {
    const leading = /^\s*\|/.test(original[0] || "");
    const trailing = /\|\s*$/.test(original[0] || "");
    replacement = [`${leading ? "| " : ""}${text}${trailing ? " |" : ""}`];
  } else if (type === "code") {
    const first = original[0] || "```";
    const last = original.length > 1 && /^\s*(`{3,}|~{3,})/.test(original.at(-1)) ? original.at(-1) : null;
    const body = text.replace(/^Code(?:\s*\([^)]*\))?\s*:\s*/i, "");
    replacement = [first, body, ...(last ? [last] : [])];
  }
  const before = lines.slice();
  lines.splice(startLine, endLine - startLine + 1, ...replacement);
  const output = lines.join(newline);
  return {
    source: output,
    changed: output !== input,
    startLine,
    endLine: startLine + replacement.length - 1,
    lineDelta: replacement.length - original.length,
    sourceText: replacement.join(newline),
    beforeText: before.slice(startLine, endLine + 1).join(newline)
  };
}

function estimateNodeHeight(text, width, fontSize) {
  const charactersPerLine = Math.max(8, Math.floor(width / Math.max(6, fontSize * 0.58)));
  const lines = Math.max(1, Math.ceil(String(text || "").length / charactersPerLine));
  return Math.max(34, Math.min(132, lines * fontSize * 1.28 + 16));
}

export function layoutMindMap(model, {
  originX = 24,
  originY = 24,
  canvasWidth = 900,
  canvasHeight = 1200,
  nodeWidth = 176,
  columnGap = 72,
  rowGap = 18
} = {}) {
  const sourceNodes = Array.isArray(model?.nodes) ? model.nodes : [];
  if (!sourceNodes.length) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }
  const byId = new Map(sourceNodes.map((node) => [node.id, { ...node, children: [] }]));
  const root = byId.get("root") || byId.values().next().value;
  for (const node of byId.values()) {
    if (node === root) {
      continue;
    }
    (byId.get(node.parentId) || root).children.push(node);
  }
  const assignDepth = (node, depth = 0) => {
    node.depth = depth;
    for (const child of node.children) {
      assignDepth(child, depth + 1);
    }
  };
  assignDepth(root);
  const maxDepth = Math.max(...Array.from(byId.values(), (node) => node.depth));
  const availableWidth = Math.max(240, Number(canvasWidth) - Number(originX) - 20);
  const naturalWidth = nodeWidth + maxDepth * (nodeWidth + columnGap);
  const horizontalScale = Math.min(1, availableWidth / Math.max(1, naturalWidth));
  const effectiveWidth = clamp(nodeWidth * horizontalScale, 104, nodeWidth);
  const columnStep = maxDepth > 0
    ? Math.max(effectiveWidth + 24, (availableWidth - effectiveWidth) / maxDepth)
    : effectiveWidth;
  for (const node of byId.values()) {
    node.fontSize = node.type === "root" ? 18 : node.type === "heading" ? 15 : 13;
    node.width = node.type === "root" ? Math.min(effectiveWidth + 20, availableWidth) : effectiveWidth;
    node.height = estimateNodeHeight(node.text, node.width, node.fontSize);
  }
  let cursorY = Number(originY) || 0;
  const place = (node) => {
    if (!node.children.length) {
      node.y = cursorY;
      cursorY += node.height + rowGap;
    } else {
      for (const child of node.children) {
        place(child);
      }
      const first = node.children[0];
      const last = node.children[node.children.length - 1];
      const center = ((first.y + first.height / 2) + (last.y + last.height / 2)) / 2;
      node.y = center - node.height / 2;
    }
    node.x = Number(originX) + node.depth * columnStep;
  };
  place(root);
  const levels = new Map();
  for (const node of byId.values()) {
    const level = levels.get(node.depth) || [];
    level.push(node);
    levels.set(node.depth, level);
  }
  for (const level of levels.values()) {
    level.sort((a, b) => a.y - b.y);
    let bottom = -Infinity;
    for (const node of level) {
      node.y = Math.max(node.y, bottom + rowGap);
      bottom = node.y + node.height;
    }
  }
  const nodes = Array.from(byId.values()).map(({ children, ...node }) => node);
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  const wantedHeight = maxY - minY;
  const availableHeight = Math.max(100, Number(canvasHeight) - 20);
  let shiftY = minY < 8 ? 8 - minY : 0;
  if (maxY + shiftY > availableHeight && wantedHeight <= availableHeight - 8) {
    shiftY -= maxY + shiftY - availableHeight;
  }
  if (shiftY) {
    for (const node of nodes) {
      node.y += shiftY;
    }
  }
  const edges = nodes.filter((node) => node.parentId && byId.has(node.parentId)).map((node) => ({
    fromId: node.parentId,
    toId: node.id,
    depth: node.depth
  }));
  return {
    nodes,
    edges,
    width: Math.max(...nodes.map((node) => node.x + node.width)) - Number(originX),
    height: Math.max(...nodes.map((node) => node.y + node.height)) - Math.min(...nodes.map((node) => node.y))
  };
}
