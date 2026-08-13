export const DRAWING_STORAGE_CONFIG = "config";
export const DRAWING_STORAGE_NOTE_SUBFOLDER = "note-subfolder";
export const DRAWING_STORAGE_NOTE_FOLDER = "note-folder";
export const DRAWING_STORAGE_EMBEDDED = "note-file";

export const DRAWING_STORAGE_MODES = [
  DRAWING_STORAGE_CONFIG,
  DRAWING_STORAGE_NOTE_SUBFOLDER,
  DRAWING_STORAGE_NOTE_FOLDER,
  DRAWING_STORAGE_EMBEDDED
];

export const NOTEDRAW_DATA_BEGIN = "NOTEDRAW_DATA_BEGIN";
export const NOTEDRAW_DATA_END = "NOTEDRAW_DATA_END";

const DATA_BLOCK_PATTERN = /<!--\s*NOTEDRAW_DATA_BEGIN\s+([a-z0-9-]+)\s*\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\nNOTEDRAW_DATA_END\s*-->/gi;

export function normalizeDrawingStorageMode(value) {
  return DRAWING_STORAGE_MODES.includes(value) ? value : DRAWING_STORAGE_CONFIG;
}

export function resolveDrawingStoragePath({
  filePath,
  configDir = "",
  pluginId = "notedraw",
  encodedName = "",
  mode = DRAWING_STORAGE_CONFIG
} = {}) {
  const normalizedPath = normalizePath(filePath);
  const normalizedMode = normalizeDrawingStorageMode(mode);
  const fallbackEncoded = `${normalizedPath.replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\//g, "__")}.json`;
  if (normalizedMode === DRAWING_STORAGE_CONFIG) {
    if (!String(configDir || "").trim()) {
      throw new Error("configDir is required for plugin config storage");
    }
    return `${normalizePath(configDir)}/plugins/${normalizePath(pluginId)}/drawings/${encodedName || fallbackEncoded}`;
  }
  if (normalizedMode === DRAWING_STORAGE_EMBEDDED) {
    return `${normalizedPath}#${NOTEDRAW_DATA_BEGIN}`;
  }
  const slash = normalizedPath.lastIndexOf("/");
  const parent = slash >= 0 ? normalizedPath.slice(0, slash) : "";
  const name = slash >= 0 ? normalizedPath.slice(slash + 1) : normalizedPath;
  const dot = name.lastIndexOf(".");
  const basename = (dot > 0 ? name.slice(0, dot) : name) || "Untitled";
  const dataName = `${basename}.notedraw.json`;
  const folder = normalizedMode === DRAWING_STORAGE_NOTE_SUBFOLDER
    ? joinPath(parent, "notedraw")
    : parent;
  return joinPath(folder, dataName);
}

export async function encodeNotedrawDataBlock(bundle, options = {}) {
  const source = new TextEncoder().encode(JSON.stringify(bundle));
  const compressed = options.compress !== false ? await gzipBytes(source) : null;
  const bytes = compressed || source;
  const codec = compressed ? "gzip-base64" : "base64";
  const payload = bytesToBase64(bytes);
  const lines = payload.match(/.{1,8192}/g) || [""];
  return `<!-- ${NOTEDRAW_DATA_BEGIN} ${codec}\n${lines.join("\n")}\n${NOTEDRAW_DATA_END} -->`;
}

export async function decodeNotedrawDataBlock(markdown) {
  const block = findNotedrawDataBlock(markdown);
  if (!block) {
    return null;
  }
  try {
    const encoded = block.payload.replace(/\s+/g, "");
    const bytes = base64ToBytes(encoded);
    const decoded = block.codec === "gzip-base64" ? await gunzipBytes(bytes) : bytes;
    return JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    return null;
  }
}

export function findNotedrawDataBlock(markdown) {
  const source = String(markdown || "");
  const matches = Array.from(source.matchAll(DATA_BLOCK_PATTERN));
  const match = matches[matches.length - 1];
  return match ? {
    codec: String(match[1] || "").toLowerCase(),
    payload: match[2] || "",
    start: match.index,
    end: match.index + match[0].length
  } : null;
}

export function stripNotedrawDataBlocks(markdown) {
  return String(markdown || "").replace(DATA_BLOCK_PATTERN, "").replace(/[ \t]+$/gm, "").trimEnd();
}

export async function appendNotedrawDataBlock(markdown, bundle, options = {}) {
  const block = await encodeNotedrawDataBlock(bundle, options);
  return appendEncodedNotedrawDataBlock(markdown, block);
}

export function appendEncodedNotedrawDataBlock(markdown, block) {
  const body = stripNotedrawDataBlocks(markdown);
  return `${body}${body ? "\n\n" : ""}${block}\n`;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function joinPath(...parts) {
  return parts.map(normalizePath).filter(Boolean).join("/");
}

async function gzipBytes(bytes) {
  if (typeof CompressionStream !== "function") {
    return null;
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function gunzipBytes(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("gzip decoding is unavailable");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64(bytes) {
  const chunkSize = 32768;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
