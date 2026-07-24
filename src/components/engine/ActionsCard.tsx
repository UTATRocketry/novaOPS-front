"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Flex, chakra } from "@chakra-ui/react";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { cssVar } from "@/lib/helpers";
import {
  startRecording,
  stopRecording,
  getRecordingStatus,
  toggleCalibration,
  getCalibrationStatus,
  downloadData,
  reloadConfig,
} from "@/lib/api";


// ---------------------------------------------------------------------------
// Actions card
// ---------------------------------------------------------------------------

interface ActionButtonProps {
  label: string;
  icon: string;
  description: string;
  onClick: () => void;
  busy?: boolean;
  /** Render in a "danger/active" tone (e.g. recording is live). */
  active?: boolean;
}

function ActionButton({
  label,
  icon,
  description,
  onClick,
  busy = false,
  active = false,
}: ActionButtonProps) {
  return (
    <Box
      as="button"
      w="100%"
      textAlign="left"
      px={3}
      py={2}
      borderRadius="control"
      border="1px solid"
      borderColor={active ? "nominal" : "border.default"}
      bg={
        active
          ? `color-mix(in srgb, ${cssVar("nominal")} 12%, transparent)`
          : "transparent"
      }
      cursor={busy ? "wait" : "pointer"}
      opacity={busy ? 0.6 : 1}
      aria-disabled={busy}
      onClick={busy ? undefined : onClick}
      transition="all 0.15s"
      _hover={
        busy
          ? {}
          : active
            ? { bg: `color-mix(in srgb, ${cssVar("nominal")} 20%, transparent)` }
            : {
                borderColor: "accent.solid",
                bg: `color-mix(in srgb, ${cssVar("accent.solid")} 8%, transparent)`,
              }
      }
    >
      <Flex align="center" gap={2}>
        <Icon name={icon} size={16} color={active ? "nominal" : "text.muted"} />
        <Box flex={1}>
          <Mono
            fontSize="xs"
            fontWeight="600"
            display="block"
            color={active ? "nominal" : "text.primary"}
          >
            {label}
          </Mono>
          <Box fontSize="2xs" color="text.muted" mt={0.5}>
            {description}
          </Box>
        </Box>
      </Flex>
    </Box>
  );
}

export function ActionsCard() {
  const clientId = useNovaStore(sel.clientId);

  const [recording, setRecording] = useState(false);
  const [calibration, setCalibration] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed state from backend on mount — swallow errors silently if unavailable.
  useEffect(() => {
    getRecordingStatus()
      .then((s) => setRecording(s.enabled))
      .catch(() => {});
    getCalibrationStatus()
      .then((s) => setCalibration(s.enabled))
      .catch(() => {});
  }, []);

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const onToggleRecording = () =>
    run("recording", async () => {
      const res = recording
        ? await stopRecording(clientId ?? "")
        : await startRecording(clientId ?? "");
      setRecording(res.enabled);
    });

  const onReloadConfig = () =>
    run("reload", async () => {
      await reloadConfig();
    });

  const onDownload = () =>
    run("download", async () => {
      await downloadData();
    });

  const onToggleCalibration = () =>
    run("calibration", async () => {
      const res = await toggleCalibration(clientId ?? "", !calibration);
      setCalibration(res.enabled);
    });

  return (
    <Card title="Actions">
      <Flex direction="column" gap={2}>
        <ActionButton
          label={recording ? "Stop recording" : "Start recording"}
          icon={recording ? "stop_circle" : "fiber_manual_record"}
          description={recording ? "Recording in progress" : "Begin saving data"}
          onClick={onToggleRecording}
          busy={busy === "recording"}
          active={recording}
        />
        <ActionButton
          label="Reload config"
          icon="refresh"
          description="Re-read config from disk"
          onClick={onReloadConfig}
          busy={busy === "reload"}
        />
        <ActionButton
          label="Download data"
          icon="download"
          description="Save recorded data set"
          onClick={onDownload}
          busy={busy === "download"}
        />
        <ActionButton
          label="Toggle calibration"
          icon="tune"
          description={calibration ? "Calibration: on" : "Calibration: off"}
          onClick={onToggleCalibration}
          busy={busy === "calibration"}
          active={calibration}
        />
      </Flex>

      {error && (
        <Box mt={2.5} fontSize="2xs" fontFamily="mono" color="fault">
          {error}
        </Box>
      )}
    </Card>
  );
}