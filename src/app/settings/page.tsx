"use client";

import {
  Box,
  Flex,
  Grid,
  Text,
  Input,
  Switch,
  Stack,
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" textTransform="uppercase" color="text.muted" mb={3}>
      {children}
    </Text>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <Flex justify="space-between" align="center" gap={4} py={3}>
      <Box flex="1" minW={0}>
        <Text fontSize="sm" fontWeight="500" color="text.primary">{label}</Text>
        {description && <Text fontSize="xs" color="text.muted" mt={0.5}>{description}</Text>}
      </Box>
      <Box flexShrink={0}>{children}</Box>
    </Flex>
  );
}

function AppearanceSection() {
  const { colorMode, toggleColorMode } = useColorMode();
  const [tab, setTab] = useState("pid");
  return (
    <Box>
      <Stack gap={4}>
        <Card title="Theme">
          <SettingRow label="Color mode" description="Toggle between dark (default) and light themes.">
            <Flex as="button" onClick={toggleColorMode} align="center" gap={2} px={3} py={1.5} borderRadius="control" border="1px solid" borderColor="border.default" bg="bg.surface" color="text.primary" cursor="pointer" fontSize="sm">
              <Icon name={colorMode === "dark" ? "light_mode" : "dark_mode"} size={16} />
              {colorMode === "dark" ? "Switch to Light" : "Switch to Dark"}
            </Flex>
          </SettingRow>
        </Card>
        <Card title="Primitives Reference">
          <Text fontSize="xs" color="text.muted" mb={4}>Live token preview — changes with the active theme.</Text>
          <Grid templateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap={4}>
            <Card nested title="Status Dots & Chips">
              <Flex direction="column" gap={3}>
                <Flex gap={4} align="center" wrap="wrap">
                  <Flex align="center" gap={2}><StatusDot status="nominal" /><Text fontSize="sm">Nominal</Text></Flex>
                  <Flex align="center" gap={2}><StatusDot status="warn" /><Text fontSize="sm">Warn</Text></Flex>
                  <Flex align="center" gap={2}><StatusDot status="fault" /><Text fontSize="sm">Fault</Text></Flex>
                  <Flex align="center" gap={2}><StatusDot status="neutral" /><Text fontSize="sm">Offline</Text></Flex>
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
            <Card nested title="KPI Tiles">
              <Grid templateColumns="repeat(3, 1fr)" gap={3}>
                <KpiTile label="Altitude" value="1240.5" unit="m" />
                <KpiTile label="Amb. Press" value="101.3" unit="kPa" />
                <KpiTile label="Temp" value={undefined} unit="°C" />
              </Grid>
            </Card>
            <Card nested title="Gauges">
              <Flex align="center" justify="space-around" wrap="wrap" gap={2}>
                <Gauge value={420} min={0} max={800} unit="psi" label="PGSO" />
                <Gauge value={null} min={0} max={800} unit="psi" label="No data" />
              </Flex>
            </Card>
            <Card nested title="Tabs">
              <PillTabs items={[{ value: "pid", label: "P&ID" }, { value: "plots", label: "Plots" }, { value: "table", label: "Table" }]} value={tab} onChange={setTab} />
              <Text mt={2} fontSize="sm" color="text.muted">Active: <Mono>{tab}</Mono></Text>
            </Card>
            <Card nested title="Terminal" flush>
              <Box p={3}>
                <Terminal lines={[{ timestamp: "T+00:01", text: "> CMD SVFTV open", status: "nominal" }, { timestamp: "T+00:02", text: "ACK SVFTV = open", status: "info" }, { timestamp: "T+00:03", text: "WARN PFT high", status: "warn" }, { timestamp: "T+00:04", text: "ERR link timeout", status: "fault" }]} height="140px" />
              </Box>
            </Card>
            <Card nested title="Nested Card">
              <Card nested title="Inner">
                <Text fontSize="sm" color="text.muted">A card-within-a-card uses a raised surface tone.</Text>
              </Card>
            </Card>
          </Grid>
        </Card>
      </Stack>
    </Box>
  );
}

const STORAGE_KEY_HOST = "nova.settings.backendHost";
const DEFAULT_HOST = "localhost:8000";

function ConnectionSection() {
  const [host, setHost] = useState(DEFAULT_HOST);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_HOST);
    if (stored) setHost(stored);
  }, []);
  function handleSave() {
    localStorage.setItem(STORAGE_KEY_HOST, host);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <Box>
      <Card title="Backend">
        <Stack gap={0} divideY="1px">
          <SettingRow label="Backend host" description="Host and port for the FastAPI backend. Used for REST and WebSocket connections. Format: host:port">
            <Flex gap={2} align="center">
              <Input value={host} onChange={(e) => { setHost(e.target.value); setSaved(false); }} fontFamily="mono" fontSize="sm" size="sm" w="220px" bg="bg.canvas" borderColor="border.default" color="text.primary" onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} />
              <Flex as="button" onClick={handleSave} align="center" gap={1.5} px={3} py={1.5} borderRadius="control" border="1px solid" borderColor={saved ? "nominal" : "border.default"} bg={saved ? "nominal" : "bg.surface"} color={saved ? "white" : "text.primary"} cursor="pointer" fontSize="sm" transition="all 0.15s">
                <Icon name={saved ? "check" : "save"} size={15} />
                {saved ? "Saved" : "Save"}
              </Flex>
            </Flex>
          </SettingRow>
          <SettingRow label="REST base URL" description="Derived from host — read-only.">
            <Mono fontSize="sm" color="text.muted">http://{host}</Mono>
          </SettingRow>
          <SettingRow label="WebSocket URL" description="Derived from host — read-only.">
            <Mono fontSize="sm" color="text.muted">ws://{host}/ws</Mono>
          </SettingRow>
        </Stack>
      </Card>
    </Box>
  );
}

