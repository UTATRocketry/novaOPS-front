"use client";

import { useState } from "react";
import { Box } from "@chakra-ui/react";
import { PageHeader } from "@/components/shell";
import { PillTabs } from "@/components/primitives";
import type { TabItem } from "@/components/primitives";
import {
  Commanding,
  EventsLog,
  ChannelsTable,
  LogsViewer,
  WsViewer,
} from "@/components/console";

type ConsoleView = "commanding" | "events" | "channels" | "logs" | "ws";

const VIEW_TABS: TabItem[] = [
  { value: "commanding", label: "Commanding" },
  { value: "events",     label: "Events"     },
  { value: "channels",   label: "Channels"   },
  { value: "logs",       label: "Logs"       },
  { value: "ws",         label: "WS / MQTT"  },
];

export default function ConsolePage() {
  const [view, setView] = useState<ConsoleView>("commanding");

  return (
    <Box>
      <PageHeader
        title="Console"
        subtitle="Commanding & telemetry log"
        action={
          <PillTabs
            items={VIEW_TABS}
            value={view}
            onChange={(v) => setView(v as ConsoleView)}
          />
        }
      />

      {view === "commanding" && <Commanding />}
      {view === "events" && <EventsLog />}
      {view === "channels" && <ChannelsTable />}
      {view === "logs" && <LogsViewer />}
      {view === "ws" && <WsViewer />}
    </Box>
  );
}
