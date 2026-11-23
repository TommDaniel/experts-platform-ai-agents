type Listener = () => void;

export interface StreamingStore {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => string;
  append: (delta: string) => void;
  reset: () => void;
}

type FrameScheduler = (callback: () => void) => number;
type FrameCanceller = (handle: number) => void;

function scheduleFrame(callback: () => void): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
}

/**
 * Holds the in-flight assistant response outside React state so a token does
 * not re-render the whole conversation. Subscribers are notified at most once
 * per animation frame; the snapshot always exposes the latest buffered text.
 */
export function createStreamingStore(
  schedule: FrameScheduler = scheduleFrame,
  cancel: FrameCanceller = cancelFrame,
): StreamingStore {
  let content = "";
  let frame: number | null = null;
  const listeners = new Set<Listener>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const flush = (): void => {
    frame = null;
    notify();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return content;
    },
    append(delta) {
      if (!delta) return;
      content += delta;
      if (frame === null) frame = schedule(flush);
    },
    reset() {
      if (frame !== null) {
        cancel(frame);
        frame = null;
      }
      if (content === "") return;
      content = "";
      notify();
    },
  };
}
