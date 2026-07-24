"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Icon } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { SEVERITY_ICON, SEVERITY_STATUS } from "@/lib/alerts";
import type { Alert } from "@/lib/alerts";

// ---------------------------------------------------------------------------
// AlertToaster — transient toasts for newly-raised, unacknowledged alerts.
// Each toast auto-dismisses; clicking it opens the alert center. Toast bodies
// read live from the store by id, so acknowledging or dismissing an alert
// elsewhere makes its toast vanish immediately.
// ---------------------------------------------------------------------------

/** How long a toast stays on screen before auto-dismissing. */
const TOAST_MS = 6000;

export function AlertToaster() {
  const alerts = useNovaStore(sel.alerts);
  const setOpen = useNovaStore((s) => s.setAlertCenterOpen);

  const [toastIds, setToastIds] = useState<string[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function removeToast(id: string) {
    setToastIds((prev) => prev.filter((x) => x !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }

  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id));
    // Forget ids that have cleared, so a re-raised condition toasts again.
    for (const id of Array.from(seen.current)) {
      if (!currentIds.has(id)) seen.current.delete(id);
    }

    const fresh = alerts.filter((a) => !seen.current.has(a.id) && !a.acknowledged);
    if (fresh.length === 0) return;

    for (const a of fresh) {
      seen.current.add(a.id);
      const timer = setTimeout(() => {
        setToastIds((prev) => prev.filter((x) => x !== a.id));
        timers.current.delete(a.id);
      }, TOAST_MS);
      timers.current.set(a.id, timer);
    }
    setToastIds((prev) => [...prev, ...fresh.map((a) => a.id)]);
  }, [alerts]);

  // Clear pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const byId = new Map(alerts.map((a) => [a.id, a] as const));
  const visible = toastIds
    .map((id) => byId.get(id))
    .filter((a): a is Alert => a != null && !a.acknowledged);

  if (visible.length === 0) return null;

  return (
    <Flex
      position="fixed"
      bottom={4}
      right={4}
      direction="column"
      gap={2}
      zIndex={1400}
      maxW="360px"
      pointerEvents="none"
    >
      {visible.map((alert) => {
        const color = SEVERITY_STATUS[alert.severity];
        return (
          <Flex
            key={alert.id}
            role="status"
            pointerEvents="auto"
            onClick={() => {
              setOpen(true);
              removeToast(alert.id);
            }}
            cursor="pointer"
            gap={2.5}
            p={3}
            bg="bg.surface"
            border="1px solid"
            borderColor="border.default"
            borderLeft="3px solid"
            borderLeftColor={color}
            borderRadius="control"
            boxShadow="0 6px 20px rgba(0,0,0,0.35)"
            align="flex-start"
            _hover={{ borderColor: color }}
            style={{ transition: "border-color 150ms ease" }}
          >
            <Icon name={SEVERITY_ICON[alert.severity]} size={18} color={color} mt="1px" />
            <Box flex="1" minW={0}>
              <Text fontSize="sm" fontWeight="600" color="text.primary">
                {alert.title}
              </Text>
              {alert.detail && (
                <Text fontSize="xs" color="text.muted" mt={0.5} lineClamp={2}>
                  {alert.detail}
                </Text>
              )}
            </Box>
            <Box
              as="button"
              flexShrink={0}
              p={0.5}
              color="text.muted"
              _hover={{ color: "text.primary" }}
              border="none"
              bg="transparent"
              cursor="pointer"
              aria-label="Dismiss"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(alert.id);
              }}
            >
              <Icon name="close" size={14} />
            </Box>
          </Flex>
        );
      })}
    </Flex>
  );
}
