export function createAsyncCommitBarrier(onError = null) {
  let tail = Promise.resolve(true);

  const track = (task) => {
    const current = Promise.resolve(task).then(
      (value) => value !== false,
      (error) => {
        onError?.(error);
        return false;
      }
    );
    const combined = Promise.all([tail, current]).then((results) => results.every(Boolean));
    tail = combined;
    return combined;
  };

  const wait = async () => {
    let observed;
    do {
      observed = tail;
      await observed;
    } while (observed !== tail);
    return true;
  };

  return { track, wait };
}

export function hoistPlainTextMarker(marker, editor, shouldUnwrap) {
  if (!marker || !editor || typeof shouldUnwrap !== "function") {
    return marker;
  }
  while (marker.parentNode && marker.parentNode !== editor && shouldUnwrap(marker.parentNode)) {
    const wrapper = marker.parentNode;
    const parent = wrapper.parentNode;
    if (!parent) {
      break;
    }
    const before = wrapper.cloneNode(false);
    const after = wrapper.cloneNode(false);
    let child = wrapper.firstChild;
    while (child && child !== marker) {
      const next = child.nextSibling;
      before.appendChild(child);
      child = next;
    }
    wrapper.removeChild(marker);
    while (wrapper.firstChild) {
      after.appendChild(wrapper.firstChild);
    }
    if (before.childNodes.length) {
      parent.insertBefore(before, wrapper);
    }
    parent.insertBefore(marker, wrapper);
    if (after.childNodes.length) {
      parent.insertBefore(after, wrapper);
    }
    parent.removeChild(wrapper);
  }
  return marker;
}
