"use client";

import { useEffect, useState } from "react";
import { Box, Button, Dialog, Flex, IconButton, Input, NativeSelect, Portal, Text } from "@chakra-ui/react";
import { Chip, Icon, Mono, StatusDot } from "@/components/primitives";
import { useFasLink, FAS_BAUD_RATES, FAS_DEFAULT_BAUD } from "@/hooks";
import { describeLink } from "@/lib/console";

/** Sentinel select value that reveals the free-text port field. */
const CUSTOM = "__custom__";

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

interface FasLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function FasLinkDialog({ isOpen, onClose }: FasLinkDialogProps) {
  const {
    link, ports, streaming, canControl, gateReason, busy,
    refreshPorts, refreshStatus, connect, disconnect,
  } = useFasLink();

  const [selected, setSelected] = useState<string>("");
  const [customPort, setCustomPort] = useState<string>("");
  const [baud, setBaud] = useState<number>(FAS_DEFAULT_BAUD);

  // On open, ask the bridge for its port list and current link state — the
  // suggested console flow. Skipped without the role to issue the commands.
  useEffect(() => {
    if (!isOpen || !canControl) return;
    void refreshPorts();
    void refreshStatus();
    // Fire once per open; refreshPorts/refreshStatus are stable per session.
  }, [isOpen, canControl, refreshPorts, refreshStatus]);

  // Default the picker to the port the bridge is already on, then to the first
  // enumerated one. Never auto-picks over a choice the operator has made.
  useEffect(() => {
    if (selected !== "") return;
    if (link?.port) setSelected(link.port);
    else if (ports && ports.length > 0) setSelected(ports[0].device);
  }, [link, ports, selected]);

  // Track the baud the bridge reports, so reconnecting doesn't silently change it.
  useEffect(() => {
    if (link?.baud) setBaud(link.baud);
  }, [link]);

  const display = describeLink(link);
  const isCustom = selected === CUSTOM;
  const port = isCustom ? customPort.trim() : selected;
  const connected = link?.connected === true;
  const canConnect = canControl && !busy && port.length > 0;

