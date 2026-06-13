/**
 * NovaPidLayout schema — the JSON format for saved P&ID layouts.
 *
 * What IS persisted: geometry, ports, link routing, binding refs (name strings),
 * display hints, system registry, schema version.
 *
 * What is NOT persisted: live values (readout text, badge state), resolved
 * colours, binding-missing decorations, selection state, viewport/zoom.
 *
 * On load a LoadReport is produced; missing bindings render with a warning
 * decoration but the layout still loads.
 */
import type { dia } from "@joint/core";
import type { SystemRegistry } from "./registry";

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export interface NovaPidLayout {
  schemaVersion: 1;
  meta: {
    name: string;
    savedAt: string; // ISO 8601
    app: "novaops";
  };
  /** Colour registry: systemId → label + colorToken. */
  systems: SystemRegistry;
  /** Pruned JointJS graph.toJSON() — geometry + binding attrs only. */
  graph: {
    cells: dia.Cell.JSON[];
  };
}

export interface LoadReport {
  missingBindings: { cellId: string; name: string; kind: "sensor" | "actuator" }[];
  unknownSystems:  { cellId: string; systemId: string }[];
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Produce a NovaPidLayout from the current graph state.
 * Live-value attrs (readoutValue/text, badgeText/text, body/opacity, etc.)
 * are stripped from the output.
 */
export function serializeLayout(
  graph: dia.Graph,
  systems: SystemRegistry,
  name = "Untitled",
): NovaPidLayout {
  const raw = graph.toJSON() as { cells: dia.Cell.JSON[] };

  // Strip runtime-only attrs from each cell before persisting.
  const cells = raw.cells.map((cell) => {
    const c = { ...cell } as dia.Cell.JSON & { attrs?: Record<string, Record<string, unknown>> };
    if (c.attrs?.["body"]) {
      const body = { ...c.attrs["body"] };
      delete body["opacity"];
      c.attrs = { ...c.attrs, body };
    }
    return c as dia.Cell.JSON;
  });

  return {
    schemaVersion: 1,
    meta: { name, savedAt: new Date().toISOString(), app: "novaops" },
    systems,
    graph: { cells },
  };
}

/**
 * Load a NovaPidLayout into a graph. Returns a report of any issues found.
 * Always succeeds (issues are warnings, not errors).
 *
 * sensorNames / actuatorNames are the current config name sets — used to
 * check for dangling binding references.
 */
export function deserializeLayout(
  layout: NovaPidLayout,
  graph: dia.Graph,
  sensorNames: ReadonlySet<string>,
  actuatorNames: ReadonlySet<string>,
): LoadReport {
  const report: LoadReport = { missingBindings: [], unknownSystems: [] };

  // Load graph cells. JointJS resolves each cell by `type` via cellNamespace.
  graph.fromJSON({ cells: layout.graph.cells });

  // Validate bindings and collect issues.
  graph.getCells().forEach((cell) => {
    const type = cell.get("type") as string;

    if (type === "nova.Instrument") {
      const binding = cell.get("binding") as { name: string } | undefined;
      if (binding?.name && !sensorNames.has(binding.name)) {
        report.missingBindings.push({ cellId: cell.id as string, name: binding.name, kind: "sensor" });
      }
    }

    if (type === "nova.Valve") {
      const binding = cell.get("binding") as { name: string } | null;
      if (binding?.name && !actuatorNames.has(binding.name)) {
        report.missingBindings.push({ cellId: cell.id as string, name: binding.name, kind: "actuator" });
      }
    }

    if (type === "nova.SystemLink") {
      const systemId = cell.get("systemId") as string | undefined;
      if (systemId && !(systemId in layout.systems)) {
        report.unknownSystems.push({ cellId: cell.id as string, systemId });
      }
    }
  });

  return report;
}

/**
 * Safely parse a JSON string into a NovaPidLayout.
 * Returns null if the JSON is invalid or not a valid layout.
 */
export function parseLayout(json: string): NovaPidLayout | null {
  try {
    const obj = JSON.parse(json) as unknown;
    return validateLayout(obj);
  } catch {
    return null;
  }
}

/**
 * Validate an already-parsed object as a NovaPidLayout.
 * Use this when the JSON has already been parsed (e.g. from a WS message).
 * Returns null if the object is not a valid layout.
 */
export function validateLayout(obj: unknown): NovaPidLayout | null {
  if (typeof obj !== "object" || obj === null) return null;
  const rec = obj as Record<string, unknown>;
  if (rec["app"] === "novaops" || (rec["meta"] as Record<string, unknown>)?.["app"] === "novaops") {
    return rec as unknown as NovaPidLayout;
  }
  return null;
}
