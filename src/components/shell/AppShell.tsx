"use client";

import { Box, Flex } from "@chakra-ui/react";
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NovaSocket } from "@/lib/ws";
import { queryKeys } from "@/hooks/queryKeys";
import { NotificationCenter } from "@/components/alerts";
import { NavRail } from "./NavRail";
import { TopStatusBar } from "./TopStatusBar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = new NovaSocket({
      // Apply config_update broadcasts straight into the REST cache (no re-fetch).
      onConfigUpdate: (config) => {
        queryClient.setQueryData(queryKeys.config, config);
        queryClient.setQueryData(queryKeys.sensors, config.Sensors ?? []);
        queryClient.setQueryData(queryKeys.actuators, config.Actuators ?? []);
      },
    });
    socket.connect();
    return () => socket.disconnect();
  }, [queryClient]);

  return (
    <Flex height="100vh" overflow="hidden">
      <NavRail />
      <Flex flex="1" direction="column" overflow="hidden">
        <TopStatusBar />
        <Box flex="1" overflow="auto" p={{ base: 3, lg: 6 }} bg="bg.canvas">
          {children}
        </Box>
      </Flex>
      <NotificationCenter />
    </Flex>
  );
}
