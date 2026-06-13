"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { PageHeader } from "@/components/shell";
import {
  PidCanvas,
  EngineTable,
  GaugeStrip,
  EngineSidebar,
  PidEditor,
  type PidEditorHandle,
} from "@/components/engine";
import { PillTabs } from "@/components/primitives";
import { useConfig } from "@/hooks";
import type { TabItem } from "@/components/primitives";
import type { NovaPidLayout } from "@/lib/pid/serializer";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { getPidLayout, putPidLayout } from "@/lib/api";
import { UnderConstruction } from "@/components/primitives";
import { EnginePlots } from "@/components/engine/EnginePlots";

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

type EngineView = "pid" | "plots" | "table";

const VIEW_TABS: TabItem[] = [
  { value: "pid",   label: "P&ID"  },
  { value: "plots", label: "Plots" },
  { value: "table", label: "Table" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EnginePage() {
  const { data: config } = useConfig();
  const [view, setView]           = useState<EngineView>("pid");
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Layout lives in the store (pushed by WS broadcast or seeded from REST).
  // null in store → PidCanvas/PidEditor uses DEFAULT_LAYOUT.
  const wsLayout = useNovaStore(sel.pidLayout);
  const clientId = useNovaStore(sel.clientId);

  const sensors   = config?.Sensors   ?? [];
  const actuators = config?.Actuators ?? [];

  // Editor ref — lets us auto-serialize when leaving edit mode
  const editorRef = useRef<PidEditorHandle | null>(null);

  // Seed layout from REST on mount (before any WS push arrives).
  useEffect(() => {
    getPidLayout().then((layout) => {
      if (layout) useNovaStore.getState().ingestPidLayout(layout);
    });
  }, []);

  const handleEditToggle = useCallback(async () => {
    if (isEditing && editorRef.current) {
      const saved = editorRef.current.serialize("P&ID Layout");
      if (saved) {
        setSaveError(null);
        try {
          await putPidLayout(saved, clientId ?? "");
          // WS broadcast fans layout to all clients including self via store.ingestPidLayout
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Save failed";
          setSaveError(msg);
          // Still update local store so this client sees the edit immediately
          useNovaStore.getState().ingestPidLayout(saved);
        }
      }
    }
    setIsEditing((e) => !e);
  }, [isEditing, clientId]);

  return (
    <Box>
      <PageHeader
        title="Engine"
        subtitle={isEditing ? "P&ID · edit" : "P&ID · live"}
        action={
          <Flex align="center" gap={2}>
            {saveError && (
              <Box fontSize="xs" fontFamily="mono" color="var(--chakra-colors-fault)" px={2}>
                Save failed: {saveError}
              </Box>
            )}
            {view === "pid" && (
              <Box
                as="button"
                onClick={handleEditToggle}
                px={3}
                py={1.5}
                fontSize="xs"
                fontFamily="mono"
                fontWeight="600"
                borderRadius="control"
                border="1px solid"
                borderColor={isEditing ? "accent.solid" : "border.default"}
                bg={isEditing ? "accent.solid" : "transparent"}
                color={isEditing ? "white" : "text.muted"}
                cursor="pointer"
                transition="all 0.15s"
                _hover={isEditing ? { opacity: 0.85 } : { borderColor: "accent.solid", color: "accent.solid" }}
              >
                {isEditing ? "← Live" : "Edit P&ID"}
              </Box>
            )}
            {!isEditing && (
              <PillTabs
                items={VIEW_TABS}
                value={view}
                onChange={(v) => setView(v as EngineView)}
              />
            )}
          </Flex>
        }
      />

      {/* P&ID view — live */}
      {view === "pid" && !isEditing && (
        <Box>
          <Flex gap={4} align="flex-start">
            <Box flex={1} minW={0}>
              <PidCanvas
                layout={wsLayout ?? undefined}
                mode="live"
                sensors={sensors}
                actuators={actuators}
                safetyRules={config?.safetyRules}
                height={600}
              />
              <GaugeStrip sensors={sensors} />
            </Box>
            <EngineSidebar />
          </Flex>
        </Box>
      )}

      {/* P&ID view — edit */}
      {view === "pid" && isEditing && (
        <PidEditor
          ref={editorRef}
          layout={wsLayout ?? undefined}
          sensors={sensors}
          actuators={actuators}
          height={600}
          onLayoutChange={(layout: NovaPidLayout) => {
            // Update store locally while editing (without broadcast — that's on save)
            useNovaStore.getState().ingestPidLayout(layout);
          }}
        />
      )}

      {view === "plots" && !isEditing && (
        <EnginePlots sensors={sensors} />
      )}

      {view === "table" && !isEditing && (
        <EngineTable sensors={sensors} actuators={actuators} />
      )}
    </Box>
  );
}
