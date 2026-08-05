"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { Card, Chip, Icon, StatusDot } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { sendConsoleCommand } from "@/lib/api";
import { isConsoleLine } from "@/lib/console";
import { describeLink } from "@/lib/console";
import { useFasLink, FAS_BAUD_RATES, FAS_DEFAULT_BAUD } from "@/hooks";
import { ConsoleStream } from "./ConsoleStream";
import { SELECT_STYLE } from "./controlStyles";

const NativeSelect = chakra("select");

/**
 * The terminal subscribes to the (high-frequency) console buffer in ISOLATION,
 * so its re-renders never re-render the Open/Close controls above it. Combined
 * with batched console ingest in the store, this keeps the controls responsive
 * under a heavy message flood.
 */
function SerialTerminal() {
  const consoleMessages = useNovaStore(sel.consoleMessages);
  const lines = useMemo(() => consoleMessages.filter(isConsoleLine), [consoleMessages]);
  return <ConsoleStream entries={lines} height="380px" emptyMessage="Waiting for console output…" />;
}

export function SerialConnection() {
  const clientId = useNovaStore(sel.clientId);
  const push = useNovaStore((s) => s.pushConsoleEntry);
  const {
    link, ports, canControl, gateReason, busy,
    refreshPorts, refreshStatus, connect, disconnect,
  } = useFasLink();

  const [port, setPort] = useState("");
  const [baud, setBaud] = useState(FAS_DEFAULT_BAUD);
  const [open, setOpen] = useState(false);

  // Enumerate ports and read the link state once the session can ask for them.
  useEffect(() => {
    if (!canControl) return;
    void refreshPorts();
    void refreshStatus();
  }, [canControl, refreshPorts, refreshStatus]);

  // Follow the bridge's own port/baud until the operator picks something else.
  useEffect(() => {
    if (port === "" && link?.port) setPort(link.port);
  }, [link, port]);
  useEffect(() => {
    if (link?.baud) setBaud(link.baud);
  }, [link]);

  const devices = ports?.map((p) => p.device) ?? [];
  const options =
    link?.port && !devices.includes(link.port) ? [link.port, ...devices] : devices;
  const linkDisplay = describeLink(link);
  const connected = link?.connected === true;

  async function setStream(start: boolean) {
    if (!clientId) return;
    push({ status: "info", kind: "command", text: `» console ${start ? "start" : "stop"}` });
    try {
      await sendConsoleCommand({ action: start ? "start" : "stop" }, clientId);
      setOpen(start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ status: "error", kind: "error", text: `✗ console ${start ? "start" : "stop"}: ${msg}` });
    }
  }

  return (
    <Card title="Serial Connection" flush>
      <Box p={4}>
        <Flex direction="column" gap={3}>
          {/* Bridge link state — `fas_link` / `console_serial` */}
          <Flex align="center" gap={2}>
            <StatusDot status={linkDisplay.status} size={8} />
            <Text fontSize="xs" color="text.muted">{linkDisplay.detail}</Text>
          </Flex>

          {/* Port / baud / refresh — drives the bridge's `configure` command */}
          <Flex gap={2} align="flex-end" flexWrap="wrap">
            <Box flex="2" minW="120px">
              <Text fontSize="xs" color="text.muted" mb={1}>Port</Text>
              <NativeSelect
                style={SELECT_STYLE}
                value={port}
                disabled={!canControl}
                onChange={(e) => setPort(e.target.value)}
              >
                {options.length === 0 && <option value="">No ports found</option>}
                {options.map((p) => <option key={p} value={p}>{p}</option>)}
              </NativeSelect>
            </Box>
            <Box flex="1" minW="100px">
              <Text fontSize="xs" color="text.muted" mb={1}>Baud</Text>
              <NativeSelect
                style={SELECT_STYLE}
                value={String(baud)}
                disabled={!canControl}
                onChange={(e) => setBaud(Number(e.target.value))}
              >
                {FAS_BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
              </NativeSelect>
            </Box>
            <Box
              as="button"
              title="Re-enumerate serial ports on the bridge host"
              onClick={canControl ? () => void refreshPorts() : undefined}
              aria-disabled={!canControl}
              px={2.5}
              py={2}
              borderRadius="control"
              border="1px solid"
              borderColor="border.default"
              color="text.muted"
              cursor={canControl ? "pointer" : "not-allowed"}
              _hover={canControl ? { color: "text.primary", bg: "bg.surfaceRaised" } : {}}
            >
              <Icon name="refresh" size={16} />
            </Box>
          </Flex>

          {/* Connect / disconnect the bridge's serial port */}
          <Flex gap={2} align="center">
            <Box
              as="button"
              onClick={canControl && port ? () => void connect(port, baud) : undefined}
              aria-disabled={!canControl || !port || busy}
              px={3}
              py={1}
              borderRadius="control"
              fontSize="xs"
              fontWeight="600"
              bg={canControl && port ? "accent.solid" : "bg.surfaceRaised"}
              color={canControl && port ? "white" : "text.muted"}
              border="1px solid"
              borderColor={canControl && port ? "accent.solid" : "border.default"}
              cursor={canControl && port ? "pointer" : "not-allowed"}
              _hover={canControl && port ? { filter: "brightness(1.1)" } : {}}
            >
              {connected ? "Reconnect" : "Connect"}
            </Box>
            <Box
              as="button"
              onClick={canControl && connected ? () => void disconnect() : undefined}
              aria-disabled={!canControl || !connected || busy}
              px={3}
              py={1}
              borderRadius="control"
              fontSize="xs"
              fontWeight="600"
              bg="bg.surfaceRaised"
              color={canControl && connected ? "text.primary" : "text.muted"}
              border="1px solid"
              borderColor="border.default"
              cursor={canControl && connected ? "pointer" : "not-allowed"}
              _hover={canControl && connected ? { filter: "brightness(1.1)" } : {}}
            >
              Disconnect
            </Box>
          </Flex>

          {/* Frame streaming → console start / stop (distinct from the port above) */}
          <Flex gap={2} align="center">
            <Box
              as="button"
              onClick={canControl && !open ? () => setStream(true) : undefined}
              aria-disabled={!canControl || open}
              px={3}
              py={1}
              borderRadius="control"
              fontSize="xs"
              fontWeight="600"
              bg={canControl && !open ? "accent.solid" : "bg.surfaceRaised"}
              color={canControl && !open ? "white" : "text.muted"}
              border="1px solid"
              borderColor={canControl && !open ? "accent.solid" : "border.default"}
              cursor={canControl && !open ? "pointer" : "not-allowed"}
              _hover={canControl && !open ? { filter: "brightness(1.1)" } : {}}
            >
              Start Stream
            </Box>
            <Box
              as="button"
              onClick={canControl && open ? () => setStream(false) : undefined}
              aria-disabled={!canControl || !open}
              px={3}
              py={1}
              borderRadius="control"
              fontSize="xs"
              fontWeight="600"
              bg={canControl && open ? "fault" : "bg.surfaceRaised"}
              color={canControl && open ? "white" : "text.muted"}
              border="1px solid"
              borderColor={canControl && open ? "fault" : "border.default"}
              cursor={canControl && open ? "pointer" : "not-allowed"}
              _hover={canControl && open ? { filter: "brightness(1.1)" } : {}}
            >
              Stop Stream
            </Box>
            <Chip status={open ? "nominal" : "neutral"}>
              {open ? "streaming" : "idle"}
            </Chip>
          </Flex>

          {gateReason && <Chip status="warn">{gateReason}</Chip>}

          {/* Console terminal — console/log lines only, no telemetry passthrough */}
          <SerialTerminal />
        </Flex>
      </Box>
    </Card>
  );
}
