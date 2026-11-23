import { describe, expect, it, vi } from "vitest";
import { createStreamingStore } from "./streaming-store";

function manualScheduler() {
  let pending: (() => void) | null = null;
  return {
    schedule: (callback: () => void) => {
      pending = callback;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
    flush: () => {
      const callback = pending;
      pending = null;
      callback?.();
    },
    hasPending: () => pending !== null,
  };
}

describe("createStreamingStore", () => {
  it("batches appended tokens into a single notification per frame", () => {
    const scheduler = manualScheduler();
    const store = createStreamingStore(scheduler.schedule, scheduler.cancel);
    const listener = vi.fn<() => void>();
    store.subscribe(listener);

    store.append("Hello");
    store.append(" world");

    expect(store.getSnapshot()).toBe("Hello world");
    expect(listener).not.toHaveBeenCalled();

    scheduler.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reset clears the buffer, cancels the pending frame and notifies", () => {
    const scheduler = manualScheduler();
    const store = createStreamingStore(scheduler.schedule, scheduler.cancel);
    const listener = vi.fn<() => void>();
    store.subscribe(listener);

    store.append("partial");
    store.reset();

    expect(scheduler.hasPending()).toBe(false);
    expect(store.getSnapshot()).toBe("");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify on reset when already empty", () => {
    const scheduler = manualScheduler();
    const store = createStreamingStore(scheduler.schedule, scheduler.cancel);
    const listener = vi.fn<() => void>();
    store.subscribe(listener);

    store.reset();

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying unsubscribed listeners", () => {
    const scheduler = manualScheduler();
    const store = createStreamingStore(scheduler.schedule, scheduler.cancel);
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.append("x");
    scheduler.flush();

    expect(listener).not.toHaveBeenCalled();
  });
});
