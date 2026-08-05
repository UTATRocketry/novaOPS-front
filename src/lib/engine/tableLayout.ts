/**
 * Persisted per-operator layout for the Engine sensor/actuator tables.
 *
 * A layout is a list of tables, each holding an ordered list of row *names*
 * (sensor/actuator tags), plus a flat set of hidden names. Names — not
 * indices — so a config change reorders nothing and drops only what actually
 * disappeared.
 *
 * The layout is a *view preference*: it never travels to the backend and it
 * never decides which channels exist. `reconcileLayout` is the guard that
 * keeps it subordinate to `config` — every name in the current config always
 * ends up in exactly one table, whether or not the stored layout mentions it.
 */

export interface LayoutTable {
  id: string;
  title: string;
  /** Ordered row names. May include names that are also in `hidden`. */
  names: string[];
}

export interface TableLayout {
  version: 1;
  tables: LayoutTable[];
  /** Row names hidden from display, across all tables. */
  hidden: string[];
}

export const LAYOUT_VERSION = 1;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

let idCounter = 0;

/** Table ids only need to be unique within a session + stable across saves. */
export function newTableId(): string {
  idCounter += 1;
  return `t${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** The out-of-the-box layout: one table holding every row, nothing hidden. */
export function defaultLayout(baseTitle: string, names: string[]): TableLayout {
  return {
    version: LAYOUT_VERSION,
    tables: [{ id: newTableId(), title: baseTitle, names: [...names] }],
    hidden: [],
  };
}

/** Title for the nth added table: "Actuators", "Actuators 2", "Actuators 3"… */
export function nextTableTitle(baseTitle: string, existing: LayoutTable[]): string {
  return existing.length === 0 ? baseTitle : `${baseTitle} ${existing.length + 1}`;
}

// ---------------------------------------------------------------------------
// Reconciliation against the live config
// ---------------------------------------------------------------------------

/**
 * Fold the current config's row names into a stored layout.
 *
 * - names no longer in config are dropped (from tables *and* from `hidden`,
 *   so a removed channel can't silently inflate the hidden count);
 * - names present in config but missing from every table are appended to the
 *   first table — a newly added channel is always visible somewhere;
 * - duplicates are collapsed, keeping the first occurrence.
 *
 * Always returns at least one table.
 */
export function reconcileLayout(
  layout: TableLayout | null,
  names: string[],
  baseTitle: string,
): TableLayout {
  if (!layout || layout.tables.length === 0) return defaultLayout(baseTitle, names);

  const known = new Set(names);
  const seen = new Set<string>();

  const tables = layout.tables.map((t) => ({
    id: t.id,
    title: t.title,
    names: t.names.filter((n) => {
      if (!known.has(n) || seen.has(n)) return false;
      seen.add(n);
      return true;
    }),
  }));

  const missing = names.filter((n) => !seen.has(n));
  if (missing.length > 0) tables[0].names.push(...missing);

  return {
    version: LAYOUT_VERSION,
    tables,
    hidden: layout.hidden.filter((n) => known.has(n)),
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Parse a stored layout, returning null on anything unrecognised. */
function parseLayout(raw: string): TableLayout | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== "object" || obj === null) return null;
    const cand = obj as Partial<TableLayout>;
    // A version bump means "shape changed" — fall back to defaults rather than
    // guessing at a migration.
    if (cand.version !== LAYOUT_VERSION) return null;
    if (!Array.isArray(cand.tables) || cand.tables.length === 0) return null;

    const tables: LayoutTable[] = [];
    for (const t of cand.tables) {
      if (typeof t?.id !== "string" || typeof t?.title !== "string") return null;
      if (!Array.isArray(t.names)) return null;
      tables.push({
        id: t.id,
        title: t.title,
        names: t.names.filter((n): n is string => typeof n === "string"),
      });
    }

    const hidden = Array.isArray(cand.hidden)
      ? cand.hidden.filter((n): n is string => typeof n === "string")
      : [];

    return { version: LAYOUT_VERSION, tables, hidden };
  } catch {
    return null;
  }
}

export function loadLayout(storageKey: string): TableLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? parseLayout(raw) : null;
  } catch {
    return null;
  }
}

export function saveLayout(storageKey: string, layout: TableLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // storage unavailable / quota — layout stays session-only
  }
}

export function clearLayout(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // storage unavailable
  }
}
