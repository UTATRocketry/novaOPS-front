import type { AlertInput } from "./types";

// ---------------------------------------------------------------------------
// Event-alert bus
//
// A tiny, dependency-free pub/sub so non-React layers (e.g. the fetch wrapper)
// can raise *event* alerts without importing the store — which would create a
// client/server import tangle and couple the transport layer to React state.
//
// If nothing is listening (no alert system mounted, or SSR), `emit` is a no-op,
// so callers can raise alerts unconditionally.
// ---------------------------------------------------------------------------

type Listener = (alert: AlertInput) => void;

const listeners = new Set<Listener>();

/** Subscribe to event alerts. Returns an unsubscribe fn. */
export function onAlertEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Raise an event alert. Safe to call from anywhere; no-op if unheard. */
export function emitAlertEvent(alert: AlertInput): void {
  for (const listener of listeners) {
    try {
      listener(alert);
    } catch {
      // A misbehaving listener must not break the emitter's caller.
    }
  }
}
