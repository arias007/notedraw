function recordId(record) {
  if (typeof record?.id === "string") {
    return record.id;
  }
  return typeof record?.elementId === "string" ? record.elementId : "";
}

function mergeRetainedRecords(latestRecords, incomingRecords) {
  const latest = Array.isArray(latestRecords) ? latestRecords : [];
  const incoming = Array.isArray(incomingRecords) ? incomingRecords : [];
  const incomingById = new Map(incoming.map((record) => [recordId(record), record]).filter(([id]) => id));
  const latestIds = new Set(latest.map(recordId).filter(Boolean));
  const merged = [];

  for (const record of latest) {
    const id = recordId(record);
    if (!id) {
      continue;
    }
    merged.push(incomingById.get(id) || record);
  }
  for (const record of incoming) {
    const id = recordId(record);
    if (!id || !latestIds.has(id)) {
      merged.push(record);
    }
  }
  return merged;
}

export function mergeControllerDrawingSnapshot(latest, incoming) {
  if (!latest || !incoming) {
    return incoming;
  }
  const strokes = mergeRetainedRecords(latest.strokes, incoming.strokes);
  const markdownBlocks = mergeRetainedRecords(latest.markdownBlocks, incoming.markdownBlocks);
  const referencedGroupIds = new Set([
    ...strokes,
    ...markdownBlocks
  ].map((record) => record?.groupId).filter(Boolean));
  const incomingGroupIds = new Set((Array.isArray(incoming.elementGroups) ? incoming.elementGroups : []).map(recordId).filter(Boolean));
  const elementGroups = mergeRetainedRecords(latest.elementGroups, incoming.elementGroups).filter((group) => {
    const id = recordId(group);
    return incomingGroupIds.has(id) || referencedGroupIds.has(id);
  });
  return {
    ...incoming,
    strokes,
    markdownBlocks,
    elementGroups
  };
}

export function coalesceDrawingSaveRequest(previous, next) {
  const priorEntries = Array.isArray(previous?.entries) ? previous.entries : [];
  const entry = {
    data: next?.data,
    excludeData: next?.excludeData || next?.data,
    replace: next?.replace === true
  };
  const entries = entry.replace ? [] : priorEntries.slice();
  const priorIndex = entries.findIndex((candidate) => candidate?.data === entry.data);
  if (priorIndex >= 0) {
    entry.replace = entry.replace || entries[priorIndex]?.replace === true;
    entries.splice(priorIndex, 1);
  }
  entries.push(entry);
  return {
    file: next?.file || previous?.file || null,
    generation: Math.max(0, Number(previous?.generation) || 0) + 1,
    entries
  };
}

export function materializeDrawingSaveRequest(latest, request, normalize) {
  let canonical = latest || null;
  for (const entry of Array.isArray(request?.entries) ? request.entries : []) {
    const incoming = normalize(entry?.data, request?.file);
    canonical = entry?.replace === true
      ? incoming
      : mergeControllerDrawingSnapshot(canonical, incoming);
  }
  return canonical;
}