  // A port present in the bridge's list but not the selectable set (e.g. it was
  // unplugged after being configured) still deserves a row, so it is merged in.
  const deviceList = ports?.map((p) => p.device) ?? [];
  const options =
    link?.port && !deviceList.includes(link.port)
      ? [link.port, ...deviceList]
      : deviceList;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => { if (!e.open) onClose(); }}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            bg="bg.surface"
            border="1px solid"
            borderColor="border.default"
            borderRadius="card"
            maxW="440px"
            w="100%"
          >
            <Dialog.CloseTrigger asChild>
              <IconButton
                aria-label="Close FAS link panel"
                variant="ghost"
                size="sm"
                position="absolute"
                top={2}
                right={2}
                color="text.muted"
                _hover={{ color: "text.primary" }}
              >
                <Icon name="close" size={16} />
              </IconButton>
            </Dialog.CloseTrigger>

            <Dialog.Header pb={2}>
              <Text fontWeight="600" fontSize="sm" color="text.primary" letterSpacing="0.03em">
                FAS Serial Link
              </Text>
            </Dialog.Header>

            <Dialog.Body display="flex" flexDirection="column" gap={4} pt={0}>
              {/* Current state */}
              <Flex direction="column" gap={1.5}>
                <Flex align="center" gap={2}>
                  <StatusDot status={display.status} size={8} />
                  <Mono fontSize="xs" fontWeight="700" color="text.primary">
                    {display.short}
                  </Mono>
                  {streaming && <Chip status="info">streaming</Chip>}
                </Flex>
                <Text fontSize="xs" color="text.muted">
                  {display.detail}
                </Text>
              </Flex>

              {/* Port picker */}
              <Box>
                <Flex align="center" justify="space-between" mb={1}>
                  <Text fontSize="xs" color="text.muted" fontWeight="500">
                    Port
                  </Text>
                  <Flex
                    as="button"
                    align="center"
                    gap={1}
                    px={1.5}
                    py={0.5}
                    borderRadius="control"
                    color="text.muted"
                    cursor={canControl ? "pointer" : "not-allowed"}
                    aria-disabled={!canControl}
                    onClick={canControl ? () => void refreshPorts() : undefined}
                    title="Re-enumerate serial ports on the bridge host"
                    _hover={canControl ? { color: "text.primary", bg: "bg.surfaceRaised" } : {}}
                  >
                    <Icon name="refresh" size={14} />
                    <Text fontSize="xs">Refresh</Text>
                  </Flex>
                </Flex>

                <NativeSelect.Root size="sm" disabled={!canControl}>
                  <NativeSelect.Field
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    bg="bg.canvas"
                    borderColor="border.default"
                    color="text.primary"
                    fontSize="sm"
                  >
                    {options.length === 0 && <option value="">No ports found</option>}
                    {options.map((device) => (
                      <option key={device} value={device}>{device}</option>
                    ))}
                    <option value={CUSTOM}>Other…</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>

                {/* Description of the highlighted port, when the bridge gave one */}
                {!isCustom && (() => {
                  const meta = ports?.find((p) => p.device === selected);
                  return meta?.description ? (
                    <Text fontSize="xs" color="text.muted" mt={1.5}>
                      {meta.description}
                    </Text>
                  ) : null;
                })()}

                {isCustom && (
                  <Input
                    mt={2}
                    size="sm"
                    value={customPort}
                    onChange={(e) => setCustomPort(e.target.value)}
                    placeholder="COM3 or /dev/ttyUSB0"
                    disabled={!canControl}
                    bg="bg.canvas"
                    borderColor="border.default"
                    color="text.primary"
                    fontFamily="mono"
                    _placeholder={{ color: "text.muted" }}
                  />
                )}
              </Box>

              {/* Baud */}
              <Box>
                <Text fontSize="xs" color="text.muted" mb={1} fontWeight="500">
                  Baud
                </Text>
                <NativeSelect.Root size="sm" disabled={!canControl}>
                  <NativeSelect.Field
                    value={String(baud)}
                    onChange={(e) => setBaud(Number(e.target.value))}
                    bg="bg.canvas"
                    borderColor="border.default"
                    color="text.primary"
                    fontSize="sm"
                  >
                    {FAS_BAUD_RATES.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </NativeSelect.Field>
                </NativeSelect.Root>
              </Box>

              {gateReason && <Chip status="warn">{gateReason}</Chip>}
            </Dialog.Body>

            <Dialog.Footer pt={2} gap={2}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void disconnect()}
                disabled={!canControl || busy || !connected}
                color="text.muted"
                _hover={{ color: "text.primary" }}
              >
                Disconnect
              </Button>
              <Button
                size="sm"
                bg="accent.solid"
                color="white"
                _hover={{ opacity: 0.85 }}
                _active={{ opacity: 0.7 }}
                onClick={() => void connect(port, baud)}
                disabled={!canConnect}
                loading={busy}
              >
                {connected ? "Reconnect" : "Connect"}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Top-bar control
// ---------------------------------------------------------------------------

/**
 * Top-bar FAS serial-link indicator + configurator.
 *
 * Shows the bridge's own RS-422 port state (`fas_link` / `console_serial`) and
 * opens the port picker on click. This is deliberately global chrome: the FAS
 * bridge boots with no port, so every page is potentially the one where an
 * operator notices the link is down and needs to bring it back.
 */
export function FasLinkControl() {
  const { link } = useFasLink();
  const [isOpen, setIsOpen] = useState(false);
  const display = describeLink(link);

  return (
    <>
      <Flex
        as="button"
        align="center"
        gap={1.5}
        px={2}
        py={1}
        borderRadius="chip"
        bg="transparent"
        border="1px solid"
        borderColor="chrome.border"
        cursor="pointer"
        onClick={() => setIsOpen(true)}
        aria-label="Configure the FAS serial link"
        title={`FAS serial link — ${display.detail}`}
        _hover={{ bg: "chrome.surfaceHover" }}
        style={{ transition: "background 150ms ease" }}
      >
        <Icon name="cable" size={14} color="chrome.textMuted" />
        <StatusDot status={display.status} size={7} />
        <Mono fontSize="xs" color="chrome.text">
          {display.short}
        </Mono>
      </Flex>

      {/* Mounted only while open so the on-open port/status refresh fires each time */}
      {isOpen && <FasLinkDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  );
}
