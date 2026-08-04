"use client";

import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Icon } from "@/components/primitives";

// Create a Chakra-styled Link so we get token/prop support while keeping
// proper href typings from Next.js.
const ChakraLink = chakra(Link);

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home",     route: "/",        icon: "home" },
  { label: "Engine",   route: "/engine",  icon: "speed" },
  { label: "Flight",   route: "/flight",  icon: "rocket_launch" },
  { label: "Devices",  route: "/devices", icon: "memory" },
  { label: "Console",  route: "/console", icon: "terminal" },
  { label: "Config",   route: "/config",  icon: "tune" },
  { label: "Tools",    route: "/tools",   icon: "build" },
  { label: "Settings", route: "/settings",icon: "settings" },
];

const EXPANDED_WIDTH = "150px";
const COLLAPSED_WIDTH = "56px";
const TOP_BAR_HEIGHT = "48px";

/** Dark logo assets on the fixed-dark rail need inverting to render as white. */
const WHITE_LOGO = "brightness(0) invert(1)";

function isActive(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname.startsWith(route);
}

export function NavRail() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (window.innerWidth <= 1100) setCollapsed(true);
  }, []);
  const pathname = usePathname();

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <Flex
      as="nav"
      direction="column"
      flexShrink={0}
      width={width}
      minWidth={width}
      height="100vh"
      bg="chrome.bg"
      borderRight="1px solid"
      borderColor="chrome.border"
      overflow="hidden"
      style={{ transition: "width 200ms ease, min-width 200ms ease" }}
      position="relative"
      zIndex={10}
    >
      {/* Brand area — sits at the same height as the top bar */}
      <Flex
        align="center"
        gap={2}
        px={collapsed ? 0 : 3}
        height={TOP_BAR_HEIGHT}
        flexShrink={0}
        justify="center"//{collapsed ? "center" : "flex-start"}
        borderBottom="1px solid"
        borderColor="chrome.border"
      >
        {/* Nova icon*/}
        <img
          src={collapsed ? "/images/nova_icon.svg" : "/images/nova_logo.svg"}
          alt="Nova"
          style={{ height: "28px", filter: WHITE_LOGO, flexShrink: 0, display: "block" }}
        />
        {/* {!collapsed && (
          <img
            src="/images/nova_logo.svg"
            alt="Nova"
            style={{ height: "16px", filter: WHITE_LOGO, display: "block" }}
          />
        )} */}
      </Flex>

      {/* Nav items */}
      <Flex direction="column" flex="1" py={2} gap={0.5} px={collapsed ? 1 : 2}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.route);
          return (
            <ChakraLink
              key={item.route}
              href={item.route}
              display="flex"
              alignItems="center"
              gap={collapsed ? 0 : 2.5}
              px={collapsed ? 0 : 2}
              py={2}
              borderRadius="control"
              width="100%"
              justifyContent={collapsed ? "center" : "flex-start"}
              textDecoration="none"
              bg={active ? "accent.solid" : "transparent"}
              color={active ? "white" : "chrome.textMuted"}
              _hover={
                active
                  ? {}
                  : {
                      bg: "chrome.surfaceHover",
                      color: "chrome.text",
                    }
              }
              style={{ transition: "background 150ms ease, color 150ms ease" }}
            >
              <Icon name={item.icon} size={20} color="currentColor" />
              {!collapsed && (
                <Text
                  as="span"
                  fontSize="sm"
                  fontWeight={active ? "600" : "400"}
                  fontFamily="body"
                  whiteSpace="nowrap"
                  color="inherit"
                >
                  {item.label}
                </Text>
              )}
            </ChakraLink>
          );
        })}
      </Flex>

      {/* Collapse toggle */}
      <Flex
        align="center"
        justify={collapsed ? "center" : "flex-end"}
        px={collapsed ? 0 : 2}
        py={3}
        borderTop="1px solid"
        borderColor="chrome.border"
        flexShrink={0}
      >
        <Box
          as="button"
          display="flex"
          alignItems="center"
          justifyContent="center"
          width="32px"
          height="32px"
          borderRadius="control"
          color="chrome.textMuted"
          bg="transparent"
          border="none"
          cursor="pointer"
          _hover={{ bg: "chrome.surfaceHover", color: "chrome.text" }}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          style={{ transition: "background 150ms ease" }}
        >
          <Icon
            name={collapsed ? "chevron_right" : "chevron_left"}
            size={20}
            color="currentColor"
          />
        </Box>
      </Flex>
    </Flex>
  );
}
