"use client";

import { useMemo, useState } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { Card, Chip, Icon } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { sendConsoleCommand } from "@/lib/api";
import { isConsoleLine } from "@/lib/console";
import { ConsoleStream } from "./ConsoleStream";
import { SELECT_STYLE } from "./controlStyles";

const NativeSelect = chakra("select");

// Placeholder port list + common baud rates. The port/baud/refresh controls are
// UI-only for now (no backend port enumeration wired); Open/Close drive the
// console start/stop commands.
const PORTS = ["Auto", "COM1", "COM2", "COM3", "COM4", "/dev/ttyUSB0"];
const BAUDS = ["9600", "57600", "115200", "230400", "460800", "921600"];

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
  const role = useNovaStore(sel.sessionRole);
  const push = useNovaStore((s) => s.pushConsoleEntry);

  const [port, setPort] = useState(PORTS[0]);
  const [baud, setBaud] = useState("460800");
  const [open, setOpen] = useState(false);

  const canControl = (role === "operator" || role === "admin") && !!clientId;
  const gateReason = !clientId
    ? "Not connected"
    : !canControl
      ? "Operator or admin role required"
      : null;

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
          {/* Port / baud / refresh — UI placeholders (not yet wired to backend) */}
          <Flex gap={2} align="flex-end" flexWrap="wrap">
            <Box flex="2" minW="120px">
              <Text fontSize="xs" color="text.muted" mb={1}>Port</Text>
              <NativeSelect style={SELECT_STYLE} value={port} onChange={(e) => setPort(e.target.value)}>
                {PORTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </NativeSelect>
            </Box>
            <Box flex="1" minW="100px">
              <Text fontSize="xs" color="text.muted" mb={1}>Baud</Text>
              <NativeSelect style={SELECT_STYLE} value={baud} onChange={(e) => setBaud(e.target.value)}>
                {BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </NativeSelect>
            </Box>
            <Box
              as="button"
              title="Port refresh is not wired to the backend yet"
              px={2.5}
              py={2}
              borderRadius="control"
              border="1px solid"
              borderColor="border.default"
              color="text.muted"
              cursor="pointer"
              _hover={{ color: "text.primary", bg: "bg.surfaceRaised" }}
            >
              <Icon name="refresh" size={16} />
            </Box>
          </Flex>

          {/* Open / close → console start / stop */}
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
              Open
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
              Close
            </Box>
            <Chip status={open ? "nominal" : "neutral"}>{open ? "open" : "closed"}</Chip>
          </Flex>

          {gateReason && <Chip status="warn">{gateReason}</Chip>}

          {/* Console terminal — console/log lines only, no telemetry passthrough */}
          <SerialTerminal />
        </Flex>
      </Box>
    </Card>
  );
}
