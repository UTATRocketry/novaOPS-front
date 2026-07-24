import type { AlertSource, ConditionAlert, AlertSourceContext } from "../types";

// ---------------------------------------------------------------------------
// Stream-health source
//
// Surfaces link/telemetry problems that the top-bar connection dot alone does
// not make loud: a transport error, or a key telemetry stream that has gone
// stale (socket open but silent past its freshness window). Disconnected is a
// deliberate/whole-link state already shown by the connection dot, so it is not
// alerted here.
// ---------------------------------------------------------------------------

const STALE_STREAMS: {
  label: string;
  pick: (ctx: AlertSourceContext) => AlertSourceContext[keyof AlertSourceContext];
}[] = [
  { label: "Engine", pick: (c) => c.engineDataStatus },
  { label: "Flight", pick: (c) => c.flightDataStatus },
  { label: "Actuator", pick: (c) => c.actuatorStatesStatus },
];

export const streamHealthSource: AlertSource = {
  id: "stream",
  evaluate: (ctx): ConditionAlert[] => {
    const alerts: ConditionAlert[] = [];

    if (ctx.socketStatus === "error") {
      alerts.push({
        id: "stream:link:error",
        severity: "error",
        source: "stream",
        title: "Link error",
        detail: "The control-station link reported a transport error.",
      });
    }

    for (const s of STALE_STREAMS) {
      if (s.pick(ctx) === "stale") {
        const key = s.label.toLowerCase();
        alerts.push({
          id: `stream:${key}:stale`,
          severity: "warn",
          source: "stream",
          title: `${s.label} telemetry stale`,
          detail: "No fresh data within the expected window.",
        });
      }
    }

    return alerts;
  },
};
