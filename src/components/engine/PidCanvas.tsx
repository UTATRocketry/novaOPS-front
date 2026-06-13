"use client";

/**
 * PidCanvas — React host for the JointJS P&ID diagram.
 *
 * Manages three long-lived refs (graph, paper, bridge) created once in
 * useEffect and never torn down except on component unmount.
 *
 * In live mode the bridge subscribes directly to the Zustand store and pushes
 * values imperatively into shape cells — high-frequency telemetry stays off
 * the React render cycle entirely.
 *
 * Port-based pipe drawing: each shape exposes `magnet:true` port circles.
 * JointJS handles drag-from-port → creates a NovaSystemLink automatically.
 * The bridge's `graph.on("add")` handler applies the active system colour.
 */
import { useEffect, useRef, useCallback } from "react";
import { Box } from "@chakra-ui/react";
import { dia, shapes } from "@joint/core";
import {
  NOVA_NAMESPACE,
  NovaSystemLink,
  PidBridge,
  DEFAULT_LAYOUT,
  deserializeLayout,
} from "@/lib/pid";
import type { NovaPidLayout } from "@/lib/pid/serializer";
import type { PidMode, PidBridge as PidBridgeType } from "@/lib/pid/bridge";
import { sendCommand as apiSendCommand } from "@/lib/api";
import type { CommandPayload } from "@/lib/types";
import type { SensorEntry, ActuatorEntry, SafetyRules } from "@/lib/types";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PidCanvasProps {
  /** P&ID layout to render. Defaults to DEFAULT_LAYOUT when omitted. */
  layout?: NovaPidLayout;
  /** "live" subscribes to the store; "edit" enables drag/drop/connect. Default: "live". */
  mode?: PidMode;
  /** Sensor entries from config — used to validate bindings. */
  sensors?: SensorEntry[];
  /** Actuator entries from config — used to validate bindings + toggle logic. */
  actuators?: ActuatorEntry[];
  /** Safety rules from config — used by the live command gate (hazardous/critical). */
  safetyRules?: SafetyRules;
  /** Height of the canvas container. Default 600px. */
  height?: string | number;
  /** Called once after JointJS is initialized (graph, paper, bridge). */
  onReady?: (graph: dia.Graph, paper: dia.Paper, bridge: PidBridgeType) => void;
  /** Called when selected cell changes in edit mode. */
  onCellSelect?: (cellId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PidCanvas({
  layout,
  mode = "live",
  sensors = [],
  actuators = [],
  safetyRules,
  height = 600,
  onReady,
  onCellSelect,
}: PidCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef     = useRef<dia.Graph | null>(null);
  const paperRef     = useRef<dia.Paper | null>(null);
  const bridgeRef    = useRef<PidBridgeType | null>(null);

  // Stable callback refs so effects don't re-run on re-render
  const onReadyRef      = useRef(onReady);
  const onCellSelectRef = useRef(onCellSelect);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onCellSelectRef.current = onCellSelect; }, [onCellSelect]);

  // clientId for REST command dispatch
  const clientId = useNovaStore(sel.clientId);
  const clientIdRef = useRef(clientId);
  useEffect(() => { clientIdRef.current = clientId; }, [clientId]);

  const sendCommand = useCallback((payload: CommandPayload) => {
    apiSendCommand(payload, clientIdRef.current ?? "").catch((err: unknown) => {
      // Errors surface in the console only; the backend's actuator_states
      // response (or absence of it) reconciles the optimistic update.
      console.error("[PidCanvas] command error:", err);
    });
  }, []);

  // ---- Initialise JointJS (once) ------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const cellNamespace = { ...shapes, ...NOVA_NAMESPACE };

    const graph = new dia.Graph({}, { cellNamespace });

    // Do NOT pass el: containerRef.current — in Backbone/JointJS, passing `el`
    // makes paper.el === containerRef.current (the React-owned div). Then
    // paper.remove() removes the React div from the DOM, and React's own
    // unmount later fails with "removeChild: not a child". Instead, let
    // JointJS create its own div, then append it to our container. paper.remove()
    // then only removes the paper-owned div — safe and React-transparent.
    const paper = new dia.Paper({
      model: graph,
      width: "100%",
      height: typeof height === "number" ? height : parseInt(height, 10) || 600,
      gridSize: 10,
      snapToGrid: { x: 10, y: 10 },
      interactive: false,
      background: { color: "transparent" },
      preventContextMenu: true,
      // Port-based link creation: dragging from a port magnet creates a NovaSystemLink.
      defaultLink: () => new NovaSystemLink(),
      validateConnection: (
        sourceView: dia.CellView,
        sourceMagnet: SVGElement | null,
        targetView: dia.CellView,
        targetMagnet: SVGElement | null,
      ) => {
        // Both endpoints must be on port magnets and must be different elements.
        if (!sourceMagnet || !targetMagnet) return false;
        if (sourceView === targetView) return false;
        return true;
      },
      snapLinks: { radius: 20 },
      linkPinning: false,
    });

    container.appendChild(paper.el);

    const bridge = new PidBridge({
      graph,
      paper,
      sendCommand,
      onCellSelect: (cellId) => onCellSelectRef.current?.(cellId),
    });

    graphRef.current  = graph;
    paperRef.current  = paper;
    bridgeRef.current = bridge;

    onReadyRef.current?.(graph, paper, bridge);

    // Wheel zoom — prevent page scroll, delegate to bridge
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
      bridge.zoomTo(bridge.getScale() * factor);
    };
    container.addEventListener("wheel", handleWheel, { passive: false });

    // ── Panning ─────────────────────────────────────────────────────────────
    // Drag to pan with the MIDDLE mouse button, or hold SPACE + left-drag.
    // Handlers run in the CAPTURE phase and stopPropagation so JointJS doesn't
    // also start a lasso / element drag on the same gesture.
    let spaceDown = false;
    let panning = false;
    let panStart = { x: 0, y: 0 };
    let translateStart = { tx: 0, ty: 0 };

    const isFormField = (t: EventTarget | null): boolean =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Never swallow keys while the user is typing in a form field
      // (this previously blocked spaces in label inputs).
      if (isFormField(e.target)) return;
      if (e.code === "Space" && !spaceDown) {
        spaceDown = true;
        container.style.cursor = "grab";
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown = false;
        if (!panning) container.style.cursor = "";
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      // Middle button, or Space + left button → pan.
      if (e.button === 1 || (spaceDown && e.button === 0)) {
        panning = true;
        panStart = { x: e.clientX, y: e.clientY };
        const t = paper.translate() as { tx: number; ty: number };
        translateStart = { tx: t.tx, ty: t.ty };
        container.style.cursor = "grabbing";
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!panning) return;
      paper.translate(
        translateStart.tx + (e.clientX - panStart.x),
        translateStart.ty + (e.clientY - panStart.y),
      );
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!panning) return;
      panning = false;
      container.style.cursor = spaceDown ? "grab" : "";
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("pointermove", onPointerMove, true);
    container.addEventListener("pointerup", onPointerUp, true);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove, true);
      container.removeEventListener("pointerup", onPointerUp, true);
      bridge.destroy();
      graph.clear();
      paper.remove();
      graphRef.current  = null;
      paperRef.current  = null;
      bridgeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once

  // ---- Load layout when graph is ready or layout prop changes --------------
  useEffect(() => {
    const graph  = graphRef.current;
    const bridge = bridgeRef.current;
    if (!graph || !bridge) return;

    const activeLayout = layout ?? DEFAULT_LAYOUT;
    const sensorNames   = new Set(sensors.map((s) => s.name));
    const actuatorNames = new Set(actuators.map((a) => a.name));

    graph.clear();
    const report = deserializeLayout(activeLayout, graph, sensorNames, actuatorNames);

    const missingIds = new Set([
      ...report.missingBindings.map((m) => m.cellId),
    ]);

    bridge.indexLayout(sensors, actuators, activeLayout.systems, missingIds);
    bridge.setSafetyRules(safetyRules);
    bridge.setMode(mode);
  }, [layout, sensors, actuators, safetyRules, mode]);

  // Keep the bridge's safety rules current if they load after the layout.
  useEffect(() => {
    bridgeRef.current?.setSafetyRules(safetyRules);
  }, [safetyRules]);

  // ---- Mode changes after initial load ------------------------------------
  useEffect(() => {
    bridgeRef.current?.setMode(mode);
  }, [mode]);

  return (
    <Box
      ref={containerRef}
      className={mode === "edit" ? "pid-edit" : undefined}
      width="100%"
      height={typeof height === "number" ? `${height}px` : height}
      overflow="hidden"
      position="relative"
      backgroundImage="radial-gradient(circle, var(--chakra-colors-border-default) 1px, transparent 1px)"
      backgroundSize="20px 20px"
      css={{
        "& .joint-paper": { background: "transparent" },
        "& .joint-viewport [data-type='nova.Valve']": { cursor: "default" },
        // Ports are hidden in LIVE view (never shown, even on hover).
        "& .joint-port circle": {
          opacity: 0,
          transition: "opacity 0.15s",
        },
        // In EDIT mode ports are subtly visible, brighter on element hover.
        "&.pid-edit .joint-port circle": {
          opacity: 0.55,
        },
        "&.pid-edit .joint-element:hover .joint-port circle": {
          opacity: 1,
        },
      }}
    />
  );
}
