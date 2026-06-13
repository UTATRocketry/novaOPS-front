"use client";

/**
 * PidPropertiesPanel — shows and edits JointJS cell properties in edit mode.
 *
 * Receives the selected cell's ID and graph; directly mutates the JointJS cell
 * model on each change (bypassing React's render cycle, matching the bridge
 * pattern). Local state mirrors the cell values for controlled inputs and
 * re-initialises when the selected cell changes.
 *
 * Safety: binding dropdowns are restricted to existing config names — no free
 * text entry. Missing references show a warning chip.
 */
import { useState, useEffect, useCallback } from "react";
import { Box, Flex, chakra } from "@chakra-ui/react";
import type { dia } from "@joint/core";
import {
  NovaInstrument,
  NovaValve,
  NovaTextLabel,
  NovaSystemLink,
  NovaActuatorControl,
  NovaDevice,
  type ValveVariant,
} from "@/lib/pid/shapes";
import { controlButtonFaces } from "@/lib/pid/actuatorControls";
import { PID_COLORS } from "@/lib/pid/registry";
import type { SystemRegistry } from "@/lib/pid/registry";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import type { SensorEntry, ActuatorEntry } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const StyledSelect = chakra("select");
const StyledInput  = chakra("input");

/** Call applyLabels() on any Nova shape that exposes it (re-renders SVG face). */
function callApplyLabels(cell: dia.Cell): void {
  (cell as unknown as { applyLabels?: () => void }).applyLabels?.();
}

/** Shape types that use the vessel-style label/contents panel. */
const VESSEL_TYPES = ["nova.Vessel", "nova.Bottle", "nova.Chamber"];

const VALVE_VARIANTS: ValveVariant[] = ["ball2", "ball3", "solenoid"];

const INSTRUMENT_TYPES = ["PT", "TC", "LC"];

function sectionLabel(text: string) {
  return (
    <Box
      fontSize="2xs"
      textTransform="uppercase"
      letterSpacing="0.07em"
      color="text.muted"
      mb={1.5}
      mt={3}
    >
      {text}
    </Box>
  );
}

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
}

function FieldRow({ label, children }: FieldRowProps) {
  return (
    <Flex align="center" justify="space-between" gap={2} mb={2}>
      <Box fontSize="xs" color="text.muted" flexShrink={0} w="80px">
        {label}
      </Box>
      <Box flex={1} minW={0}>
        {children}
      </Box>
    </Flex>
  );
}

const selectStyle = {
  w: "100%",
  fontSize: "xs",
  fontFamily: "mono",
  bg: "bg.surfaceRaised",
  border: "1px solid",
  borderColor: "border.default",
  borderRadius: "control",
  px: 2,
  py: 1,
  color: "text.primary",
  cursor: "pointer",
  _focus: { outline: "none", borderColor: "accent.solid" },
} as const;

const inputStyle = {
  w: "100%",
  fontSize: "xs",
  fontFamily: "mono",
  bg: "bg.surfaceRaised",
  border: "1px solid",
  borderColor: "border.default",
  borderRadius: "control",
  px: 2,
  py: 1,
  color: "text.primary",
  _focus: { outline: "none", borderColor: "accent.solid" },
  _placeholder: { color: "text.muted" },
} as const;

// ---------------------------------------------------------------------------
// Colour picker — driven by the central PID_COLORS palette (registry.ts).
// Add a colour there and it appears here (and on pipes) automatically.
// `allowNone` adds a "default/none" swatch (empty token) for shapes.
// ---------------------------------------------------------------------------

