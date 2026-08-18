function connectorTouches(left, right) {
  const leftTargets = new Set([left.connector?.fromId, left.connector?.toId].filter(Boolean));
  const rightTargets = new Set([right.connector?.fromId, right.connector?.toId].filter(Boolean));
  return Boolean(
    right.elementId && leftTargets.has(right.elementId)
    || left.elementId && rightTargets.has(left.elementId)
    || Array.from(leftTargets).some((id) => rightTargets.has(id))
  );
}

export function expandRelatedSelection(candidates, initialKeys) {
  const candidateList = Array.from(candidates || []).filter((candidate) => candidate?.key);
  const candidateByKey = new Map(candidateList.map((candidate) => [candidate.key, candidate]));
  const relatedKeys = new Set(Array.from(initialKeys || []).filter((key) => candidateByKey.has(key)));
  const queue = Array.from(relatedKeys).map((key) => candidateByKey.get(key));

  while (queue.length) {
    const current = queue.shift();
    for (const candidate of candidateList) {
      if (relatedKeys.has(candidate.key)) {
        continue;
      }
      if (!connectorTouches(current, candidate)) {
        continue;
      }
      relatedKeys.add(candidate.key);
      queue.push(candidate);
    }
  }

  return relatedKeys;
}
