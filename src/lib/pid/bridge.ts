/**
 * PidBridge — live data bridge between the Zustand store and the JointJS graph.
 *
 * Responsibilities in live mode:
 *  - Subscribe to engineData + actuatorStates store slices.
 *  - Push values imperatively into bound shape cells (never via React).
 *  - Dim shapes when their stream is stale; force —/UNKNOWN on error/disconnected.
 *  - Handle valve-click → gated command dispatch (optimistic + server reconcile).
 *
 * In edit mode the subscription is detached, all bound cells reset to their
 * no-data face, and the paper becomes fully interactive. The bridge exposes
 * imperative methods for the PidEditor toolbar (delete, rotate, undo/redo,
 * zoom, serialize). Pipe creation supports both JointJS port-based drag-to-connect
 * and a click-to-route pipe mode (§3).
 *
 * MODE INIT FIX: `mode` is initialised to "live" to match paper's initial
 * `interactive: false`. A `modeInitialized` flag ensures the first setMode()
 * call always runs full setup.
 */
import { dia, linkTools, elementTools } from "@joint/core";
import type {
  ActuatorEntry,
  ActuatorState,
  CommandPayload,
  ParsedSensorValue,
  SafetyRules,
  SensorEntry,
} from "../types";
import type { EngineDataMap, LiveSlice } from "../store/types";
import type { ActuatorStateMap } from "../types";
import { useNovaStore } from "../store/store";
import { sel } from "../store/selectors";
import { systemColour } from "./registry";
import type { SystemRegistry } from "./registry";
import {
  NovaInstrument,
  NovaValve,
  NovaVessel,
  NovaBottle,
  NovaChamber,
  NovaDevice,
  NovaSystemLink,
  NovaActuatorControl,
  NovaZone,
  type BadgeState,
  type ButtonFace,
} from "./shapes";
import { serializeLayout } from "./serializer";
import type { NovaPidLayout } from "./serializer";
import {
  deriveControls,
  activeOption,
  nextOption,
  computeButtons,
  buttonIndexAtX,
  controlButtonFaces,
} from "./actuatorControls";
import type { ControlButton } from "./actuatorControls";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PidMode = "live" | "edit";

export type SendCommandFn = (payload: CommandPayload) => void;

export interface PidBridgeOptions {
  graph: dia.Graph;
  paper: dia.Paper;
  sendCommand: SendCommandFn;
  onCellSelect?: (cellId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Colour constants — hardcoded dark-theme hex.
// CSS vars don't reliably resolve inside SVG attrs when Chakra scopes them
// to [data-theme="dark"] on the body rather than :root.
// ---------------------------------------------------------------------------

const CSS = {
  border:   "#26303f",
  textPrim: "#e5e9f0",
  warn:     "#f59e0b",
  accent:   "#4d8bff",
  surface:  "#151c29",
  raised:   "#1b2433",
  textMuted: "#94a0b3",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100)  return v.toFixed(1);
  return v.toFixed(2);
}

function resolveActuatorBadge(state: ActuatorState | null): { badge: BadgeState; label: string } {
  if (!state) return { badge: "unknown", label: "UNKNOWN" };

  const raw = state.position ?? state.state ?? null;
  if (!raw) return { badge: "unknown", label: "UNKNOWN" };

  const lower = raw.toLowerCase();
  if (lower === "open")   return { badge: "open",   label: "OPEN" };
  if (lower === "closed") return { badge: "closed", label: "CLOSED" };

  return { badge: "custom", label: raw.toUpperCase() };
}

/**
 * Mirror of useCommandGate's rule matcher (kept in sync). Tests whether a
 * command (name + optional state) appears in a safetyRules array.
 */
function matchesRules(
  rules: SafetyRules["hazardous"] | SafetyRules["critical"],
  name: string,
  state: string | undefined,
): boolean {
  if (!rules || rules.length === 0) return false;
  const nameLower = name.toLowerCase();
  for (const rule of rules) {
    const matchKey = Object.keys(rule).find((k) => k.toLowerCase() === nameLower);
    if (!matchKey) continue;
    const val = rule[matchKey];
    const isAll = val === "ALL" || (Array.isArray(val) && val.includes("ALL"));
    if (isAll) return true;
    if (state === undefined) return true;
    const stateLower = state.toLowerCase();
    if (Array.isArray(val)) {
      if (val.some((v) => v.toLowerCase() === stateLower)) return true;
    } else if (val.toLowerCase() === stateLower) {
      return true;
    }
  }
  return false;
}

/**
 * Bottom-right drag handle that resizes a NovaZone. Built on elementTools.Control
 * (its getPosition/setPosition map the handle to the element's size).
 */
const ZoneResizeTool = elementTools.Control.extend({
  getPosition(view: dia.ElementView) {
    const { width, height } = view.model.size();
    return { x: width, y: height };
  },
  setPosition(view: dia.ElementView, coordinates: { x: number; y: number }) {
    view.model.resize(
      Math.max(60, Math.round(coordinates.x)),
      Math.max(40, Math.round(coordinates.y)),
    );
  },
});

// ---------------------------------------------------------------------------
// PidBridge
// ---------------------------------------------------------------------------

export class PidBridge {
  private readonly graph: dia.Graph;
  private readonly paper: dia.Paper;
  private readonly sendCommandFn: SendCommandFn;

  private mode: PidMode = "live";
  private modeInitialized = false;

  private sensorIndex            = new Map<string, string[]>();
  private actuatorIndex          = new Map<string, string[]>(); // name → NovaValve cell IDs
  private deviceIndex            = new Map<string, string[]>(); // name → NovaDevice cell IDs
  private actuatorControlIndex   = new Map<string, string[]>(); // name → NovaActuatorControl cell IDs
  private missingBindings        = new Set<string>();