function ColourPicker({
  value,
  onChange,
  allowNone = true,
}: {
  value: string;
  onChange: (t: string) => void;
  allowNone?: boolean;
}) {
  const swatches: { token: string; label: string; hex: string }[] = [
    ...(allowNone ? [{ token: "", label: "Default", hex: "#26303f" }] : []),
    ...PID_COLORS.map((c) => ({ token: c.token, label: c.label, hex: c.hex })),
  ];
  return (
    <Flex gap={1.5} flexWrap="wrap">
      {swatches.map(({ token, label, hex }) => (
        <Box
          key={token || "none"}
          as="button"
          aria-label={label}
          title={label}
          onClick={() => onChange(token)}
          w="18px"
          h="18px"
          borderRadius="full"
          bg={hex}
          border="2px solid"
          borderColor={value === token ? "text.primary" : "transparent"}
          cursor="pointer"
          transition="all 0.12s"
          _hover={{ transform: "scale(1.2)" }}
        />
      ))}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PidPropertiesPanelProps {
  cellId: string | null;
  graph: dia.Graph | null;
  sensors: SensorEntry[];
  actuators: ActuatorEntry[];
  systems: SystemRegistry;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PidPropertiesPanel({
  cellId,
  graph,
  sensors,
  actuators,
  systems,
}: PidPropertiesPanelProps) {
  const cell = cellId && graph ? graph.getCell(cellId) : null;
  const type = cell?.get("type") as string | undefined;

  // ---- Instrument state ---------------------------------------------------

  const [instBinding, setInstBinding] = useState("");
  const [instType, setInstType]       = useState("PT");
  const [instLabel, setInstLabel]     = useState("");
  const [instUnit, setInstUnit]       = useState("");
  const [instRangeMin, setInstRangeMin] = useState("0");
  const [instRangeMax, setInstRangeMax] = useState("100");

  // ---- Valve state --------------------------------------------------------

  const [valveBinding, setValveBinding]   = useState("");
  const [valveVariant, setValveVariant]   = useState<ValveVariant>("ball2");
  const [valveControllable, setValveControllable] = useState(false);
  const [valveLabel, setValveLabel]       = useState("");

  // ---- Vessel state -------------------------------------------------------

  const [vesselLabel, setVesselLabel]    = useState("");
  const [vesselContents, setVesselContents] = useState("");
  const [vesselWidth, setVesselWidth]    = useState("96");
  const [vesselHeight, setVesselHeight]  = useState("140");

  // ---- TextLabel state ----------------------------------------------------

  const [textLabelText, setTextLabelText] = useState("");

  // ---- SystemLink state ---------------------------------------------------

  const [linkSystemId, setLinkSystemId] = useState("");

  // ---- Colour token (shared across shape types) ---------------------------

  const [shapeColorToken, setShapeColorToken] = useState<string>("");

  // ---- TextLabel font size -------------------------------------------------

  const [textFontSize, setTextFontSize] = useState(10);

  // ---- ActuatorControl binding --------------------------------------------

  const [ctrlBinding, setCtrlBinding] = useState("");

  // ---- Device state -------------------------------------------------------

  const [deviceBinding, setDeviceBinding]           = useState("");
  const [deviceLabel, setDeviceLabel]               = useState("");
  const [deviceControllable, setDeviceControllable] = useState(false);

  // ---- Zone state ---------------------------------------------------------

  const [zoneLabel, setZoneLabel]   = useState("");
  const [zoneWidth, setZoneWidth]   = useState("200");
  const [zoneHeight, setZoneHeight] = useState("140");

  // ---- Init from cell on selection change ---------------------------------

  useEffect(() => {
    if (!cell) return;
    const t = cell.get("type") as string;

    // Common colour token (all shape types that support it)
    setShapeColorToken((cell.get("colorToken") as string | undefined) ?? "");

    if (t === "nova.Instrument") {
      const b = cell.get("binding") as { name: string } | undefined;
      const h = cell.get("hint") as { unit: string; range: [number, number] } | undefined;
      setInstBinding(b?.name ?? "");
      setInstType((cell.get("instrumentType") as string | undefined) ?? "PT");
      setInstLabel((cell.get("label") as string | undefined) ?? "");
      setInstUnit(h?.unit ?? "");
      setInstRangeMin(String(h?.range?.[0] ?? 0));
      setInstRangeMax(String(h?.range?.[1] ?? 100));
    } else if (t === "nova.Valve") {
      const b = cell.get("binding") as { name: string } | null;
      setValveBinding(b?.name ?? "");
      setValveVariant((cell.get("symbolVariant") as ValveVariant | undefined) ?? "ball2");
      setValveControllable((cell.get("controllable") as boolean | undefined) ?? false);
      setValveLabel((cell.get("label") as string | undefined) ?? "");
    } else if (VESSEL_TYPES.includes(t)) {
      setVesselLabel((cell.get("label") as string | undefined) ?? "");
      setVesselContents((cell.get("contentsLabel") as string | undefined) ?? "");
      const vs = (cell as dia.Element).size();
      setVesselWidth(String(vs.width));
      setVesselHeight(String(vs.height));
    } else if (t === "nova.Device") {
      const b = cell.get("binding") as { name: string } | null;
      setDeviceBinding(b?.name ?? "");
      setDeviceLabel((cell.get("label") as string | undefined) ?? "");
      setDeviceControllable((cell.get("controllable") as boolean | undefined) ?? false);
    } else if (t === "nova.Zone") {
      setZoneLabel((cell.get("label") as string | undefined) ?? "");
      const sz = (cell as dia.Element).size();
      setZoneWidth(String(sz.width));
      setZoneHeight(String(sz.height));
    } else if (t === "nova.TextLabel") {
      setTextLabelText(
        (cell.get("attrs") as Record<string, Record<string, unknown>> | undefined)?.["label"]?.["text"] as string ?? "",
      );
      setTextFontSize(
        (cell.get("attrs") as Record<string, Record<string, unknown>> | undefined)?.["label"]?.["fontSize"] as number ?? 10,
      );
    } else if (t === "nova.SystemLink") {
      setLinkSystemId((cell.get("systemId") as string | undefined) ?? "");
    } else if (t === "nova.ActuatorControl") {
      const b = cell.get("binding") as { name: string } | null;
      setCtrlBinding(b?.name ?? "");
    }
  }, [cellId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Setters that update both local state and the JointJS cell ----------

  const setInstrumentBinding = useCallback((name: string) => {
    setInstBinding(name);
    if (!cell) return;
    cell.set("binding", { name });
    // Auto-fill the display label from the binding name (#4).
    if (name) {
      setInstLabel(name);
      cell.set("label", name);
    }
    const matched = sensors.find((s) => s.name === name);
    (cell as NovaInstrument).setMissing(!matched);
    // Auto-populate hint fields from the matched sensor config.
    if (matched) {
      const unit     = matched.unit ?? "";
      const rangeMin = matched.range?.[0] ?? 0;
      const rangeMax = matched.range?.[1] ?? 100;
      setInstUnit(unit);
      setInstRangeMin(String(rangeMin));
      setInstRangeMax(String(rangeMax));
      cell.set("hint", { unit, range: [rangeMin, rangeMax] as [number, number] });
    }
    (cell as NovaInstrument).applyLabels();
  }, [cell, sensors]);

  const setInstrumentType = useCallback((code: string) => {
    setInstType(code);
    if (!cell) return;
    cell.set("instrumentType", code);
    (cell as NovaInstrument).applyLabels();
  }, [cell]);

  const setInstrumentLabel = useCallback((lbl: string) => {
    setInstLabel(lbl);
    if (!cell) return;
    cell.set("label", lbl);
    (cell as NovaInstrument).applyLabels();
  }, [cell]);

  const setInstrumentHint = useCallback((unit: string, min: number, max: number) => {
    if (!cell) return;
    cell.set("hint", { unit, range: [min, max] as [number, number] });
  }, [cell]);

  const setValveBindingFn = useCallback((name: string) => {
    setValveBinding(name);
    if (!cell) return;
    const valve = cell as NovaValve;
    valve.set("binding", name ? { name } : null);
    // Auto-fill the display label from the actuator name (#4).
    if (name) {
      setValveLabel(name);
      valve.set("label", name);
    }
    valve.setMissing(!!name && !actuators.some((a) => a.name === name));
    valve.applyLabels();
    // Keep the linked control row's binding in sync.
    const ctrlId = valve.get("controlId") as string | undefined;
    const ctrl = ctrlId && graph ? (graph.getCell(ctrlId) as NovaActuatorControl | undefined) : undefined;
    if (ctrl) {
      ctrl.set("binding", name ? { name } : null);
      ctrl.setName(null); // showName is false on valve-attached controls
      const entry = actuators.find((a) => a.name === name);
      if (entry) ctrl.applyButtons(controlButtonFaces(entry, null));
      else ctrl.clearButtons();
    }
  }, [cell, graph, actuators]);

  const setValveVariantFn = useCallback((v: ValveVariant) => {
    setValveVariant(v);
    if (!cell) return;
    cell.set("symbolVariant", v);
    (cell as NovaValve).applyLabels();
  }, [cell]);

  const setValveControllableFn = useCallback((c: boolean) => {
    setValveControllable(c);
    if (!cell || !graph) return;
    const valve = cell as NovaValve;
    valve.set("controllable", c);
    valve.applyLabels(); // hide/show the passive badge

    const existingId = valve.get("controlId") as string | undefined;
    if (c) {
      // Auto-create a separate control row beneath the valve (image 1).
      if (!existingId || !graph.getCell(existingId)) {
        const pos = valve.position();
        const sz  = valve.size();
        const binding = valve.get("binding") as { name: string } | null;
        const ctrl = new NovaActuatorControl({ binding, showName: false });
        ctrl.position(pos.x - 16, pos.y + sz.height + 2);
        const entry = binding?.name ? actuators.find((a) => a.name === binding.name) : undefined;
        if (entry) ctrl.applyButtons(controlButtonFaces(entry, null));
        graph.addCell(ctrl);
        valve.set("controlId", ctrl.id);
      }
    } else if (existingId) {
      graph.getCell(existingId)?.remove();
      valve.set("controlId", null);
    }
  }, [cell, graph, actuators]);

  const setValveLabelFn = useCallback((lbl: string) => {
    setValveLabel(lbl);
    if (!cell) return;
    cell.set("label", lbl);
    (cell as NovaValve).applyLabels();
  }, [cell]);

  const setVesselLabelFn = useCallback((lbl: string) => {
    setVesselLabel(lbl);
    if (!cell) return;
    cell.set("label", lbl);
    callApplyLabels(cell);
  }, [cell]);

  const setVesselContentsFn = useCallback((c: string) => {
    setVesselContents(c);
    if (!cell) return;
    cell.set("contentsLabel", c);
    callApplyLabels(cell);
  }, [cell]);

  const setVesselSizeFn = useCallback((w: number, h: number) => {
    if (!cell) return;
    (cell as dia.Element).resize(Math.max(30, w || 30), Math.max(30, h || 30));
  }, [cell]);

  const setTextLabelFn = useCallback((text: string) => {
    setTextLabelText(text);
    if (!cell) return;
    cell.attr("label/text", text);
  }, [cell]);

  const setLinkSystemFn = useCallback((sysId: string) => {
    setLinkSystemId(sysId);
    if (!cell) return;
    // systemId is now just a legend grouping; the visible colour comes from the
    // colorToken (set via the colour picker above), so we don't recolour here.
    cell.set("systemId", sysId);
  }, [cell]);

  const setColorTokenFn = useCallback((token: string) => {
    setShapeColorToken(token);
    if (!cell) return;
    cell.set("colorToken", token);
    if (cell.get("type") === "nova.SystemLink") {
      (cell as NovaSystemLink).applyColour();
    } else {
      callApplyLabels(cell);
    }
  }, [cell]);

  const setTextFontSizeFn = useCallback((v: number) => {
    const size = Math.max(8, Math.min(48, v || 10));
    setTextFontSize(size);
    if (!cell) return;
    cell.attr("label/fontSize", size);
    // Reposition baseline and grow the element box so larger text isn't clipped.
    cell.attr("label/y", size);
    (cell as NovaTextLabel).resize(Math.max(60, size * 8), size * 1.6);
  }, [cell]);

  const setZoneLabelFn = useCallback((lbl: string) => {
    setZoneLabel(lbl);
    if (!cell) return;
    cell.set("label", lbl);
    callApplyLabels(cell);
  }, [cell]);

  const setZoneSizeFn = useCallback((w: number, h: number) => {
    if (!cell) return;
    (cell as dia.Element).resize(Math.max(60, w || 60), Math.max(40, h || 40));
  }, [cell]);

  const setCtrlBindingFn = useCallback((name: string) => {
    setCtrlBinding(name);
    if (!cell) return;
    cell.set("binding", name ? { name } : null);
    const ctrl = cell as NovaActuatorControl;
    ctrl.setName(name || null);
    // Preview the correct buttons immediately in the editor.
    const entry = actuators.find((a) => a.name === name);
    if (entry) ctrl.applyButtons(controlButtonFaces(entry, null));
    else ctrl.clearButtons();
    ctrl.setMissing(!!name && !actuators.some((a) => a.name === name));
  }, [cell, actuators]);

  const setDeviceBindingFn = useCallback((name: string) => {
    setDeviceBinding(name);
    if (!cell) return;
    cell.set("binding", name ? { name } : null);
    if (name) {
      setDeviceLabel(name);
      cell.set("label", name);
    }
    (cell as NovaDevice).setMissing(!!name && !actuators.some((a) => a.name === name));
    (cell as NovaDevice).applyLabels();
  }, [cell, actuators]);

  const setDeviceLabelFn = useCallback((lbl: string) => {
    setDeviceLabel(lbl);
    if (!cell) return;
    cell.set("label", lbl);
    (cell as NovaDevice).applyLabels();
  }, [cell]);

  const setDeviceControllableFn = useCallback((c: boolean) => {
    setDeviceControllable(c);
    if (!cell) return;
    cell.set("controllable", c);
  }, [cell]);

  // ---- Nothing selected ---------------------------------------------------

  if (!cell || !type) {
    return (
      <Card title="Properties" w="260px" flexShrink={0}>
        <Box fontSize="xs" color="text.muted" textAlign="center" py={4}>
          Select a shape to edit its properties.
        </Box>
      </Card>
    );
  }

  // ---- Instrument panel ---------------------------------------------------

  if (type === "nova.Instrument") {
    const isMissing = instBinding !== "" && !sensors.some((s) => s.name === instBinding);
    const sensorNames = sensors.map((s) => s.name);

    return (
      <Card title="Instrument" w="260px" flexShrink={0}>
        <Box p={1}>
          {sectionLabel("Binding")}
          <FieldRow label="Sensor">
            <Flex direction="column" gap={1}>
              <StyledSelect
                value={instBinding}
                aria-label="Sensor binding"
                title="Sensor binding"
                onChange={(e) => setInstrumentBinding(e.target.value)}
                {...selectStyle}
              >
                <option value="">— none —</option>
                {sensorNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </StyledSelect>
              {isMissing && (
                <Chip status="warn">Not in config</Chip>
              )}
            </Flex>
          </FieldRow>

          {sectionLabel("Display")}
          <FieldRow label="Type code">
            <StyledSelect
              value={instType}
              aria-label="Instrument type code"
              title="Instrument type code"
              onChange={(e) => setInstrumentType(e.target.value)}
              {...selectStyle}
            >
              {INSTRUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </StyledSelect>
          </FieldRow>
          <FieldRow label="Label">
            <StyledInput
              value={instLabel}
              onChange={(e) => setInstrumentLabel(e.target.value)}
              placeholder="e.g. PGSO"
              {...inputStyle}
            />
          </FieldRow>

          {sectionLabel("Hint")}
          <FieldRow label="Unit">
            <StyledInput
              value={instUnit}
              onChange={(e) => {
                setInstUnit(e.target.value);
                setInstrumentHint(e.target.value, Number(instRangeMin), Number(instRangeMax));
              }}
              placeholder="psi"
              {...inputStyle}
            />
          </FieldRow>
          <FieldRow label="Range min">
            <StyledInput
              type="number"
              value={instRangeMin}
              onChange={(e) => {
                setInstRangeMin(e.target.value);
                setInstrumentHint(instUnit, Number(e.target.value), Number(instRangeMax));
              }}
              {...inputStyle}
            />
          </FieldRow>
          <FieldRow label="Range max">
            <StyledInput
              type="number"
              value={instRangeMax}
              onChange={(e) => {
                setInstRangeMax(e.target.value);
                setInstrumentHint(instUnit, Number(instRangeMin), Number(e.target.value));
              }}
              {...inputStyle}
            />
          </FieldRow>

          {sectionLabel("Colour")}
          <FieldRow label="Tint">
            <ColourPicker value={shapeColorToken} onChange={setColorTokenFn} />
          </FieldRow>
        </Box>
      </Card>
    );
  }

  // ---- Valve panel --------------------------------------------------------

  if (type === "nova.Valve") {
    const isMissing = valveBinding !== "" && !actuators.some((a) => a.name === valveBinding);
    const actuatorNames = actuators.map((a) => a.name);

    return (
      <Card title="Valve" w="260px" flexShrink={0}>
        <Box p={1}>
          {sectionLabel("Binding")}
          <FieldRow label="Actuator">
            <Flex direction="column" gap={1}>
              <StyledSelect
                value={valveBinding}
                aria-label="Actuator binding"
                title="Actuator binding"
                onChange={(e) => setValveBindingFn(e.target.value)}
                {...selectStyle}
              >
                <option value="">— none —</option>
                {actuatorNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </StyledSelect>
              {isMissing && (
                <Chip status="warn">Not in config</Chip>
              )}
            </Flex>
          </FieldRow>

          {sectionLabel("Display")}
          <FieldRow label="Label">
            <StyledInput
              value={valveLabel}
              onChange={(e) => setValveLabelFn(e.target.value)}
              placeholder="e.g. SVFTV"
              {...inputStyle}
            />
          </FieldRow>
          <FieldRow label="Symbol">
            <StyledSelect
              value={valveVariant}
              aria-label="Valve symbol variant"
              title="Valve symbol variant"
              onChange={(e) => setValveVariantFn(e.target.value as ValveVariant)}
              {...selectStyle}
            >
              {VALVE_VARIANTS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </StyledSelect>
          </FieldRow>

          {sectionLabel("Behaviour")}
          <FieldRow label="Controllable">
            <Flex
              as="button"
              align="center"
              gap={2}
              onClick={() => setValveControllableFn(!valveControllable)}
              cursor="pointer"
            >
              <Box
                w="32px"
                h="18px"
                borderRadius="full"
                bg={valveControllable ? "accent.solid" : "bg.surfaceRaised"}
                border="1px solid"
                borderColor={valveControllable ? "accent.solid" : "border.default"}
                transition="all 0.15s"
                position="relative"
              >
                <Box
                  position="absolute"
                  top="2px"
                  left={valveControllable ? "16px" : "2px"}
                  w="12px"
                  h="12px"
                  borderRadius="full"
                  bg="white"
                  transition="left 0.15s"
                />
              </Box>
              <Box fontSize="xs" color="text.muted">
                {valveControllable ? "Yes" : "No"}
              </Box>
            </Flex>
          </FieldRow>

          {sectionLabel("Colour")}
          <FieldRow label="Tint">
            <ColourPicker value={shapeColorToken} onChange={setColorTokenFn} />
          </FieldRow>
        </Box>
      </Card>
    );
  }

  // ---- Vessel / Bottle / Chamber panel ------------------------------------

  if (VESSEL_TYPES.includes(type)) {
    const title = type === "nova.Bottle" ? "Bottle" : type === "nova.Chamber" ? "Chamber" : "Vessel";
    return (
      <Card title={title} w="260px" flexShrink={0}>
        <Box p={1}>
          {sectionLabel("Display")}
          <FieldRow label="Name">
            <StyledInput
              value={vesselLabel}
              onChange={(e) => setVesselLabelFn(e.target.value)}
              placeholder="e.g. FUEL"
              {...inputStyle}
            />
          </FieldRow>
          <FieldRow label="Contents">
            <StyledInput
              value={vesselContents}
              onChange={(e) => setVesselContentsFn(e.target.value)}
              placeholder="e.g. IPA"
              {...inputStyle}
            />
          </FieldRow>

          {sectionLabel("Size")}
          <FieldRow label="Width">
            <StyledInput
              type="number" min={30}
              value={vesselWidth}
              onChange={(e) => { setVesselWidth(e.target.value); setVesselSizeFn(Number(e.target.value), Number(vesselHeight)); }}
              {...inputStyle}
            />
          </FieldRow>
          <FieldRow label="Height">
            <StyledInput
              type="number" min={30}
              value={vesselHeight}
              onChange={(e) => { setVesselHeight(e.target.value); setVesselSizeFn(Number(vesselWidth), Number(e.target.value)); }}
              {...inputStyle}
            />
          </FieldRow>
          <Box fontSize="2xs" color="text.muted" mb={1}>
            Tip: drag the corner handle to resize.
          </Box>

          {sectionLabel("Colour")}
          <FieldRow label="Tint">
            <ColourPicker value={shapeColorToken} onChange={setColorTokenFn} />
          </FieldRow>
        </Box>
      </Card>
    );
  }

  // ---- Device panel -------------------------------------------------------

  if (type === "nova.Device") {
    const isMissing = deviceBinding !== "" && !actuators.some((a) => a.name === deviceBinding);
    const actuatorNames = actuators.map((a) => a.name);
    return (
      <Card title="Device" w="260px" flexShrink={0}>
        <Box p={1}>
          {sectionLabel("Binding")}
          <FieldRow label="Actuator">
            <Flex direction="column" gap={1}>
              <StyledSelect
                value={deviceBinding}
                aria-label="Actuator binding"
                title="Actuator binding"
                onChange={(e) => setDeviceBindingFn(e.target.value)}
                {...selectStyle}
              >
                <option value="">— none —</option>
                {actuatorNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </StyledSelect>
              {isMissing && <Chip status="warn">Not in config</Chip>}
            </Flex>
          </FieldRow>

          {sectionLabel("Display")}
          <FieldRow label="Label">
            <StyledInput
              value={deviceLabel}
              onChange={(e) => setDeviceLabelFn(e.target.value)}
              placeholder="e.g. IMC1"
              {...inputStyle}
            />
          </FieldRow>

          {sectionLabel("Behaviour")}
          <FieldRow label="Controllable">
            <Flex
              as="button"
              align="center"
              gap={2}
              onClick={() => setDeviceControllableFn(!deviceControllable)}
              cursor="pointer"
            >
              <Box
                w="32px" h="18px" borderRadius="full"
                bg={deviceControllable ? "accent.solid" : "bg.surfaceRaised"}
                border="1px solid"
                borderColor={deviceControllable ? "accent.solid" : "border.default"}
                transition="all 0.15s" position="relative"
              >
                <Box
                  position="absolute" top="2px"
                  left={deviceControllable ? "16px" : "2px"}
                  w="12px" h="12px" borderRadius="full" bg="white"
                  transition="left 0.15s"
                />
              </Box>
              <Box fontSize="xs" color="text.muted">{deviceControllable ? "Yes" : "No"}</Box>
            </Flex>
          </FieldRow>

          {sectionLabel("Colour")}
          <FieldRow label="Tint">
            <ColourPicker value={shapeColorToken} onChange={setColorTokenFn} />
          </FieldRow>
        </Box>
      </Card>
    );
  }

  // ---- Zone panel ---------------------------------------------------------

  if (type === "nova.Zone") {
    return (
      <Card title="Zone" w="260px" flexShrink={0}>
        <Box p={1}>
          {sectionLabel("Display")}
          <FieldRow label="Label">
            <StyledInput
              value={zoneLabel}
              onChange={(e) => setZoneLabelFn(e.target.value)}
              placeholder="e.g. PRESSURANT"
              {...inputStyle}
            />
          </FieldRow>

          {sectionLabel("Size")}
          <FieldRow label="Width">
            <StyledInput
              type="number"
              min={60}
              value={zoneWidth}
              onChange={(e) => {
                setZoneWidth(e.target.value);
                setZoneSizeFn(Number(e.target.value), Number(zoneHeight));
              }}
              {...inputStyle}
            />
          </FieldRow>
          <FieldRow label="Height">
            <StyledInput
              type="number"
              min={40}
              value={zoneHeight}
              onChange={(e) => {
                setZoneHeight(e.target.value);
                setZoneSizeFn(Number(zoneWidth), Number(e.target.value));
              }}
              {...inputStyle}
            />
          </FieldRow>
          <Box fontSize="2xs" color="text.muted" mb={1}>
            Tip: drag the corner handle to resize.
          </Box>

          {sectionLabel("Colour")}
          <FieldRow label="Stroke">
            <ColourPicker value={shapeColorToken} onChange={setColorTokenFn} />
          </FieldRow>
        </Box>
      </Card>
    );
  }

  // ---- TextLabel panel ----------------------------------------------------

  if (type === "nova.TextLabel") {
    return (
      <Card title="Label" w="260px" flexShrink={0}>
        <Box p={1}>
          {sectionLabel("Text")}
          <StyledInput
            value={textLabelText}
            onChange={(e) => setTextLabelFn(e.target.value)}
            placeholder="e.g. ENGINE"
            {...inputStyle}
          />
          <FieldRow label="Size">
            <StyledInput
              type="number"
              min={8}
              max={24}
              value={textFontSize}
              onChange={(e) => setTextFontSizeFn(Number(e.target.value))}
              {...inputStyle}
            />
          </FieldRow>

          {sectionLabel("Colour")}
          <FieldRow label="Tint">
            <ColourPicker value={shapeColorToken} onChange={setColorTokenFn} />
          </FieldRow>
        </Box>
      </Card>
    );
  }

  // ---- ActuatorControl panel ----------------------------------------------

  if (type === "nova.ActuatorControl") {
    const actuatorNames = actuators.map((a) => a.name);
    return (
      <Card title="Control Widget" w="260px" flexShrink={0}>
        <Box p={1}>
          {sectionLabel("Binding")}
          <FieldRow label="Actuator">
            <StyledSelect
              value={ctrlBinding}
              aria-label="Actuator binding"
              title="Actuator binding"
              onChange={(e) => setCtrlBindingFn(e.target.value)}
              {...selectStyle}
            >
              <option value="">— none —</option>
              {actuatorNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </StyledSelect>
          </FieldRow>
        </Box>
      </Card>
    );
  }

  // ---- SystemLink (pipe) panel --------------------------------------------

  if (type === "nova.SystemLink") {
    return (
      <Card title="Pipe" w="260px" flexShrink={0}>
        <Box p={1}>
          {sectionLabel("Colour")}
          <FieldRow label="Line">
            <ColourPicker value={shapeColorToken} onChange={setColorTokenFn} allowNone={false} />
          </FieldRow>

          {sectionLabel("System (legend)")}
          <FieldRow label="System">
            <StyledSelect
              value={linkSystemId}
              aria-label="Pipe system"
              title="Pipe system grouping (legend)"
              onChange={(e) => setLinkSystemFn(e.target.value)}
              {...selectStyle}
            >
              <option value="">— none —</option>
              {Object.entries(systems).map(([id, def]) => (
                <option key={id} value={id}>{def.label}</option>
              ))}
            </StyledSelect>
          </FieldRow>
        </Box>
      </Card>
    );
  }

  // ---- Unknown type -------------------------------------------------------

  return (
    <Card title="Properties" w="260px" flexShrink={0}>
      <Box fontSize="xs" color="text.muted" p={1}>
        <Mono>{type}</Mono>
      </Box>
    </Card>
  );
}
