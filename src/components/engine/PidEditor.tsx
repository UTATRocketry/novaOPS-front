"use client";

/**
 * PidEditor — wraps PidCanvas in edit mode with a three-column layout:
 *   Left (200px):   Categorised component palette — click to drop shapes.
 *   Centre (flex):  PidCanvas in edit mode + compact toolbar above it.
 *   Right (260px):  PidPropertiesPanel for the selected cell.
 *
 * Toolbar (above canvas): undo/redo | zoom | pipe mode + swatches | rotate |
 *   delete | save | load | config upload.
 *
 * Keyboard shortcuts: Delete/Backspace → delete selected,
 *   Ctrl+Z → undo, Ctrl+Y / Ctrl+Shift+Z → redo.
 *
 * Exposes PidEditorHandle via forwardRef so the parent page can serialise the
 * current graph state before switching back to live mode.
 */
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Box, Flex } from "@chakra-ui/react";
import type { dia } from "@joint/core";
import {
  NovaInstrument,
  NovaValve,
  NovaVessel,
  NovaBottle,
  NovaChamber,
  NovaDevice,
  NovaZone,
  NovaTextLabel,
  NovaActuatorControl,
  type ValveVariant,
  DEFAULT_SYSTEMS,
} from "@/lib/pid";
import { parseLayout } from "@/lib/pid/serializer";
import type { NovaPidLayout } from "@/lib/pid/serializer";
import type { PidBridge } from "@/lib/pid/bridge";
import { PID_COLORS } from "@/lib/pid/registry";
import type { SystemRegistry } from "@/lib/pid/registry";
import type { SensorEntry, ActuatorEntry } from "@/lib/types";
import { PidCanvas } from "./PidCanvas";
import { PidPropertiesPanel } from "./PidPropertiesPanel";
import { UploadConfigModal } from "./UploadConfigModal";
import { Icon, Chip } from "@/components/primitives";

// ---------------------------------------------------------------------------
// Handle exposed to parent
// ---------------------------------------------------------------------------