function DownloadsSection() {
  return (
    <Box>
      <Card title="Data Export">
        <Stack gap={0} divideY="1px">
          <SettingRow label="Flight data CSV" description="Download all recorded flight telemetry as a CSV file.">
            <Flex as="button" align="center" gap={1.5} px={3} py={1.5} borderRadius="control" border="1px solid" borderColor="border.default" bg="bg.surface" color="text.muted" cursor="not-allowed" fontSize="sm" opacity={0.55}>
              <Icon name="download" size={15} />Download CSV
            </Flex>
          </SettingRow>
          <SettingRow label="Engine log CSV" description="Download engine sensor data for the last session.">
            <Flex as="button" align="center" gap={1.5} px={3} py={1.5} borderRadius="control" border="1px solid" borderColor="border.default" bg="bg.surface" color="text.muted" cursor="not-allowed" fontSize="sm" opacity={0.55}>
              <Icon name="download" size={15} />Download CSV
            </Flex>
          </SettingRow>
          <SettingRow label="Console log" description="Download the full console message log as plain text.">
            <Flex as="button" align="center" gap={1.5} px={3} py={1.5} borderRadius="control" border="1px solid" borderColor="border.default" bg="bg.surface" color="text.muted" cursor="not-allowed" fontSize="sm" opacity={0.55}>
              <Icon name="download" size={15} />Download TXT
            </Flex>
          </SettingRow>
        </Stack>
        <Text fontSize="xs" color="text.muted" mt={3}>Downloads are not yet connected to the backend</Text>
      </Card>
    </Box>
  );
}

function LoggingSection() {
  const [verbose, setVerbose] = useState(false);
  const [timestamps, setTimestamps] = useState(true);
  return (
    <Box>
      <Card title="Console Behaviour">
        <Stack gap={0} divideY="1px">
          <SettingRow label="Verbose mode" description="Include debug-level messages in the console stream.">
            <Switch.Root checked={verbose} onCheckedChange={(e) => setVerbose(e.checked)} colorPalette="blue" size="sm">
              <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch.Root>
          </SettingRow>
          <SettingRow label="Show timestamps" description="Prefix each console line with its mission-elapsed timestamp.">
            <Switch.Root checked={timestamps} onCheckedChange={(e) => setTimestamps(e.checked)} colorPalette="blue" size="sm">
              <Switch.HiddenInput /><Switch.Control><Switch.Thumb /></Switch.Control>
            </Switch.Root>
          </SettingRow>
        </Stack>
        <Text fontSize="xs" color="text.muted" mt={3}>Logging preferences are local-only; they are not yet forwarded to the console stream.</Text>
      </Card>
    </Box>
  );
}

const BUILD_INFO = { app: "NovaOps GCS", phase: "Phase 5 — Flight", stack: "Next.js 15 · Chakra UI v3 · Zustand · uPlot · JointJS", repo: "novaOPS-front" };

function AboutSection() {
  return (
    <Box>
      <Card title="Nova GCS">
        <Stack gap={0} divideY="1px">
          <SettingRow label="Application"><Mono fontSize="sm" color="text.muted">{BUILD_INFO.app}</Mono></SettingRow>
          <SettingRow label="Current phase"><Chip status="info">{BUILD_INFO.phase}</Chip></SettingRow>
          <SettingRow label="Stack"><Text fontSize="sm" color="text.muted" textAlign="right" maxW="300px">{BUILD_INFO.stack}</Text></SettingRow>
          <SettingRow label="Repository"><Mono fontSize="sm" color="text.muted">{BUILD_INFO.repo}</Mono></SettingRow>
        </Stack>
      </Card>
    </Box>
  );
}

type SectionKey = "appearance" | "connection" | "downloads" | "logging" | "about";

const NAV_ITEMS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "appearance", label: "Appearance", icon: "palette" },
  { key: "connection", label: "Connection", icon: "wifi" },
  { key: "downloads", label: "Downloads", icon: "download" },
  { key: "logging", label: "Logging", icon: "list" },
  { key: "about", label: "About", icon: "info" },
];

function NavItem({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Flex
      as="button"
      onClick={onClick}
      align="center"
      gap={2.5}
      px={3}
      py={2.5}
      borderRadius="control"
      cursor="pointer"
      fontSize="sm"
      fontWeight={active ? "600" : "400"}
      color={active ? "white" : "text.muted"}
      bg={active ? "accent.solid" : "transparent"}
      borderLeft="2px solid"
      borderColor="transparent"
      w="100%"
      textAlign="left"
      transition="all 0.12s"
      _hover={active ? {} : { bg: "bg.surfaceRaised", color: "text.primary" }}
    >
      <Icon name={item.icon} size={20} />
      {item.label}
    </Flex>
  );
}

export default function SettingsPage() {
  const [active, setActive] = useState<SectionKey>("appearance");

  return (
    <Flex minH="100vh" bg="bg.canvas" p={6} gap={6} align="flex-start">
      {/* Sidebar */}
      <Card
        flexShrink={0}
        w="190px"
        position="sticky"
        top={6}
      >
        <Stack gap={0.5}>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              item={item}
              active={active === item.key}
              onClick={() => setActive(item.key)}
            />
          ))}
        </Stack>
      </Card>

      {/* Content area */}
      <Box flex="1" minW={0}>
        <Box maxW="860px">
          {active === "appearance" && <AppearanceSection />}
          {active === "connection" && <ConnectionSection />}
          {active === "downloads" && <DownloadsSection />}
          {active === "logging" && <LoggingSection />}
          {active === "about" && <AboutSection />}
        </Box>
      </Box>
    </Flex>
  );
}
