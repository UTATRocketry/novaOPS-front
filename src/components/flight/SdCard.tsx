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

/** Preset decimation divisors shown in the dropdown. */
const RATE_PRESETS = [
  { label: "Full rate (÷1)",   value: 1   },
  { label: "Half rate (÷2)",   value: 2   },
  { label: "÷5",               value: 5   },
  { label: "÷10",              value: 10  },
  { label: "÷20",              value: 20  },
  { label: "÷50",              value: 50  },
  { label: "÷100",             value: 100 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sdStatusTone(sd: FmcSdStatus): "nominal" | "warn" | "fault" {
  if (sd.err) return "fault";
  const name = (sd.stateName ?? "").toLowerCase();
  if (name.includes("full") || name.includes("error") || name.includes("stall")) return "fault";
  if (name.includes("near") || name.includes("warn")) return "warn";
  return "nominal";
}

function isFull(sd: FmcSdStatus | undefined): boolean {
  if (!sd) return false;
  const name = (sd.stateName ?? "").toLowerCase();
  return name === "full" || (sd.freeMb != null && sd.freeMb === 0);
}

// ---------------------------------------------------------------------------
// Full-card warning dialog
// ---------------------------------------------------------------------------

interface FullDialogProps {
  open: boolean;
  onClear: () => void;
  onDismiss: () => void;
  clearing: boolean;
}

function SdFullDialog({ open, onClear, onDismiss, clearing }: FullDialogProps) {
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
                The FMC SD card is full. No new flight data will be logged until
                the card is cleared (reformatted).
              </Text>
              <Text fontSize="xs" color="text.muted">
                Clearing is destructive — all data on the card will be erased.
                Download any recordings you need before proceeding.
              </Text>
            </Dialog.Body>

            <Dialog.Footer gap={2}>
              <Button variant="outline" size="sm" onClick={onDismiss} disabled={clearing}>
                Leave Full
              </Button>
              <Button
                colorPalette="red"
                size="sm"
                onClick={onClear}
                loading={clearing}
              >
                Clear Card
              </Button>
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild>
              <Box
                as="button"
                position="absolute"
                top={3}
                right={3}
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

  const [divisor, setDivisor]       = useState(1);
  const [cmdStatus, setCmdStatus]   = useState<string | null>(null);
  const [clearing, setClearing]     = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Auto-open the full-card warning once per full event.
  const wasFullRef = useRef(false);
  useEffect(() => {
    const full = isFull(sd);
    if (full && !wasFullRef.current) {
      setShowWarning(true);
    }
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

  const tone = sd ? sdStatusTone(sd) : "neutral";

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
                bg="transparent"
                border="none"
                p={0}
                cursor="pointer"
                display="flex"
                alignItems="center"
              >
                <Icon name="sd_card_alert" size={16} color="fault" />
              </Box>
            )}
          </Flex>
        }
      >
        <Flex direction="column" gap={3}>

          {/* State */}
          <Flex align="center" gap={2}>
            <Text fontSize="xs" color="text.muted" minW="72px">State</Text>
            {sd ? (
              <Chip status={tone}>
                <Mono>{sd.stateName ?? String(sd.state ?? "—")}</Mono>
              </Chip>
            ) : (
              <Mono color="text.muted">—</Mono>
            )}
          </Flex>

          {/* Free space */}
          <Flex align="center" gap={2}>
            <Text fontSize="xs" color="text.muted" minW="72px">Free</Text>
            <Mono fontSize="xs">
              {sd?.freeMb != null ? `${sd.freeMb} MB` : "—"}
            </Mono>
          </Flex>

          {/* Written */}
          <Flex align="center" gap={2}>
            <Text fontSize="xs" color="text.muted" minW="72px">Written</Text>
            <Mono fontSize="xs">
              {sd?.writtenKb != null ? `${sd.writtenKb} KB` : "—"}
            </Mono>
          </Flex>

          {/* Error */}
          {sd?.err ? (
            <Flex align="center" gap={2}>
              <Text fontSize="xs" color="text.muted" minW="72px">Error</Text>
              <Mono fontSize="xs" color="fault">{sd.err}</Mono>
            </Flex>
          ) : null}

          {/* Controls */}
          {canCommand && (
            <Flex direction="column" gap={2} pt={2} borderTop="1px solid" borderColor="border.default">

              {/* Log rate row */}
              <Flex align="center" gap={2}>
                <Text fontSize="xs" color="text.muted" flexShrink={0}>Log rate</Text>
                <NativeSelect.Root size="xs" flex="1">
                  <NativeSelect.Field
                    value={divisor}
                    onChange={(e) => setDivisor(Number(e.target.value))}
                    fontFamily="mono"
                  >
                    {RATE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleSetRate}
                  disabled={!clientId}
                  flexShrink={0}
                >
                  Set
                </Button>
              </Flex>

              {/* Clear row */}
              {!confirmClear ? (
                <Button
                  size="xs"
                  variant="outline"
                  colorPalette="red"
                  onClick={() => setConfirmClear(true)}
                  disabled={!clientId}
                >
                  Clear Card
                </Button>
              ) : (
                <Flex gap={2} align="center">
                  <Text fontSize="xs" color="fault" flex="1">Erase all data?</Text>
                  <Button
                    size="xs"
                    colorPalette="red"
                    onClick={handleClear}
                    disabled={!clientId}
                    loading={clearing}
                  >
                    Yes, Erase
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </Button>
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