export interface PidEditorHandle {
  serialize(name?: string): NovaPidLayout | null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PidEditorProps {
  layout?: NovaPidLayout;
  sensors?: SensorEntry[];
  actuators?: ActuatorEntry[];
  height?: number;
  onLayoutChange?: (layout: NovaPidLayout) => void;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

interface TbtnProps {
  label: string;
  icon?: string;
  text?: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function Tbtn({ label, icon, text, active, danger, disabled, onClick }: TbtnProps) {
  const accent = danger ? "var(--chakra-colors-fault)" : "var(--chakra-colors-accent-solid)";
  return (
    <Box
      as="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      display="flex"
      alignItems="center"
      gap={1}
      px={text ? 2 : 1.5}
      py={1.5}
      borderRadius="control"
      border="1px solid"
      borderColor={active ? accent : "border.default"}
      bg={active ? `color-mix(in srgb, ${accent} 12%, transparent)` : "transparent"}
      color={active ? accent : disabled ? "text.muted" : "text.primary"}
      opacity={disabled ? 0.4 : 1}
      cursor={disabled ? "not-allowed" : "pointer"}
      fontSize="xs"
      fontFamily="mono"
      transition="all 0.15s"
      _hover={disabled ? {} : {
        borderColor: accent,
        color: accent,
        bg: `color-mix(in srgb, ${accent} 8%, transparent)`,
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      {text && <Box>{text}</Box>}
    </Box>
  );
}

function TDivider() {
  return <Box w="1px" h="24px" bg="border.default" flexShrink={0} />;
}

interface SwatchProps {
  hex: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

function Swatch({ hex, label, active, onClick }: SwatchProps) {
  return (
    <Box
      as="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      w="20px"
      h="20px"
      borderRadius="full"
      bg={hex}
      border="2px solid"
      borderColor={active ? "text.primary" : "transparent"}
      cursor="pointer"
      transition="all 0.15s"
      _hover={{ transform: "scale(1.15)" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

interface PaletteItemDef {
  id: string;
  label: string;
  icon: string;
  sub?: string;
}

interface PaletteCategoryDef {
  title: string;
  items: PaletteItemDef[];
}

const PALETTE_CATEGORIES: PaletteCategoryDef[] = [
  {
    title: "Structures",
    items: [
      { id: "tank",    label: "Tank",       icon: "propane_tank" },
      { id: "bottle",  label: "Bottle",     icon: "cylinder" },
      { id: "chamber", label: "Chamber",    icon: "settings_suggest" },
      { id: "label",   label: "Text label", icon: "text_fields" },
    ],
  },
  {
    title: "Valves",
    items: [
      { id: "ball2",    label: "2-way ball", icon: "stop_circle",          sub: "2W" },
      { id: "ball3",    label: "3-way ball", icon: "change_circle",        sub: "3W" },
      { id: "solenoid", label: "Solenoid",   icon: "radio_button_checked", sub: "SV" },
    ],
  },
  {
    title: "Instruments",
    items: [
      { id: "PT", label: "Pressure (PT)",    icon: "speed" },
      { id: "TC", label: "Thermocouple (TC)",icon: "thermostat" },
      { id: "LC", label: "Load (LC)",       icon: "weight" },
    ],
  },
  {
    title: "Controls",
    items: [
      { id: "actuator_control", label: "Actuator control", icon: "toggle_on" },
    ],
  },
  {
    title: "Other",
    items: [
      { id: "device", label: "Device", icon: "square", sub: "DEV" },
      { id: "zone",   label: "Zone (box)", icon: "select_all" },
    ],
  },
];

/**
 * Small inline SVG preview of each palette symbol (viewBox 0 0 44 44).
 * Strokes inherit `currentColor` so they pick up the button's text colour.
 */
function ShapeThumb({ id }: { id: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round" as const };
  let body: React.ReactNode;
  switch (id) {
    case "tank":
      body = (<><rect x={14} y={9} width={16} height={26} rx={2} {...common} /><ellipse cx={22} cy={9} rx={8} ry={3} {...common} /><ellipse cx={22} cy={35} rx={8} ry={3} {...common} /></>);
      break;
    case "bottle":
      body = <path d="M18,14 L18,8 C18,5 20,4 22,4 C24,4 26,5 26,8 L26,14 M11,18 C11,14 16,12 22,12 C28,12 33,14 33,18 L33,38 L11,38 Z" {...common} />;
      break;
    case "chamber":
      body = <path d="M12,12 C18,5 26,5 32,12 L32,26 C28,31 30,37 35,40 L9,40 C14,37 16,31 12,26 Z" {...common} />;
      break;
    case "label":
      body = <text x={22} y={30} fontSize={22} fontWeight={700} textAnchor="middle" fill="currentColor" fontFamily="monospace">T</text>;
      break;
    case "ball2":
      body = <path d="M8,12 L8,32 L22,22 Z M36,12 L36,32 L22,22 Z" {...common} />;
      break;
    case "ball3":
      body = (<><path d="M8,14 L8,32 L22,23 Z M36,14 L36,32 L22,23 Z" {...common} /><path d="M22,23 L22,7" {...common} /></>);
      break;
    case "solenoid":
      body = (<><path d="M8,14 L8,32 L22,23 Z M36,14 L36,32 L22,23 Z" {...common} /><rect x={16} y={6} width={12} height={7} rx={1} {...common} /></>);
      break;
    case "PT": case "TC": case "LC":
      body = (<><circle cx={22} cy={22} r={14} {...common} /><text x={22} y={26} fontSize={11} fontWeight={700} textAnchor="middle" fill="currentColor" fontFamily="sans-serif">{id}</text></>);
      break;
    case "actuator_control":
      body = (<><rect x={5} y={16} width={15} height={12} rx={2} {...common} /><rect x={24} y={16} width={15} height={12} rx={2} {...common} /></>);
      break;
    case "device":
      body = <rect x={10} y={10} width={24} height={24} rx={3} {...common} />;
      break;
    case "zone":
      body = <rect x={6} y={11} width={32} height={22} rx={3} {...common} strokeDasharray="4 3" />;
      break;
    default:
      body = <circle cx={22} cy={22} r={10} {...common} />;
  }
  return (
    <svg width="40" height="40" viewBox="0 0 44 44" style={{ display: "block" }}>
      {body}
    </svg>
  );
}

function PalettePanel({ onAdd }: { onAdd: (id: string) => void }) {
  return (
    <Box overflowY="auto" h="100%" pb={3}>
      {PALETTE_CATEGORIES.map((cat) => (
        <Box key={cat.title}>
          <Box
            px={3} pt={3} pb={1.5}
            fontSize="9px"
            fontWeight="700"
            letterSpacing="0.1em"
            color="text.muted"
            textTransform="uppercase"
            fontFamily="mono"
          >
            {cat.title}
          </Box>
          <Box
            display="grid"
            gridTemplateColumns="repeat(2, 1fr)"
            gap={1.5}
            px={2}
          >
            {cat.items.map((item) => (
              <Box
                key={item.id}
                as="button"
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                gap={1}
                py={2}
                px={1}
                fontFamily="mono"
                color="text.muted"
                bg="bg.surfaceRaised"
                border="1px solid"
                borderColor="border.default"
                borderRadius="control"
                cursor="pointer"
                transition="all 0.12s"
                _hover={{ borderColor: "accent.solid", color: "text.primary", bg: "bg.surface" }}
                onClick={() => onAdd(item.id)}
                title={item.label}
              >
                <ShapeThumb id={item.id} />
                <Box fontSize="9px" textAlign="center" lineHeight="1.1" maxW="100%" truncate>
                  {item.label}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// PidEditor
// ---------------------------------------------------------------------------

export const PidEditor = forwardRef<PidEditorHandle, PidEditorProps>(
  function PidEditor(
    { layout, sensors = [], actuators = [], height = 580, onLayoutChange },
    ref,
  ) {
    const graphRef  = useRef<dia.Graph | null>(null);
    const bridgeRef = useRef<PidBridge | null>(null);

    const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
    const [activePipeColor, setActivePipeColor] = useState<string>("info");
    const [showUploadModal, setShowUploadModal]   = useState(false);
    const [pipeMode, setPipeModeState] = useState(false);

    const systems: SystemRegistry = layout?.systems ?? DEFAULT_SYSTEMS;

    useImperativeHandle(ref, () => ({
      serialize(name = "Untitled") {
        return bridgeRef.current?.serializeCurrent(name) ?? null;
      },
    }));

    const handleReady = useCallback((
      graph: dia.Graph,
      _paper: dia.Paper,
      bridge: PidBridge,
    ) => {
      graphRef.current  = graph;
      bridgeRef.current = bridge;
    }, []);

    const handleCellSelect = useCallback((cellId: string | null) => {
      setSelectedCellId(cellId);
    }, []);

    // ---- Keyboard shortcuts -----------------------------------------------

    useEffect(() => {
      function onKeyDown(e: KeyboardEvent) {
        const target = e.target as HTMLElement;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.isContentEditable
        ) return;

        // Copy / paste
        if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
          e.preventDefault();
          bridgeRef.current?.copySelected();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
          e.preventDefault();
          bridgeRef.current?.paste();
          return;
        }

        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          bridgeRef.current?.deleteSelected();
          return;
        }

        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          bridgeRef.current?.rotateSelected();
          return;
        }

        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          setPipeModeState((prev) => {
            const next = !prev;
            bridgeRef.current?.setPipeMode(next, undefined);
            return next;
          });
          return;
        }

        if (e.ctrlKey || e.metaKey) {
          if (e.key === "z") {
            e.preventDefault();
            if (e.shiftKey) {
              bridgeRef.current?.redo();
            } else {
              bridgeRef.current?.undo();
            }
            return;
          }
          if (e.key === "y") {
            e.preventDefault();
            bridgeRef.current?.redo();
          }
        }
      }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    // ---- Pipe system colour -----------------------------------------------

    const selectPipeColor = useCallback((token: string) => {
      setActivePipeColor(token);
      bridgeRef.current?.setActivePipeColor(token);
    }, []);

    const togglePipeMode = useCallback(() => {
      const next = !pipeMode;
      setPipeModeState(next);
      bridgeRef.current?.setActivePipeColor(activePipeColor);
      bridgeRef.current?.setPipeMode(next);
    }, [pipeMode, activePipeColor]);

    // ---- Shape factory helpers --------------------------------------------

    const addShape = useCallback((id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge) return;

      if (id === "label") {
        const cell = new NovaTextLabel();
        cell.attr("label/text", "TEXT");
        bridge.addCellAt(cell);
        return;
      }

      if (id === "tank") {
        bridge.addCellAt(new NovaVessel({ label: "TANK", contentsLabel: "" }));
        return;
      }
      if (id === "bottle") {
        bridge.addCellAt(new NovaBottle({ label: "BOTTLE", contentsLabel: "" }));
        return;
      }
      if (id === "chamber") {
        bridge.addCellAt(new NovaChamber({ label: "CHAMBER", contentsLabel: "" }));
        return;
      }

      if (id === "actuator_control") {
        const cell = new NovaActuatorControl({ binding: null });
        bridge.addCellAt(cell);
        return;
      }

      if (id === "device") {
        bridge.addCellAt(new NovaDevice({ binding: null, controllable: false, label: "" }));
        return;
      }

      if (id === "zone") {
        bridge.addCellAt(new NovaZone({ label: "ZONE" }));
        return;
      }

      const VALVE_VARIANTS: ValveVariant[] = ["ball2", "ball3", "solenoid"];
      if (VALVE_VARIANTS.includes(id as ValveVariant)) {
        bridge.addCellAt(new NovaValve({
          binding: null,
          symbolVariant: id as ValveVariant,
          controllable: false,
          label: "",
        }));
        return;
      }

      // Instrument types
      const INSTRUMENT_TYPES = ["PT", "TC", "LC"];
      if (INSTRUMENT_TYPES.includes(id)) {
        bridge.addCellAt(new NovaInstrument({
          binding: { name: "" },
          instrumentType: id,
          label: "",
          hint: { unit: "", range: [0, 100] },
        }));
      }
    }, []);

    // ---- Element actions --------------------------------------------------

    const handleRotate = () => bridgeRef.current?.rotateSelected();
    const handleDelete = () => bridgeRef.current?.deleteSelected();

    // ---- Zoom / fit -------------------------------------------------------

    const handleZoomIn   = () => bridgeRef.current?.zoomIn();
    const handleZoomOut  = () => bridgeRef.current?.zoomOut();
    const handleFit      = () => bridgeRef.current?.fitContent();
    const handleResetZoom = () => bridgeRef.current?.resetZoom();

    // ---- Undo / redo ------------------------------------------------------

    const handleUndo = () => bridgeRef.current?.undo();
    const handleRedo = () => bridgeRef.current?.redo();

    // ---- Save / Load layout -----------------------------------------------

    function handleSave() {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const newLayout = bridge.serializeCurrent("P&ID Layout");
      onLayoutChange?.(newLayout);
      downloadJson(newLayout, `pid-layout-${Date.now()}.json`);
    }

    function handleLoadClick() {
      const input = document.createElement("input");
      input.type   = "file";
      input.accept = ".json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text   = ev.target?.result as string;
          const parsed = parseLayout(text);
          if (!parsed) { alert("Invalid layout file — not a Nova P&ID JSON."); return; }
          onLayoutChange?.(parsed);
        };
        reader.readAsText(file);
      };
      input.click();
    }

    // ---- Render -----------------------------------------------------------

    const hasSelection = selectedCellId !== null;

    return (
      <Box position="relative">
        {/* Compact toolbar */}
        <Flex
          align="center"
          gap={1.5}
          px={3}
          py={2}
          borderBottom="1px solid"
          borderColor="border.default"
          bg="bg.surface"
          flexWrap="wrap"
        >
          {/* Undo / redo */}
          <Tbtn label="Undo (Ctrl+Z)" icon="undo" onClick={handleUndo} />
          <Tbtn label="Redo (Ctrl+Y)" icon="redo" onClick={handleRedo} />

          <TDivider />

          {/* Zoom */}
          <Tbtn label="Zoom out"   icon="zoom_out"       onClick={handleZoomOut} />
          <Tbtn label="Zoom in"    icon="zoom_in"        onClick={handleZoomIn} />
          <Tbtn label="Fit all"    icon="fit_screen"     onClick={handleFit} />
          <Tbtn label="Reset zoom" icon="zoom_out_map"   onClick={handleResetZoom} />

          <TDivider />

          {/* Pipe mode toggle */}
          <Tbtn
            label={pipeMode ? "Exit pipe mode (P)" : "Draw pipe (P)"}
            icon="polyline"
            active={pipeMode}
            onClick={togglePipeMode}
          />

          <TDivider />

          {/* Palette colour swatches — active swatch sets colour for next pipe drawn */}
          {PID_COLORS.map((c) => (
            <Swatch
              key={c.token}
              hex={c.hex}
              label={c.label}
              active={activePipeColor === c.token}
              onClick={() => selectPipeColor(c.token)}
            />
          ))}

          <TDivider />

          {/* Element actions */}
          <Tbtn
            label="Rotate 90°"
            icon="rotate_90_degrees_cw"
            disabled={!hasSelection}
            onClick={handleRotate}
          />
          <Tbtn
            label="Delete selected"
            icon="delete"
            danger
            disabled={!hasSelection}
            onClick={handleDelete}
          />

          <TDivider />

          {/* Layout I/O */}
          <Tbtn label="Save layout as JSON" icon="download" text="Save" onClick={handleSave} />
          <Tbtn label="Load layout from JSON" icon="upload"  text="Load" onClick={handleLoadClick} />
          <Tbtn label="Upload YAML config"    icon="cloud_upload" text="Config" onClick={() => setShowUploadModal(true)} />

          <Box ml="auto">
            <Chip status="warn">Edit</Chip>
          </Box>
        </Flex>

        {/* Three-column body */}
        <Flex align="stretch" height={`${height}px`}>
          {/* Left: component palette */}
          <Box
            w="200px"
            flexShrink={0}
            borderRight="1px solid"
            borderColor="border.default"
            bg="bg.surface"
          >
            <PalettePanel onAdd={addShape} />
          </Box>

          {/* Centre: canvas */}
          <Box flex={1} minW={0} position="relative">
            <PidCanvas
              layout={layout}
              mode="edit"
              sensors={sensors}
              actuators={actuators}
              height={height}
              onReady={handleReady}
              onCellSelect={handleCellSelect}
            />

          </Box>

          {/* Right: properties panel */}
          <Box
            w="260px"
            flexShrink={0}
            borderLeft="1px solid"
            borderColor="border.default"
            overflowY="auto"
            bg="bg.surface"
          >
            <PidPropertiesPanel
              cellId={selectedCellId}
              graph={graphRef.current}
              sensors={sensors}
              actuators={actuators}
              systems={systems}
            />
          </Box>
        </Flex>

        {/* Upload config modal */}
        {showUploadModal && (
          <UploadConfigModal onClose={() => setShowUploadModal(false)} />
        )}
      </Box>
    );
  },
);
