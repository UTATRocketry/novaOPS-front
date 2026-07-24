import type { AlertSource, ConditionAlert } from "../types";

// ---------------------------------------------------------------------------
// Battery source
//
// The backend reports pack voltage (PMB vmon.vBatt) and, when known, cell
// count — but no true state-of-charge. We judge health per-cell (Li-ion), and
// only when the cell count is known; without it we cannot say what "low" means,
// so we stay silent rather than fabricate a threshold. Voltage still shows in
// the top-bar indicator regardless.
// ---------------------------------------------------------------------------

/** Per-cell volts at/below which we warn (Li-ion ~30% remaining). */
const PER_CELL_WARN = 3.5;
/** Per-cell volts at/below which we escalate to fault (near empty). */
const PER_CELL_CRITICAL = 3.3;

export const batterySource: AlertSource = {
  id: "battery",
  evaluate: ({ flightData }): ConditionAlert[] => {
    const pmbMap = flightData?.pmb;
    if (!pmbMap) return [];

    const alerts: ConditionAlert[] = [];

    for (const [key, pmb] of Object.entries(pmbMap)) {
      // Firmware battery protect (UVLO/OV) cut the converters — always a fault.
      if (pmb.vmon?.protect === true) {
        alerts.push({
          id: `battery:${key}:protect`,
          severity: "fault",
          source: "battery",
          title: `${key} battery protect`,
          detail: "Battery UVLO/OV protect engaged — converters cut.",
        });
      }

      const v = pmb.vmon?.vBatt;
      const cells = pmb.charger?.cells ?? pmb.chgCfg?.cells;
      // Charging packs sag/rise oddly under charge current; don't nag then.
      const charging = pmb.charger?.charging === true;
      if (v == null || !cells || charging) continue;

      const perCell = v / cells;
      if (perCell <= PER_CELL_CRITICAL) {
        alerts.push({
          id: `battery:${key}:low`,
          severity: "fault",
          source: "battery",
          title: `${key} battery critical`,
          detail: `${v.toFixed(2)} V (${perCell.toFixed(2)} V/cell across ${cells} cells).`,
        });
      } else if (perCell <= PER_CELL_WARN) {
        alerts.push({
          id: `battery:${key}:low`,
          severity: "warn",
          source: "battery",
          title: `${key} battery low`,
          detail: `${v.toFixed(2)} V (${perCell.toFixed(2)} V/cell across ${cells} cells).`,
        });
      }
    }

    return alerts;
  },
};
