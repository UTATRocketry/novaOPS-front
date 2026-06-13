"use client";

import { Box, Flex } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { Icon, Mono, StatusDot, Chip } from "@/components/primitives";
import type { Status } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { getMissionStartMs } from "@/lib/flight";
import { adaptSignal } from "@/lib/signal";
import type { ClientRole } from "@/lib/types";
import { RoleModal } from "./RoleModal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatLocalTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Role pill
// ---------------------------------------------------------------------------

interface RolePillProps {
  role: ClientRole | null;
  onClick?: () => void;
}

const ROLE_BG: Record<ClientRole, string> = {
  viewer:   "role.viewer",
  pad:      "role.pad",
  operator: "role.operator",
  admin:    "role.admin",
};

function RolePill({ role, onClick }: RolePillProps) {
  const bg = role ? ROLE_BG[role] : "chrome.border";
  const label = role ?? "—";

  return (
    <Flex
      as="span"
      display="inline-flex"
      align="center"
      gap={1.5}
      px={2.5}
      py={1}
      borderRadius="chip"
      bg={bg}
      cursor="pointer"
      onClick={onClick}
      _hover={{
        filter: "brightness(1.15)",
        boxShadow: "0 0 8px 2px rgba(0,0,0,0.35)",
      }}
      style={{ transition: "filter 150ms ease, box-shadow 150ms ease" }}
    >
      <Icon name="badge" size={14} color="white" />
      <Mono fontWeight="700" fontSize="xs" color="white">
        {label.toUpperCase()}
      </Mono>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Signal bars
// ---------------------------------------------------------------------------

function SignalBars({ bars }: { bars: number | null }) {
  if (bars === null) {
    return (
      <Mono fontSize="xs" color="chrome.textMuted">
        —
      </Mono>
    );
  }

  return (
    <Flex align="flex-end" gap="2px" height="14px">
      {Array.from({ length: 5 }, (_, i) => (
        <Box
          key={i}
          width="3px"
          height={`${4 + i * 2}px`}
          borderRadius="1px"
          bg={i < bars ? "accent.solid" : "chrome.border"}
          style={{ transition: "background 300ms ease" }}
        />
      ))}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Socket status mapping
// ---------------------------------------------------------------------------

type SocketStatus = "disconnected" | "connecting" | "open" | "error";

function mapSocketStatus(status: SocketStatus): { dotStatus: Status; label: string } {
  switch (status) {
    case "open":         return { dotStatus: "nominal", label: "CONNECTED" };
    case "connecting":   return { dotStatus: "warn",    label: "CONNECTING" };
    case "error":        return { dotStatus: "error",   label: "ERROR" };
    case "disconnected": return { dotStatus: "neutral", label: "OFFLINE" };
  }
}

// ---------------------------------------------------------------------------
// TopStatusBar
// ---------------------------------------------------------------------------

export function TopStatusBar() {
  const [localTime, setLocalTime] = useState<string>("--:--:--");
  const [missionTime, setMissionTime] = useState<string>("T+--:--:--");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const socketStatus = useNovaStore(sel.socketStatus);
  const sessionRole = useNovaStore(sel.sessionRole);

  const signal = adaptSignal(null);
  const { dotStatus, label: connLabel } = mapSocketStatus(socketStatus);

  useEffect(() => {
    function tick() {
      const now = new Date();
      setLocalTime(formatLocalTime(now));

      const startMs = getMissionStartMs();
      if (startMs === null) {
        setMissionTime("T+--:--:--");
      } else {
        const elapsedSec = (Date.now() - startMs) / 1000;
        setMissionTime(`T+${formatHMS(elapsedSec)}`);
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Flex
      as="header"
      align="center"
      height="48px"
      minHeight="48px"
      px={4}
      bg="chrome.bg"
      borderBottom="1px solid"
      borderColor="chrome.border"
      flexShrink={0}
      gap={5}
    >
      {/* Left cluster */}
      <Flex align="center" gap={5}>
        {/* Local time */}
        <Flex align="center" gap={1.5}>
          <Icon name="schedule" size={14} color="chrome.textMuted" />
          <Mono fontSize="xs" color="chrome.text">
            {localTime}
          </Mono>
        </Flex>

        {/* Mission time */}
        <Flex align="center" gap={1.5}>
          <Icon name="timer" size={14} color="chrome.textMuted" />
          <Mono fontSize="xs" color="chrome.text">
            {missionTime}
          </Mono>
        </Flex>

        {/* Connection dot */}
        <Flex align="center" gap={1.5}>
          <StatusDot status={dotStatus} size={7} />
          <Mono fontSize="xs" color="chrome.textMuted">
            {connLabel}
          </Mono>
        </Flex>

        {/* Signal bars */}
        <SignalBars bars={signal.bars} />
      </Flex>

      {/* Right cluster */}
      <Flex align="center" gap={3} ml="auto">
        {/* Alert chips — counts stubbed at 0, Phase 3 will wire real alert state */}
        <Chip status="warn">
          <Icon name="warning" size={12} color="currentColor" />
          <Mono>0</Mono>
        </Chip>
        <Chip status="error">
          <Icon name="error" size={12} color="currentColor" />
          <Mono>0</Mono>
        </Chip>
        <Chip status="fault">
          <Icon name="dangerous" size={12} color="currentColor" />
          <Mono>0</Mono>
        </Chip>

        {/* Role pill */}
        <RolePill role={sessionRole} onClick={() => setIsModalOpen(true)} />
      </Flex>

      <RoleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </Flex>
  );
}
