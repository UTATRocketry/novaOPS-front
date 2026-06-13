"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type PropsWithChildren } from "react";
import { system } from "@/lib/theme/system";
import { ColorModeProvider } from "@/lib/theme/color-mode";

export function Providers({ children }: PropsWithChildren) {
  // One QueryClient per app instance. Telemetry is live over WS; REST data
  // (config/sensors/actuators) is cached and invalidated on config changes.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={system}>
        <ColorModeProvider>{children}</ColorModeProvider>
      </ChakraProvider>
    </QueryClientProvider>
  );
}
