"use client";

import { useEffect } from "react";
import { useNovaStore, sel } from "@/lib/store";
import type { AlertSourceContext } from "./types";
import { CONDITION_SOURCES } from "./sources";
import { onAlertEvent } from "./bus";

// ---------------------------------------------------------------------------
// useAlertMonitor
//
// The single bridge between live state and the alert slice. Mount it exactly
// once (see components/alerts/NotificationCenter). It:
//   1. re-evaluates every registered condition source whenever the state those
//      sources read changes, then reconciles the result into the store, and
//   2. forwards event-bus alerts (API errors, ...) into the store.
//
// The reconcile action is change-guarded, so evaluating on every telemetry
// tick does not churn alert subscribers.
// ---------------------------------------------------------------------------

export function useAlertMonitor(): void {
  const reconcile = useNovaStore((s) => s.reconcileConditionAlerts);
  const pushEvent = useNovaStore((s) => s.pushEventAlert);

  const flightData = useNovaStore(sel.flightData);
  const flightDataStatus = useNovaStore(sel.flightDataStatus);
  const engineDataStatus = useNovaStore(sel.engineDataStatus);
  const actuatorStatesStatus = useNovaStore(sel.actuatorStatesStatus);
  const lockoutStatus = useNovaStore(sel.lockoutStatus);
  const socketStatus = useNovaStore(sel.socketStatus);

  useEffect(() => {
    const ctx: AlertSourceContext = {
      flightData,
      flightDataStatus,
      engineDataStatus,
      actuatorStatesStatus,
      lockoutStatus,
      socketStatus,
      now: Date.now(),
    };
    const active = CONDITION_SOURCES.flatMap((source) => source.evaluate(ctx));
    reconcile(active);
  }, [
    flightData,
    flightDataStatus,
    engineDataStatus,
    actuatorStatesStatus,
    lockoutStatus,
    socketStatus,
    reconcile,
  ]);

  useEffect(() => onAlertEvent((alert) => pushEvent(alert)), [pushEvent]);
}
