"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Flex, Spinner, Text } from "@chakra-ui/react";
import { PageHeader } from "@/components/shell";
import { PillTabs, Chip } from "@/components/primitives";
import type { TabItem } from "@/components/primitives";
import {
  ConfigActionBar,
  ActuatorsTable,
  SensorsTable,
  RulesTable,
  DevicesTable,
  PacketsTable,
  ProceduresTable,
  BuzzerMelodiesTable,
} from "@/components/config";
import { useConfig, usePutConfig, useUploadConfig } from "@/hooks/useConfig";
import { validateConfig } from "@/lib/config";
import type { SystemConfig } from "@/lib/types";

/** A blank config to start a brand-new file from. */
const EMPTY_CONFIG: SystemConfig = {
  Sensors: [],
  Actuators: [],
  Commands: {},
  safetyRules: { critical: [], hazardous: [] },
  Devices: [],
  Packets: [],
  Procedures: [],
  BuzzerMelodies: {},
};

type ConfigView = "actuators" | "sensors" | "devices" | "packets" | "procedures" | "other";

const VIEW_TABS: TabItem[] = [
  { value: "actuators",  label: "Actuators"  },
  { value: "sensors",    label: "Sensors"    },
  { value: "devices",    label: "Devices"    },
  { value: "packets",    label: "Packets"    },
  { value: "procedures", label: "Procedures" },
  { value: "other",      label: "Other"      },
];

/** Structured deep clone of the config so edits never mutate the query cache. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export default function ConfigPage() {
  const { data: config, isLoading, isError, error } = useConfig();
  const putConfig = usePutConfig();
  const uploadConfig = useUploadConfig();

  const [view, setView] = useState<ConfigView>("actuators");
  const [draft, setDraft] = useState<SystemConfig | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Non-null when authoring a brand-new config file (uploaded on Update).
  const [createName, setCreateName] = useState<string | null>(null);

  // Reset the editable draft whenever a fresh server config arrives — but not
  // while authoring a new file (don't clobber the blank draft being edited).
  useEffect(() => {
    if (config && createName === null) setDraft(clone(config));
  }, [config, createName]);

  const validationErrors = useMemo(
    () => (draft ? validateConfig(draft) : []),
    [draft],
  );

  const isDirty = useMemo(() => {
    if (createName !== null) return true; // a new file is always "pending save"
    return draft && config ? JSON.stringify(draft) !== JSON.stringify(config) : false;
  }, [draft, config, createName]);

  // ---- Mutator (clear the "saved" flag on any edit) ----
  function setBackend(next: SystemConfig) {
    setDraft(next);
    setSaveOk(false);
  }

  function startNew() {
    setSaveError(null);
    setSaveOk(false);
    setCreateName("new_config.yaml");
    setDraft(clone(EMPTY_CONFIG));
  }

  function cancelNew() {
    setCreateName(null);
    setDraft(config ? clone(config) : null);
    setSaveError(null);
  }

  function handleUpdate() {
    if (!draft) return;
    setSaveError(null);
    const errs = validateConfig(draft);
    if (errs.length) return; // button is gated on this too

    // New file → serialize the draft (JSON is valid YAML) and upload it as a
    // named file. The backend persists + activates it and broadcasts config_update.
    if (createName !== null) {
      const name = /\.ya?ml$/i.test(createName) ? createName : `${createName}.yaml`;
      const file = new File([JSON.stringify(draft, null, 2)], name, { type: "application/x-yaml" });
      uploadConfig.mutate(file, {
        onSuccess: () => { setSaveOk(true); setCreateName(null); },
        onError: (e: unknown) => setSaveError(e instanceof Error ? e.message : "Create failed"),
      });
      return;
    }

    // Existing config → PUT (replaces active config); broadcast updates the cache.
    putConfig.mutate(draft, {
      onSuccess: () => setSaveOk(true),
      onError: (e: unknown) => setSaveError(e instanceof Error ? e.message : "Update failed"),
    });
  }

  return (
    <Box>
      <PageHeader
        title="Config"
        subtitle="System configuration · the only writer to backend config"
        action={
          <PillTabs items={VIEW_TABS} value={view} onChange={(v) => setView(v as ConfigView)} />
        }
      />

      <ConfigActionBar
        onUpdate={handleUpdate}
        isDirty={isDirty}
        isSaving={putConfig.isPending || uploadConfig.isPending}
        saveError={saveError}
        saveOk={saveOk}
        validationErrorCount={validationErrors.length}
        creatingName={createName}
        onNew={startNew}
        onCreateNameChange={setCreateName}
        onCancelNew={cancelNew}
      />

      {/* Validation detail */}
      {validationErrors.length > 0 && (
        <Flex direction="column" gap={1} mb={4} p={3} borderRadius="card" border="1px solid" borderColor="fault" bg="color-mix(in srgb, var(--chakra-colors-fault) 8%, transparent)">
          {validationErrors.slice(0, 8).map((e, i) => (
            <Text key={i} fontSize="xs" color="fault" fontFamily="mono">• {e}</Text>
          ))}
          {validationErrors.length > 8 && (
            <Text fontSize="xs" color="text.muted">+{validationErrors.length - 8} more…</Text>
          )}
        </Flex>
      )}

      {/* Body */}
      {isLoading || !draft ? (
        <Flex align="center" gap={2} color="text.muted" py={10} justify="center">
          <Spinner size="sm" /> <Text fontSize="sm">Loading config…</Text>
        </Flex>
      ) : isError ? (
        <Flex direction="column" gap={2} py={10} align="center">
          <Chip status="fault">{error instanceof Error ? error.message : "Failed to load config"}</Chip>
        </Flex>
      ) : (
        <>
          {view === "actuators" && (
            <ActuatorsTable
              actuators={draft.Actuators ?? []}
              onChange={(Actuators) => setBackend({ ...draft, Actuators })}
            />
          )}
          {view === "sensors" && (
            <SensorsTable
              sensors={draft.Sensors ?? []}
              onChange={(Sensors) => setBackend({ ...draft, Sensors })}
            />
          )}
          {view === "devices" && (
            <DevicesTable
              devices={draft.Devices ?? []}
              onChange={(Devices) => setBackend({ ...draft, Devices })}
            />
          )}
          {view === "packets" && (
            <PacketsTable
              packets={draft.Packets ?? []}
              onChange={(Packets) => setBackend({ ...draft, Packets })}
            />
          )}
          {view === "procedures" && (
            <ProceduresTable
              procedures={draft.Procedures ?? []}
              onChange={(Procedures) => setBackend({ ...draft, Procedures })}
            />
          )}
          {view === "other" && (
            <>
              <RulesTable
                rules={draft.safetyRules ?? {}}
                onChange={(safetyRules) => setBackend({ ...draft, safetyRules })}
              />
              <Box mt={4}>
                <BuzzerMelodiesTable
                  melodies={draft.BuzzerMelodies ?? {}}
                  onChange={(BuzzerMelodies) => setBackend({ ...draft, BuzzerMelodies })}
                />
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
}
