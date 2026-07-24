import type { AlertSource, ConditionAlert } from "../types";

// ---------------------------------------------------------------------------
// SD-card source
//
// Mirrors the health logic in the SD Logger card (components/flight/SdCard):
// full/stalled are faults, near-full / rate-reduced are warnings. Full means
// no new flight data is being logged — the headline alert of this source.
// ---------------------------------------------------------------------------

function isFull(stateName: string | undefined, full: boolean | undefined): boolean {
  return full === true || (stateName ?? "").toLowerCase() === "full";
}

export const sdCardSource: AlertSource = {
  id: "sd",
  evaluate: ({ flightData }): ConditionAlert[] => {
    const fmcMap = flightData?.fmc;
    if (!fmcMap) return [];

    const alerts: ConditionAlert[] = [];

    for (const [key, fmc] of Object.entries(fmcMap)) {
      const sd = fmc.sd;
      if (!sd) continue;

      if (isFull(sd.stateName, sd.full)) {
        alerts.push({
          id: `sd:${key}:full`,
          severity: "fault",
          source: "sd",
          title: `${key} SD card full`,
          detail: "No new flight data is being logged — clear the card.",
        });
      } else if (sd.nearFull) {
        alerts.push({
          id: `sd:${key}:nearfull`,
          severity: "warn",
          source: "sd",
          title: `${key} SD card nearly full`,
          detail: sd.pctUsed != null ? `${sd.pctUsed}% used.` : undefined,
        });
      }

      if (sd.stalled) {
        alerts.push({
          id: `sd:${key}:stalled`,
          severity: "fault",
          source: "sd",
          title: `${key} SD logging stalled`,
          detail: "Logger stopped writing — data may be lost.",
        });
      } else if (sd.rateReduced) {
        alerts.push({
          id: `sd:${key}:ratereduced`,
          severity: "warn",
          source: "sd",
          title: `${key} SD log rate reduced`,
          detail: "Logger throttled writes to keep up.",
        });
      }

      if (sd.err) {
        alerts.push({
          id: `sd:${key}:error`,
          severity: "error",
          source: "sd",
          title: `${key} SD card error`,
          detail: `Error code ${sd.err}.`,
        });
      }
    }

    return alerts;
  },
};