  private currentSystems: SystemRegistry = {};
  private sensorConfig   = new Map<string, SensorEntry>();
  private actuatorConfig = new Map<string, ActuatorEntry>();
  private safetyRules: SafetyRules | undefined;

  private unsubscribe: (() => void) | null = null;

  // ---- Edit mode state ---------------------------------------------------

  private selectedCellIds = new Set<string>();
  private activePipeSystem = "misc";
  /** Palette colour token applied to newly-drawn pipes (§ central palette). */
  private activePipeColor = "info";
  private readonly onCellSelectFn?: (cellId: string | null) => void;

  // Drop-position cycling so sequentially-added shapes don't all overlap.
  private dropOffsetIdx = 0;

  // Undo / redo — linear history of serialized graph states with a cursor.
  private history: string[] = [];
  private historyIndex = -1;
  private suppressSnapshots = false;
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;

  // Clipboard (copy/paste) — serialized cells, not live references.
  private clipboard: dia.Cell.JSON[] = [];

  // Zoom
  private currentScale = 1;

  // Lasso selection
  private lassoStart: { x: number; y: number } | null = null;
  private lassoEl: SVGRectElement | null = null;

  // Rotation angle badge
  private rotationBadgeEl: SVGTextElement | null = null;

  // Pipe mode state (§3)
  private pipeMode = false;
  private inProgressLink: NovaSystemLink | null = null;
  /** Points clicked after the source anchor, in order. Last = current target. */
  private pipePoints: { x: number; y: number }[] = [];

  // Group-drag state: when dragging one member of a multi-selection, all move.
  private groupDrag: {
    anchorId: string;
    anchorStart: { x: number; y: number };
    startPositions: Map<string, { x: number; y: number }>;
  } | null = null;

  // Escape key handler (stored so it can be removed)
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  // Bound handler refs (so we can pass to graph.off with the same reference)
  private readonly onGraphChange: () => void;

