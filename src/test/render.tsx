import { ChakraProvider } from "@chakra-ui/react";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { ColorModeProvider } from "@/lib/theme/color-mode";
import { system } from "@/lib/theme/system";
import { createTestQueryClient } from "./queryWrapper";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

/** The app's providers (Chakra theme, colour mode, React Query) for component tests. */
export function renderWithProviders(
  ui: ReactElement,
  { client = createTestQueryClient(), ...options }: RenderOptions & { client?: QueryClient } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ChakraProvider value={system}>
          <ColorModeProvider>{children}</ColorModeProvider>
        </ChakraProvider>
      </QueryClientProvider>
    );
  }
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
