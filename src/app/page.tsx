"use client";

import { Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { useState } from "react";
import {
  Card,
  Chip,
  Gauge,
  Icon,
  KpiTile,
  Mono,
  PillTabs,
  StatusDot,
  Terminal,
} from "@/components/primitives";
import { useColorMode } from "@/lib/theme/color-mode";

export default function Home() {
  const { colorMode, toggleColorMode } = useColorMode();
  const [tab, setTab] = useState("pid");

  return (
    <Box minH="100vh" bg="bg.canvas" p={8}>
      <Flex align="center" justify="space-between" mb={6}>
        <Box>
          <Heading size="lg" color="text.primary">
            NovaOps — Primitives
          </Heading>
          <Text color="text.muted" fontSize="sm">
            Phase 1 scaffold: theme + core components
          </Text>
        </Box>
        <Box
          as="button"
          onClick={toggleColorMode}
          px={3}
          py={2}
          borderRadius="control"
          border="1px solid"
          borderColor="border.default"
          bg="bg.surface"
          color="text.primary"
          cursor="pointer"
        >
          <Flex align="center" gap={2}>
            <Icon name={colorMode === "dark" ? "light_mode" : "dark_mode"} size={18} />
            <Text fontSize="sm">{colorMode === "dark" ? "Light" : "Dark"}</Text>
          </Flex>
        </Box>
      </Flex>

      <Grid templateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap={5}>
        <Card title="Status Dots & Chips">
          <Flex direction="column" gap={4}>
            <Flex gap={4} align="center" wrap="wrap">
              <Flex align="center" gap={2}>
                <StatusDot status="nominal" /> <Text fontSize="sm">Nominal</Text>
              </Flex>
              <Flex align="center" gap={2}>
                <StatusDot status="warn" /> <Text fontSize="sm">Warn</Text>
              </Flex>
              <Flex align="center" gap={2}>
                <StatusDot status="fault" /> <Text fontSize="sm">Fault</Text>
              </Flex>
              <Flex align="center" gap={2}>
                <StatusDot status="neutral" /> <Text fontSize="sm">Offline</Text>
              </Flex>
            </Flex>
            <Flex gap={2} wrap="wrap">
              <Chip status="nominal">OPEN</Chip>
              <Chip status="fault">CLOSED</Chip>
              <Chip status="warn">WARN</Chip>
              <Chip status="info">LOADED</Chip>
              <Chip status="neutral">SIMULATED</Chip>
            </Flex>
          </Flex>
        </Card>

        <Card title="KPI Tiles">
          <Grid templateColumns="repeat(3, 1fr)" gap={4}>
            <KpiTile label="Altitude" value="1240.5" unit="m" />
            <KpiTile label="Amb. Press" value="101.3" unit="kPa" />
            <KpiTile label="Temp" value={undefined} unit="°C" />
          </Grid>
        </Card>

        <Card title="Gauges">
          <Flex justify="space-around" wrap="wrap" gap={2}>
            <Gauge value={420} min={0} max={800} unit="psi" label="PGSO" />
            <Gauge value={null} min={0} max={800} unit="psi" label="No data" />
          </Flex>
        </Card>

        <Card title="Tabs">
          <PillTabs
            items={[
              { value: "pid", label: "P&ID" },
              { value: "plots", label: "Plots" },
              { value: "table", label: "Table" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Text mt={3} fontSize="sm" color="text.muted">
            Active: <Mono>{tab}</Mono>
          </Text>
        </Card>

        <Card title="Terminal" flush>
          <Box p={3}>
            <Terminal
              lines={[
                { timestamp: "T+00:01", text: "> CMD SVFTV open", status: "nominal" },
                { timestamp: "T+00:02", text: "ACK SVFTV = open", status: "info" },
                { timestamp: "T+00:03", text: "WARN PFT high", status: "warn" },
                { timestamp: "T+00:04", text: "ERR link timeout", status: "fault" },
              ]}
              height="160px"
            />
          </Box>
        </Card>

        <Card title="Nested Card">
          <Card title="Inner" nested>
            <Text fontSize="sm" color="text.muted">
              A card-within-a-card uses a raised surface tone.
            </Text>
          </Card>
        </Card>
      </Grid>
    </Box>
  );
}
