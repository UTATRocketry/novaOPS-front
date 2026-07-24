"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  Flex,
  NativeSelect,
  Portal,
  Text,
} from "@chakra-ui/react";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import { useNovaStore } from "@/lib/store/store";
import { sel } from "@/lib/store/selectors";
import { sendFasSd } from "@/lib/api/direct";
import type { FmcSdStatus } from "@/lib/flight/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATE_PRESETS = [
  { label: "Full rate",         value: 1   },
  { label: "Half rate",         value: 2   },
  { label: "1:5",               value: 5   },
  { label: "1:10",              value: 10  },
  { label: "1:20",              value: 20  },
  { label: "1:50",              value: 50  },
  { label: "1:100",             value: 100 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sdTone(sd: FmcSdStatus): "nominal" | "warn" | "fault" {
  if (sd.err || sd.full || sd.stalled) return "fault";
  const name = (sd.stateName ?? "").toLowerCase();
  if (name === "error" || name === "full") return "fault";
  if (sd.nearFull || sd.rateReduced || name === "near_full") return "warn";
  if (sd.logging || name === "logging") return "nominal";
  return "neutral" as "nominal"; // absent / mounted / no-fs
}

function isFull(sd: FmcSdStatus | undefined): boolean {
  if (!sd) return false;
  return sd.full === true || (sd.stateName ?? "").toLowerCase() === "full";
}

function rateDivLabel(rateDiv: number | null | undefined): string {
  if (rateDiv == null) return "—";
  if (rateDiv === 0 || rateDiv === null) return "custom";
  return `÷${rateDiv}${rateDiv === 1 ? " (full)" : ""}`;
}

// ---------------------------------------------------------------------------
// Full-card warning dialog
// ---------------------------------------------------------------------------

function SdFullDialog({
  open, onClear, onDismiss, clearing,
}: {
  open: boolean;
  onClear: () => void;
  onDismiss: () => void;
  clearing: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={({ open: o }) => { if (!o) onDismiss(); }}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="400px">
            <Dialog.Header>
              <Flex align="center" gap={2}>
                <Icon name="sd_card_alert" size={20} color="fault" />
                <Dialog.Title>SD Card Full</Dialog.Title>
              </Flex>
            </Dialog.Header>
            <Dialog.Body>
              <Text fontSize="sm" color="text.primary" mb={3}>
                The FMC SD card is full — no new flight data will be logged until
                the card is cleared (reformatted).
              </Text>
              <Text fontSize="xs" color="text.muted">
                Clearing is destructive. Download any recordings you need before
                proceeding.
              </Text>
            </Dialog.Body>
            <Dialog.Footer gap={2}>
              <Button variant="outline" size="sm" onClick={onDismiss} disabled={clearing}>
                Leave Full
              </Button>
              <Button colorPalette="red" size="sm" onClick={onClear} loading={clearing}>
                Clear Card
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <Box
                as="button"
                position="absolute"
                top={3} right={3}
                p={1}
                borderRadius="control"
                color="text.muted"
                _hover={{ color: "text.primary" }}
                border="none"
                bg="transparent"
                cursor="pointer"
                onClick={onDismiss}
              >
                <Icon name="close" size={16} />
              </Box>
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// SdCard
// ---------------------------------------------------------------------------

export interface SdCardProps {
  sd?: FmcSdStatus;
  node?: string;
}

export function SdCard({ sd, node = "FMC_0" }: SdCardProps) {
  const clientId   = useNovaStore(sel.clientId);
  const role       = useNovaStore(sel.sessionRole);
  const canCommand = role === "operator" || role === "admin";

  const [divisor, setDivisor]           = useState(1);
  const [cmdStatus, setCmdStatus]       = useState<string | null>(null);
  const [clearing, setClearing]         = useState(false);
  const [showWarning, setShowWarning]   = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Auto-open the warning once per transition into the full state.
  const wasFullRef = useRef(false);
  useEffect(() => {
    const full = isFull(sd);
    if (full && !wasFullRef.current) setShowWarning(true);
    wasFullRef.current = full;
  }, [sd]);

  async function handleSetRate() {
    if (!clientId) return;
    try {
      await sendFasSd({ node, action: "set_rate", divisor }, clientId);
      setCmdStatus(`Rate set to ÷${divisor}`);
    } catch (e) {
      setCmdStatus(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleClear() {
    if (!clientId) return;
    setClearing(true);
    try {
      await sendFasSd({ node, action: "clear" }, clientId);
      setCmdStatus("SD card cleared");
      setConfirmClear(false);
      setShowWarning(false);
    } catch (e) {
      setCmdStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setClearing(false);
    }
  }

  const tone = sd ? sdTone(sd) : "neutral";

  // Capacity bar (only when pct known)
  const pct = sd?.pctUsed;
  const barColor = (pct ?? 0) >= 95 ? "fault" : (pct ?? 0) >= 80 ? "warn" : "nominal";

  return (
    <>
      <SdFullDialog
        open={showWarning}
        onClear={handleClear}
        onDismiss={() => setShowWarning(false)}
        clearing={clearing}
      />

      <Card
        title={
          <Flex align="center" gap={2}>
            <Text>SD Logger</Text>
            {isFull(sd) && (
              <Box
                as="button"
                onClick={() => setShowWarning(true)}
                bg="transparent" border="none" p={0}
                cursor="pointer" display="flex" alignItems="center"
              >
                <Icon name="sd_card_alert" size={16} color="fault" />
              </Box>
            )}
          </Flex>
        }
      >
        <Flex direction="column" gap={2}>

          {/* State + logging badge */}
          <Flex align="center" justify="space-between">
            <Chip status={tone as Parameters<typeof Chip>[0]["status"]}>
              <Mono>{sd?.stateName ?? "—"}</Mono>
            </Chip>
            {sd?.logging != null && (
              <Chip status={sd.logging ? "nominal" : "neutral"}>
                {sd.logging ? "logging" : "idle"}
              </Chip>
            )}
          </Flex>

          {/* Capacity bar */}
          {pct != null && (
            <Box>
              <Flex justify="space-between" mb={1}>
                <Text fontSize="2xs" color="text.muted">Used</Text>
                <Mono fontSize="2xs" color="text.muted">
                  {pct}% · {sd?.freeMb ?? "—"} MB free
                  {sd?.totalMb != null ? ` / ${sd.totalMb} MB` : ""}
                </Mono>
              </Flex>
              <Box h="4px" bg="bg.surfaceRaised" borderRadius="full" overflow="hidden">
                <Box
                  h="100%"
                  w={`${pct}%`}
                  bg={barColor}
                  borderRadius="full"
                  style={{ transition: "width 400ms ease" }}
                />
              </Box>
            </Box>
          )}

          {/* Log rate — visible to everyone */}
          <Flex align="center" justify="space-between">
            <Text fontSize="xs" color="text.muted">Log rate</Text>
            <Mono fontSize="xs">{rateDivLabel(sd?.rateDiv)}</Mono>
          </Flex>

          {/* Warnings */}
          {sd?.stalled && (
            <Chip status="fault"><Mono>stalled</Mono></Chip>
          )}
          {sd?.rateReduced && !sd?.stalled && (
            <Chip status="warn"><Mono>rate reduced</Mono></Chip>
          )}

          {/* Error code */}
          {sd?.err ? (
            <Flex align="center" justify="space-between">
              <Text fontSize="xs" color="text.muted">Error</Text>
              <Mono fontSize="xs" color="fault">{sd.err}</Mono>
            </Flex>
          ) : null}

          {/* Operator controls */}
          {canCommand && (
            <Flex direction="column" gap={2} pt={2} borderTop="1px solid" borderColor="border.default">

              {/* Log rate control */}
              <Flex align="center" gap={2}>
                <Text fontSize="xs" color="text.muted" flexShrink={0}>Set rate</Text>
                <NativeSelect.Root size="xs" flex="1">
                  <NativeSelect.Field
                    value={divisor}
                    onChange={(e) => setDivisor(Number(e.target.value))}
                    fontFamily="mono"
                  >
                    {RATE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                <Button size="xs" variant="outline" onClick={handleSetRate} disabled={!clientId} flexShrink={0}>
                  Apply
                </Button>
              </Flex>

              {/* Clear */}
              {!confirmClear ? (
                <Button size="xs" variant="outline" colorPalette="red" onClick={() => setConfirmClear(true)} disabled={!clientId}>
                  Clear Card
                </Button>
              ) : (
                <Flex gap={2} align="center">
                  <Text fontSize="xs" color="fault" flex="1">Erase all data?</Text>
                  <Button size="xs" colorPalette="red" onClick={handleClear} disabled={!clientId} loading={clearing}>
                    Yes, Erase
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
                </Flex>
              )}
            </Flex>
          )}

          {cmdStatus && (
            <Text fontSize="xs" fontFamily="mono" color="text.muted">{cmdStatus}</Text>
          )}
        </Flex>
      </Card>
    </>
  );
}
