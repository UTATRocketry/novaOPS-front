"use client";

import { Box, Flex } from "@chakra-ui/react";
import { useEffect, type ReactNode } from "react";
import { NovaSocket } from "@/lib/ws";
import { NavRail } from "./NavRail";
import { TopStatusBar } from "./TopStatusBar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  useEffect(() => {
    const socket = new NovaSocket();
    socket.connect();
    return () => socket.disconnect();
  }, []);

  return (
    <Flex height="100vh" overflow="hidden">
      <NavRail />
      <Flex flex="1" direction="column" overflow="hidden">
        <TopStatusBar />
        <Box flex="1" overflow="auto" p={6} bg="bg.canvas">
          {children}
        </Box>
      </Flex>
    </Flex>
  );
}