  constructor({ graph, paper, sendCommand, onCellSelect }: PidBridgeOptions) {
    this.graph = graph;
    this.paper = paper;
    this.sendCommandFn = sendCommand;
    this.onCellSelectFn = onCellSelect;

    this.onGraphChange = () => {
      if (this.mode === "edit" && !this.suppressSnapshots) this.scheduleSnapshot();
    };

    this.paper.on("cell:pointerclick", (cellView: dia.CellView, evt: dia.Event, x: number, y: number) => {
      if (this.mode === "edit" && this.pipeMode && !cellView.model.isLink()) {
        // In pipe mode, clicking an element anchors/finishes the pipe.
        this.handlePipeElementClick(cellView, x, y);
        return;
      }
      if (this.mode === "live") {
        const cell = cellView.model;
        if (cell instanceof NovaValve && cell.isControllable()) {
          this.handleValveClick(cellView);
        } else if (cell instanceof NovaDevice && cell.isControllable()) {
          this.handleDeviceClick(cellView);
        } else if (cell instanceof NovaActuatorControl) {
          this.handleControlClick(cellView, x);
        }
      } else {
        const additive = !!(evt as unknown as MouseEvent)?.ctrlKey || !!(evt as unknown as MouseEvent)?.metaKey;
        this.handleEditClick(cellView, additive);
      }
    });

    this.paper.on("blank:pointerclick", (_evt: dia.Event, x: number, y: number) => {
      if (this.mode !== "edit") return;
      if (this.pipeMode) {
        this.handlePipeClick(x, y);
      } else {
        this.clearSelection();
      }
    });

    // When a new cell is added in edit mode:
    // - Links get the active system colour applied immediately.
    // - Elements get auto-selected.
    this.graph.on("add", (cell: dia.Cell) => {
      if (this.mode === "edit") {
        if (cell.isLink()) {
          const link = cell as NovaSystemLink;
          // Freshly drawn pipe (no colour yet) → apply the active palette colour.
          if (!link.get("colorToken") && !link.get("systemId")) {
            link.set("colorToken", this.activePipeColor);
            link.applyColour();
          }
        } else {
          // Zones are backdrops — keep them behind everything else.
          if (cell.get("type") === "nova.Zone") (cell as dia.Element).toBack();
          setTimeout(() => this.selectCell(cell.id as string), 0);
        }
      }
    });

    // Auto-snapshot on any graph mutation in edit mode (debounced)
    this.graph.on("add remove change", this.onGraphChange, this);

    // Resizing a path-symbol shape rescales its symbol to the new size.
    this.graph.on("change:size", (cell: dia.Cell) => {
      const t = cell.get("type");
      if (t === "nova.Chamber") (cell as NovaChamber).applyScale();
      else if (t === "nova.Bottle") (cell as NovaBottle).applyScale();
    });

    // Lasso selection (blank area drag) — only when pipeMode is OFF
    this.paper.on("blank:pointerdown", (_evt: dia.Event, x: number, y: number) => {
      if (this.mode === "edit" && !this.pipeMode) this.startLasso(x, y);
    });
    this.paper.on("blank:pointermove", (_evt: dia.Event, x: number, y: number) => {
      if (this.lassoStart) this.updateLasso(x, y);
    });
    this.paper.on("blank:pointerup", (_evt: dia.Event, x: number, y: number) => {
      if (this.lassoStart) this.finishLasso(x, y);
    });

    // Double-click on blank to finish an in-progress pipe
    this.paper.on("blank:pointerdblclick", () => {
      if (this.pipeMode && this.inProgressLink) this.finishPipe();
    });

    // (Element hover tool overlay intentionally removed — delete via toolbar /
    //  Delete key on the selected element instead.)

    // Link hover → vertex/segment editing tools only (no delete overlay —
    // delete a pipe by selecting it and pressing Delete / the toolbar button).
    this.paper.on("link:mouseenter", (linkView: dia.LinkView) => {
      if (this.mode !== "edit" || this.pipeMode) return;
      const toolsView = new dia.ToolsView({
        tools: [new linkTools.Vertices(), new linkTools.Segments()],
      });
      linkView.addTools(toolsView);
    });

    this.paper.on("link:mouseleave", (linkView: dia.LinkView) => {
      linkView.removeTools();
    });

    // ── Group drag: move every selected element together ─────────────────────
    this.paper.on("element:pointerdown", (elementView: dia.ElementView) => {
      if (this.mode !== "edit" || this.pipeMode) return;
      const id = elementView.model.id as string;
      // Only start a group drag when grabbing a member of a multi-selection.
      if (this.selectedCellIds.size <= 1 || !this.selectedCellIds.has(id)) {
        this.groupDrag = null;
        return;
      }
      const startPositions = new Map<string, { x: number; y: number }>();
      this.selectedCellIds.forEach((sid) => {
        const c = this.graph.getCell(sid);
        if (c && !c.isLink()) startPositions.set(sid, { ...(c as dia.Element).position() });
      });
      this.groupDrag = {
        anchorId: id,
        anchorStart: { ...(elementView.model as dia.Element).position() },
        startPositions,
      };
    });

    this.paper.on("element:pointermove", (elementView: dia.ElementView) => {
      if (!this.groupDrag) return;
      if ((elementView.model.id as string) !== this.groupDrag.anchorId) return;
      // JointJS already moved the anchor; mirror its delta onto the others.
      const now = (elementView.model as dia.Element).position();
      const dx = now.x - this.groupDrag.anchorStart.x;
      const dy = now.y - this.groupDrag.anchorStart.y;
      this.groupDrag.startPositions.forEach((start, sid) => {
        if (sid === this.groupDrag!.anchorId) return;
        const c = this.graph.getCell(sid) as dia.Element | null;
        c?.position(start.x + dx, start.y + dy);
      });
    });

    this.paper.on("element:pointerup", () => {
      this.groupDrag = null;
    });

    // Escape key — cancel in-progress pipe
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.pipeMode && this.inProgressLink) {
        this.cancelPipe();
      }
    };
    document.addEventListener("keydown", this.onKeyDown);
  }

  // ---- Public API ----------------------------------------------------------

  indexLayout(
    sensors: SensorEntry[],
    actuators: ActuatorEntry[],
    systems: SystemRegistry,
    missingBindingIds: Set<string>,
  ): void {
    this.sensorIndex.clear();
    this.actuatorIndex.clear();
    this.deviceIndex.clear();
    this.actuatorControlIndex.clear();
    this.sensorConfig.clear();
    this.actuatorConfig.clear();
    this.currentSystems = systems;
    this.missingBindings = missingBindingIds;

    this.selectedCellIds.clear();
    this.hideRotationBadge();
    this.dropOffsetIdx = 0;
    this.onCellSelectFn?.(null);

    sensors.forEach((s) => this.sensorConfig.set(s.name, s));
    actuators.forEach((a) => this.actuatorConfig.set(a.name, a));

    this.graph.getCells().forEach((cell) => {
      const type = cell.get("type") as string;
      const id   = cell.id as string;

      if (type === "nova.Instrument") {
        const name = (cell.get("binding") as { name: string } | undefined)?.name;
        if (name) {
          const list = this.sensorIndex.get(name) ?? [];
          list.push(id);
          this.sensorIndex.set(name, list);
        }
        (cell as NovaInstrument).applyLabels();
        if (missingBindingIds.has(id)) (cell as NovaInstrument).setMissing(true);
      }

      if (type === "nova.Valve") {
        const binding = cell.get("binding") as { name: string } | null;
        if (binding?.name) {
          const list = this.actuatorIndex.get(binding.name) ?? [];
          list.push(id);
          this.actuatorIndex.set(binding.name, list);
        }
        (cell as NovaValve).applyLabels();
        if (missingBindingIds.has(id)) (cell as NovaValve).setMissing(true);
      }

      if (type === "nova.Vessel")  (cell as NovaVessel).applyLabels();
      if (type === "nova.Bottle")  (cell as NovaBottle).applyLabels();
      if (type === "nova.Chamber") (cell as NovaChamber).applyLabels();
      if (type === "nova.Zone")   { (cell as NovaZone).applyLabels(); (cell as NovaZone).toBack(); }

      if (type === "nova.Device") {
        const dev = cell as NovaDevice;
        const name = dev.bindingName();
        if (name) {
          const list = this.deviceIndex.get(name) ?? [];
          list.push(id);
          this.deviceIndex.set(name, list);
        }
        dev.applyLabels();
        if (missingBindingIds.has(id)) dev.setMissing(true);
      }

      if (type === "nova.SystemLink") {
        const link = cell as NovaSystemLink;
        // Direct colorToken wins; else fall back to the systemId-derived colour.
        if (!link.applyColour()) {
          const sysId = cell.get("systemId") as string | undefined;
          if (sysId) link.setSystemColour(systemColour(this.currentSystems, sysId));
        }
      }

      if (type === "nova.ActuatorControl") {
        const ctrl = cell as NovaActuatorControl;
        const name = ctrl.bindingName();
        ctrl.setName(name);
        const entry = name ? this.actuatorConfig.get(name) : undefined;
        if (entry) {
          ctrl.applyButtons(controlButtonFaces(entry, null));
        } else {
          ctrl.clearButtons();
        }
        if (name) {
          const list = this.actuatorControlIndex.get(name) ?? [];
          list.push(id);
          this.actuatorControlIndex.set(name, list);
        }
        if (missingBindingIds.has(id)) ctrl.setMissing(true);
      }
    });
  }

  /**
   * Switch between live and edit modes.
   * The guard only skips if the mode is the same AND first-time setup already ran.
   */
  setMode(mode: PidMode): void {
    if (this.modeInitialized && this.mode === mode) return;
    this.modeInitialized = true;
    this.mode = mode;

    if (mode === "edit") {
      this.detachSubscription();
      this.resetToNoData();
      this.paper.setInteractivity(true);
      // Seed undo history with the loaded layout as the baseline.
      this.resetHistory();
    } else {
      this.paper.setInteractivity(false);
      this.detachSubscription();
      this.attachSubscription();
    }
  }

  destroy(): void {
    this.detachSubscription();
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.lassoEl?.remove();
    this.hideRotationBadge();
    this.graph.off("add remove change", this.onGraphChange, this);
    this.paper.off("cell:pointerclick");
    this.paper.off("blank:pointerclick");
    this.paper.off("blank:pointerdown");
    this.paper.off("blank:pointermove");
    this.paper.off("blank:pointerup");
    this.paper.off("blank:pointerdblclick");
    this.paper.off("link:mouseenter");
    this.paper.off("link:mouseleave");
    this.paper.off("element:pointerdown");
    this.paper.off("element:pointermove");
    this.paper.off("element:pointerup");
    this.graph.off("add");
    // Clean up pipe mode
    this.cancelPipe();
    this.pipeMode = false;
    document.removeEventListener("keydown", this.onKeyDown);
  }

  // ---- Edit mode public methods -------------------------------------------

  getSelectedCellId(): string | null {
    const [first] = this.selectedCellIds;
    return first ?? null;
  }

  getSelectedCellIds(): string[] {
    return [...this.selectedCellIds];
  }

  getSystems(): SystemRegistry {
    return this.currentSystems;
  }

  deleteSelected(): void {
    if (this.selectedCellIds.size === 0) return;
    const ids = [...this.selectedCellIds];
    this.selectedCellIds.clear();
    this.hideRotationBadge();
    this.onCellSelectFn?.(null);
    ids.forEach((id) => this.graph.getCell(id)?.remove());
  }

  rotateSelected(angle = 90): void {
    this.selectedCellIds.forEach((id) => {
      const cell = this.graph.getCell(id);
      if (cell && !cell.isLink()) {
        const el = cell as dia.Element;
        // Absolute rotation: read current angle and add — robust across JointJS versions.
        const current = el.angle();
        el.rotate((current + angle) % 360, true);
      }
    });
    this.updateRotationBadge();
  }

  /**
   * Enable/disable click-to-route pipe mode (§3).
   * When active, blank clicks start/continue a pipe; element clicks start
   * or finish a pipe. setActivePipeSystem still controls which system colour
   * new links receive.
   */
  setPipeMode(active: boolean, systemId?: string): void {
    if (systemId) this.activePipeSystem = systemId;
    // Pipe routing is handled by the always-registered blank/cell pointer
    // handlers, gated on this.pipeMode — no extra listeners to add/remove.
    if (this.pipeMode === active) return;
    this.pipeMode = active;
    this.paper.el.style.cursor = active ? "crosshair" : "";
    if (!active) this.cancelPipe();
  }

  setActivePipeSystem(systemId: string): void {
    this.activePipeSystem = systemId;
  }

  /** Palette colour applied to the next pipe drawn. */
  setActivePipeColor(token: string): void {
    this.activePipeColor = token;
  }

  /** Supply safetyRules so the live command gate can classify hazardous/critical. */
  setSafetyRules(rules: SafetyRules | undefined): void {
    this.safetyRules = rules;
  }

  serializeCurrent(name = "Untitled"): NovaPidLayout {
    return serializeLayout(this.graph, this.currentSystems, name);
  }

  addCellAt(cell: dia.Cell, x?: number, y?: number): void {
    if (!cell.isLink()) {
      const size    = (cell as dia.Element).size();
      const paperW  = (this.paper.el as HTMLElement).offsetWidth  || 800;
      const paperH  = (this.paper.el as HTMLElement).offsetHeight || 600;

      const baseX   = Math.max(20, (paperW - size.width)  / 2);
      const baseY   = Math.max(20, (paperH - size.height) / 2);
      const offset  = (this.dropOffsetIdx % 6) * 40;
      this.dropOffsetIdx++;

      (cell as dia.Element).position(
        x ?? Math.min(baseX + offset, paperW - size.width  - 20),
        y ?? Math.min(baseY + offset, paperH - size.height - 20),
      );
    }
    this.graph.addCell(cell);
  }

  // ---- Undo / redo ---------------------------------------------------------

  /** Capture the current graph as a new history entry (truncating any redo future). */
  pushSnapshot(): void {
    const json = JSON.stringify(this.graph.toJSON());
    if (this.history[this.historyIndex] === json) return; // no actual change
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(json);
    if (this.history.length > 60) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  /** Seed history with the current state as the baseline (call once after load). */
  resetHistory(): void {
    this.history = [JSON.stringify(this.graph.toJSON())];
    this.historyIndex = 0;
  }

  undo(): void {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.restoreHistory();
  }

  redo(): void {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.restoreHistory();
  }

  private restoreHistory(): void {
    const json = this.history[this.historyIndex];
    if (!json) return;
    if (this.snapshotTimer) { clearTimeout(this.snapshotTimer); this.snapshotTimer = null; }
    this.suppressSnapshots = true;
    this.clearSelection();
    this.graph.fromJSON(JSON.parse(json));
    this.reindexAfterMutation();
    this.suppressSnapshots = false;
  }

  private reindexAfterMutation(): void {
    this.indexLayout(
      [...this.sensorConfig.values()],
      [...this.actuatorConfig.values()],
      this.currentSystems,
      this.missingBindings,
    );
  }

  canUndo(): boolean { return this.historyIndex > 0; }
  canRedo(): boolean { return this.historyIndex < this.history.length - 1; }

  // ---- Copy / paste --------------------------------------------------------

  copySelected(): void {
    const cells = [...this.selectedCellIds]
      .map((id) => this.graph.getCell(id))
      .filter((c): c is dia.Cell => !!c && !c.isLink());
    this.clipboard = cells.map((c) => c.toJSON() as dia.Cell.JSON);
  }

  paste(): void {
    if (this.clipboard.length === 0) return;
    const newIds: string[] = [];
    this.clipboard.forEach((json) => {
      const clone = { ...json } as dia.Cell.JSON & {
        id?: string;
        position?: { x: number; y: number };
        controlId?: string | null;
      };
      const newId = `${clone.type?.replace(/\W/g, "")}-${Date.now()}-${Math.round(Math.random() * 1e4)}`;
      clone.id = newId;
      if (clone.position) clone.position = { x: clone.position.x + 24, y: clone.position.y + 24 };
      clone.controlId = null; // a pasted valve gets no linked control by default
      const cell = this.graph.addCell(clone as dia.Cell.JSON);
      void cell;
      newIds.push(newId);
    });
    this.reindexAfterMutation();
    this.setSelection(newIds);
    this.pushSnapshot();
  }

  // ---- Zoom / pan ----------------------------------------------------------

  zoomTo(scale: number): void {
    this.currentScale = Math.max(0.15, Math.min(4, scale));
    this.paper.scale(this.currentScale, this.currentScale);
    this.updateRotationBadge();
  }

  zoomIn():    void { this.zoomTo(this.currentScale * 1.25); }
  zoomOut():   void { this.zoomTo(this.currentScale / 1.25); }
  resetZoom(): void { this.zoomTo(1); this.paper.translate(0, 0); }

  fitContent(): void {
    (this.paper as dia.Paper & { scaleContentToFit?: (opts?: unknown) => void })
      .scaleContentToFit?.({ padding: 40, maxScaleFactor: 1.5 });
    this.currentScale = (this.paper.scale() as { sx: number }).sx;
  }

  getScale(): number { return this.currentScale; }

  // ---- Subscription --------------------------------------------------------

  private attachSubscription(): void {
    const state = useNovaStore.getState();
    this.applyEngineSlice(state.engineData);
    this.applyActuatorSlice(state.actuatorStates);

    this.unsubscribe = useNovaStore.subscribe((next, prev) => {
      if (next.engineData !== prev.engineData) {
        this.applyEngineSlice(next.engineData);
      }
      if (next.actuatorStates !== prev.actuatorStates) {
        this.applyActuatorSlice(next.actuatorStates);
      }
    });
  }

  private detachSubscription(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ---- Data application ----------------------------------------------------

  private applyEngineSlice(slice: LiveSlice<EngineDataMap>): void {
    const dead  = slice.status === "error" || slice.status === "disconnected";
    const stale = slice.status === "stale";

    this.sensorIndex.forEach((ids, name) => {
      const value: ParsedSensorValue | undefined = slice.data?.[name];

      ids.forEach((id) => {
        const cell = this.graph.getCell(id) as NovaInstrument | null;
        if (!cell) return;
        if (dead || !value) {
          cell.clearReadout();
        } else {
          cell.setReadout(formatValue(value.value), value.unit);
        }
        cell.setStale(stale);
      });
    });
  }

  private applyActuatorSlice(slice: LiveSlice<ActuatorStateMap>): void {
    const dead  = slice.status === "error" || slice.status === "disconnected";
    const stale = slice.status === "stale";

    this.actuatorIndex.forEach((ids, name) => {
      const state: ActuatorState | undefined = slice.data?.[name];

      ids.forEach((id) => {
        const cell = this.graph.getCell(id) as NovaValve | null;
        if (!cell) return;
        if (dead || !state) {
          cell.clearBadge();
        } else {
          const { badge, label } = resolveActuatorBadge(state);
          cell.setBadge(badge, label);
        }
        cell.setStale(stale);
      });
    });

    this.deviceIndex.forEach((ids, name) => {
      const state: ActuatorState | undefined = slice.data?.[name];
      ids.forEach((id) => {
        const dev = this.graph.getCell(id) as NovaDevice | null;
        if (!dev) return;
        if (dead || !state) {
          dev.clearBadge();
        } else {
          const { badge, label } = resolveActuatorBadge(state);
          dev.setBadge(badge, label);
        }
        dev.setStale(stale);
      });
    });

    this.actuatorControlIndex.forEach((ids, name) => {
      const entry = this.actuatorConfig.get(name);
      const state: ActuatorState | undefined = slice.data?.[name];
      ids.forEach((id) => {
        const ctrl = this.graph.getCell(id) as NovaActuatorControl | null;
        if (!ctrl || !entry) return;
        ctrl.setStale(stale);
        ctrl.applyButtons(controlButtonFaces(entry, dead ? null : (state ?? null)));
      });
    });
  }

  private resetToNoData(): void {
    this.sensorIndex.forEach((ids) => {
      ids.forEach((id) => {
        const cell = this.graph.getCell(id) as NovaInstrument | null;
        cell?.clearReadout();
        cell?.setStale(false);
      });
    });
    this.actuatorIndex.forEach((ids) => {
      ids.forEach((id) => {
        const cell = this.graph.getCell(id) as NovaValve | null;
        cell?.clearBadge();
        cell?.setStale(false);
      });
    });
    this.deviceIndex.forEach((ids) => {
      ids.forEach((id) => {
        const dev = this.graph.getCell(id) as NovaDevice | null;
        dev?.clearBadge();
        dev?.setStale(false);
      });
    });
    this.actuatorControlIndex.forEach((ids, name) => {
      const entry = this.actuatorConfig.get(name);
      ids.forEach((id) => {
        const ctrl = this.graph.getCell(id) as NovaActuatorControl | null;
        if (!ctrl) return;
        if (entry) ctrl.applyButtons(controlButtonFaces(entry, null));
        else ctrl.clearButtons();
        ctrl.setStale(false);
      });
    });
  }

  // ---- Selection -----------------------------------------------------------

  private selectCell(cellId: string | null): void {
    this.selectedCellIds.forEach((id) => {
      const prev = this.graph.getCell(id);
      if (prev) this.applySelectionStyle(prev, false);
    });
    this.selectedCellIds.clear();
    this.hideRotationBadge();

    if (cellId) {
      this.selectedCellIds.add(cellId);
      const cell = this.graph.getCell(cellId);
      if (cell) {
        this.applySelectionStyle(cell, true);
        if (!cell.isLink()) this.showRotationBadge(cell as dia.Element);
      }
    }

    this.onCellSelectFn?.(cellId);
  }

  private setSelection(cellIds: string[]): void {
    this.selectedCellIds.forEach((id) => {
      const prev = this.graph.getCell(id);
      if (prev) this.applySelectionStyle(prev, false);
    });
    this.selectedCellIds.clear();
    this.hideRotationBadge();

    cellIds.forEach((id) => {
      const cell = this.graph.getCell(id);
      if (cell) {
        this.selectedCellIds.add(id);
        this.applySelectionStyle(cell, true);
      }
    });

    if (cellIds.length === 1) {
      const cell = this.graph.getCell(cellIds[0]);
      if (cell && !cell.isLink()) this.showRotationBadge(cell as dia.Element);
    }

    this.onCellSelectFn?.(cellIds[0] ?? null);
  }

  private clearSelection(): void {
    this.selectCell(null);
  }

  // ---- Edit mode click handling -------------------------------------------

  private handleEditClick(cellView: dia.CellView, additive = false): void {
    const cell = cellView.model;
    if (additive) {
      this.toggleInSelection(cell.id as string);
    } else {
      this.selectCell(cell.id as string);
    }
  }

  /** Ctrl/Cmd-click: add or remove a single cell from the current selection. */
  private toggleInSelection(cellId: string): void {
    const cell = this.graph.getCell(cellId);
    if (!cell) return;
    if (this.selectedCellIds.has(cellId)) {
      this.selectedCellIds.delete(cellId);
      this.applySelectionStyle(cell, false);
    } else {
      this.selectedCellIds.add(cellId);
      this.applySelectionStyle(cell, true);
    }
    this.hideRotationBadge();
    if (this.selectedCellIds.size === 1) {
      const [id] = this.selectedCellIds;
      const only = this.graph.getCell(id);
      if (only && !only.isLink()) this.showRotationBadge(only as dia.Element);
    }
    this.onCellSelectFn?.([...this.selectedCellIds][0] ?? null);
  }

  /**
   * Apply/remove selection highlight using direct SVG presentation attrs (hex).
   * Deselect branches restore colorToken colour where applicable (§2).
   */
  private applySelectionStyle(cell: dia.Cell, selected: boolean): void {
    const type = cell.get("type") as string;

    if (type === "nova.Instrument") {
      const inst = cell as NovaInstrument;
      if (selected) {
        inst.attr("bubble/stroke", CSS.accent);
        inst.attr("bubble/strokeWidth", 2.5);
      } else {
        const isMissing = this.missingBindings.has(cell.id as string);
        const colorHex = this.resolveColorToken(cell);
        inst.attr("bubble/stroke", isMissing ? CSS.warn : (colorHex ?? CSS.border));
        inst.attr("bubble/strokeWidth", 1.5);
      }
    } else if (type === "nova.Valve") {
      const valve = cell as NovaValve;
      if (selected) {
        valve.attr("symbol/stroke",      CSS.accent);
        valve.attr("symbol/strokeWidth", 2.8);
      } else {
        const colorHex = this.resolveColorToken(cell);
        valve.attr("symbol/stroke", colorHex ?? CSS.textPrim);
        valve.attr("symbol/strokeWidth", 1.8);
      }
    } else if (type === "nova.Vessel") {
      const vessel = cell as NovaVessel;
      if (selected) {
        vessel.attr("tank/stroke",      CSS.accent);
        vessel.attr("tank/strokeWidth", 2.5);
      } else {
        const colorHex = this.resolveColorToken(cell);
        vessel.attr("tank/stroke", colorHex ?? CSS.border);
        vessel.attr("tank/strokeWidth", 1.5);
      }
      this.toggleResizeTool(cell, selected);
    } else if (type === "nova.Bottle" || type === "nova.Chamber") {
      const colorHex = this.resolveColorToken(cell);
      cell.attr("symbol/stroke", selected ? CSS.accent : (colorHex ?? CSS.border));
      cell.attr("symbol/strokeWidth", selected ? 2.5 : 1.5);
      this.toggleResizeTool(cell, selected);
    } else if (type === "nova.Device") {
      const colorHex = this.resolveColorToken(cell);
      cell.attr("box/stroke", selected ? CSS.accent : (colorHex ?? CSS.textPrim));
      cell.attr("box/strokeWidth", selected ? 2.5 : 1.5);
    } else if (type === "nova.ActuatorControl") {
      cell.attr("body/stroke", selected ? CSS.accent : CSS.border);
      cell.attr("body/strokeWidth", selected ? 2 : 1);
    } else if (type === "nova.Zone") {
      cell.attr("box/strokeWidth", selected ? 2.5 : 1.5);
      this.toggleResizeTool(cell, selected);
    } else if (type === "nova.SystemLink") {
      (cell as NovaSystemLink).attr("line/strokeWidth", selected ? 4.5 : 2.5);
    } else if (type === "nova.TextLabel") {
      (cell as dia.Element).attr("label/fontWeight", selected ? "700" : "400");
    }
  }

  /** Show/hide the bottom-right drag-resize handle on a selected element. */
  private toggleResizeTool(cell: dia.Cell, selected: boolean): void {
    const view = this.paper.findViewByModel(cell) as dia.ElementView | undefined;
    if (!view) return;
    if (selected) {
      view.addTools(new dia.ToolsView({ tools: [new ZoneResizeTool()] }));
    } else {
      view.removeTools();
    }
  }

  // ---- Color token helper (§2) --------------------------------------------

  private resolveColorToken(cell: dia.Cell): string | null {
    const token = cell.get("colorToken") as string | undefined;
    if (!token) return null;
    const TOKEN_HEX: Record<string, string> = {
      info:         "#3b82f6",
      fault:        "#ef4444",
      nominal:      "#22c55e",
      warn:         "#f59e0b",
      accent:       "#4d8bff",
      "accent.400": "#4d8bff",
    };
    return TOKEN_HEX[token] ?? null;
  }

  // ---- Rotation angle badge ------------------------------------------------

  private showRotationBadge(elem: dia.Element): void {
    this.hideRotationBadge();
    const viewport = this.paper.el.querySelector(".joint-viewport") as SVGGElement | null;
    if (!viewport) return;

    const bbox  = elem.getBBox();
    const angle = Math.round(elem.angle() ?? 0);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(bbox.x + bbox.width / 2));
    text.setAttribute("y", String(bbox.y - 6));
    text.setAttribute("text-anchor", "middle");
    text.style.fontSize      = "10px";
    text.style.fill          = "#94a0b3";   // textMuted hex
    text.style.fontFamily    = "var(--font-inter), Inter, sans-serif";
    text.style.pointerEvents = "none";
    text.style.userSelect    = "none";
    text.textContent = `${angle}°`;

    viewport.appendChild(text);
    this.rotationBadgeEl = text;
  }

  private hideRotationBadge(): void {
    this.rotationBadgeEl?.remove();
    this.rotationBadgeEl = null;
  }

  private updateRotationBadge(): void {
    if (!this.rotationBadgeEl || this.selectedCellIds.size !== 1) return;
    const [id] = this.selectedCellIds;
    const cell = this.graph.getCell(id);
    if (!cell || cell.isLink()) return;

    const elem  = cell as dia.Element;
    const bbox  = elem.getBBox();
    const angle = Math.round(elem.angle() ?? 0);

    this.rotationBadgeEl.setAttribute("x", String(bbox.x + bbox.width / 2));
    this.rotationBadgeEl.setAttribute("y", String(bbox.y - 6));
    this.rotationBadgeEl.textContent = `${angle}°`;
  }

  // ---- Lasso selection -----------------------------------------------------

  private startLasso(x: number, y: number): void {
    this.lassoStart = { x, y };
    this.clearSelection();

    const viewport = this.paper.el.querySelector(".joint-viewport") as SVGGElement | null;
    if (!viewport) return;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", "0");
    rect.setAttribute("height", "0");
    rect.style.fill            = "rgba(77, 139, 255, 0.12)";
    rect.style.stroke          = "#4d8bff";
    rect.style.strokeWidth     = "1.5";
    rect.style.strokeDasharray = "4 3";
    rect.style.pointerEvents   = "none";

    viewport.appendChild(rect);
    this.lassoEl = rect;
  }

  private updateLasso(x: number, y: number): void {
    if (!this.lassoStart || !this.lassoEl) return;
    const { x: sx, y: sy } = this.lassoStart;
    const rx = Math.min(sx, x);
    const ry = Math.min(sy, y);
    const rw = Math.abs(x - sx);
    const rh = Math.abs(y - sy);

    this.lassoEl.setAttribute("x", String(rx));
    this.lassoEl.setAttribute("y", String(ry));
    this.lassoEl.setAttribute("width", String(rw));
    this.lassoEl.setAttribute("height", String(rh));
  }

  private finishLasso(x: number, y: number): void {
    if (!this.lassoStart) return;

    const { x: sx, y: sy } = this.lassoStart;
    const area = {
      x: Math.min(sx, x),
      y: Math.min(sy, y),
      width:  Math.abs(x - sx),
      height: Math.abs(y - sy),
    };

    this.lassoEl?.remove();
    this.lassoEl  = null;
    this.lassoStart = null;

    // Only select if the lasso has meaningful size
    if (area.width < 5 && area.height < 5) return;

    const views = this.paper.findViewsInArea(area);
    const ids = views
      .filter((v) => !v.model.isLink())
      .map((v) => v.model.id as string);

    if (ids.length > 0) this.setSelection(ids);
  }

  // ---- Auto-snapshot -------------------------------------------------------

  private scheduleSnapshot(): void {
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.pushSnapshot();
    }, 300);
  }

  // ---- Pipe mode (§3) click-to-route --------------------------------------

  private newPipeLink(): NovaSystemLink {
    const link = new NovaSystemLink();
    link.set("colorToken", this.activePipeColor);
    link.applyColour();
    return link;
  }

  /** Push the latest target point as a vertex and move the target to (x,y). */
  private extendPipe(x: number, y: number): void {
    if (!this.inProgressLink) return;
    this.pipePoints.push({ x, y });
    this.inProgressLink.target({ x, y });
    // All points except the last become bend vertices.
    this.inProgressLink.vertices(this.pipePoints.slice(0, -1));
  }

  private handlePipeClick(x: number, y: number): void {
    if (!this.pipeMode) return;
    if (!this.inProgressLink) {
      // Start a fresh pipe from a free point.
      const link = this.newPipeLink();
      link.source({ x, y });
      link.target({ x, y });
      this.graph.addCell(link);
      this.inProgressLink = link;
      this.pipePoints = [];
    } else {
      this.extendPipe(x, y);
    }
  }

  private handlePipeElementClick(cellView: dia.CellView, x: number, y: number): void {
    if (!this.pipeMode) return;
    const cell = cellView.model;
    if (!this.inProgressLink) {
      // Start anchored to an element.
      const link = this.newPipeLink();
      link.source({ id: cell.id as string });
      link.target({ x, y });
      this.graph.addCell(link);
      this.inProgressLink = link;
      this.pipePoints = [];
    } else {
      // Finish anchored to an element — clicked points become bend vertices.
      this.inProgressLink.vertices(this.pipePoints);
      this.inProgressLink.target({ id: cell.id as string });
      this.finishPipe();
    }
  }

  private finishPipe(): void {
    // Drop a degenerate zero/near-zero-length pipe (e.g. a stray single click).
    if (this.inProgressLink && this.pipePoints.length === 0) {
      const src = this.inProgressLink.source() as { id?: string };
      if (!src.id) {
        this.inProgressLink.remove();
      }
    }
    this.inProgressLink = null;
    this.pipePoints = [];
  }

  private cancelPipe(): void {
    if (this.inProgressLink) {
      this.inProgressLink.remove();
      this.inProgressLink = null;
    }
    this.pipePoints = [];
  }

  // ---- Live mode command dispatch -----------------------------------------

  /**
   * Per-command UI gate — mirrors useCommandGate (role + lockout + safetyRules).
   * Advisory only; the backend independently enforces. Critically, lockout
   * blocks ONLY hazardous commands (not every command), matching the table.
   */
  private canSend(name: string, state: string): boolean {
    const s = useNovaStore.getState();
    const role = sel.sessionRole(s);
    if (!role || role === "viewer") return false;
    const hazardous = matchesRules(this.safetyRules?.hazardous, name, state);
    const critical  = matchesRules(this.safetyRules?.critical,  name, state);
    if (role === "pad" && !(hazardous || critical)) return false;
    if (sel.isLocked(s) && hazardous) return false;
    return true;
  }

  /** Toggle the position axis and optimistically flip the supplied badge target. */
  private commandPositionToggle(
    name: string,
    entry: ActuatorEntry,
    setBadge: (badge: BadgeState, label: string) => void,
  ): void {
    const currentState = useNovaStore.getState().actuatorStates.data?.[name] ?? null;
    const segments = deriveControls(entry);
    const posSeg = segments.find((s) => s.kind === "position") ?? segments[0];
    if (!posSeg) return;

    const next = nextOption(posSeg, activeOption(posSeg, currentState));
    if (!this.canSend(name, next.command)) return;

    const cmd = next.command.toLowerCase();
    const optimisticBadge: BadgeState =
      cmd === "open" ? "open" : cmd === "closed" ? "closed" : "custom";
    setBadge(optimisticBadge, next.label);
    this.sendCommandFn({ type: entry.type, name, state: next.command });
  }

  private handleValveClick(cellView: dia.CellView): void {
    const cell = cellView.model as NovaValve;
    if (!(cell instanceof NovaValve) || !cell.isControllable()) return;
    const name = cell.bindingName();
    if (!name) return;
    const entry = this.actuatorConfig.get(name);
    if (!entry) return;
    this.commandPositionToggle(name, entry, (b, l) => cell.setBadge(b, l));
  }

  private handleDeviceClick(cellView: dia.CellView): void {
    const cell = cellView.model as NovaDevice;
    if (!(cell instanceof NovaDevice) || !cell.isControllable()) return;
    const name = cell.bindingName();
    if (!name) return;
    const entry = this.actuatorConfig.get(name);
    if (!entry) return;
    this.commandPositionToggle(name, entry, (b, l) => cell.setBadge(b, l));
  }

  /**
   * Click on a control widget toggles the axis (chip) under the cursor.
   * @param paperX paper-space x of the click — mapped to a chip index.
   */
  private handleControlClick(cellView: dia.CellView, paperX: number): void {
    const ctrl = cellView.model as NovaActuatorControl;
    const name = ctrl.bindingName();
    if (!name) return;
    const entry = this.actuatorConfig.get(name);
    if (!entry) return;

    const currentState = useNovaStore.getState().actuatorStates.data?.[name] ?? null;
    const buttons = computeButtons(entry, currentState);
    if (buttons.length === 0) return;

    // Map the click x to a button index using the shared button geometry.
    const localX = paperX - (ctrl.position().x ?? 0);
    const idx = buttonIndexAtX(buttons.map((b) => b.label), localX);
    if (idx < 0) return;

    const btn = buttons[idx];
    if (!this.canSend(name, btn.command)) return;

    this.sendCommandFn({ type: entry.type, name, state: btn.command });
  }
}
