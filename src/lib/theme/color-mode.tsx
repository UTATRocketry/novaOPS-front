"use client";

import { ThemeProvider, useTheme } from "next-themes";
import type { PropsWithChildren } from "react";

/**
 * Color mode is driven by next-themes (the Chakra v3 approach).
 * Dark is the default per the design (bunker/night operation).
 */
export function ColorModeProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}

export function useColorMode() {
  const { resolvedTheme, setTheme } = useTheme();
  const colorMode = resolvedTheme === "light" ? "light" : "dark";
  return {
    colorMode,
    setColorMode: setTheme,
    toggleColorMode: () => setTheme(colorMode === "dark" ? "light" : "dark"),
  };
}
