"use client";

import { Box, Button, Dialog, Flex, Portal, Text } from "@chakra-ui/react";
import { Icon, Mono } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import {
  SEVERITY_ICON,
  SEVERITY_RANK,
  SEVERITY_STATUS,
} from "@/lib/alerts";
import type { Alert } from "@/lib/alerts";

// ---------------------------------------------------------------------------
// AlertCenter — the global alert dialog opened from the top-bar chips (or a
// toast). Lists every active alert most-severe first, with acknowledge/dismiss.
// ---------------------------------------------------------------------------

function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/** Most-severe first; within a severity, newest first. */
function byPriority(a: Alert, b: Alert): number {
  const d = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  return d !== 0 ? d : b.ts - a.ts;
}

function AlertRow({ alert, now }: { alert: Alert; now: number }) {
  const acknowledge = useNovaStore((s) => s.acknowledgeAlert);
  const dismiss = useNovaStore((s) => s.dismissAlert);
  const color = SEVERITY_STATUS[alert.severity];

  return (
    <Flex
      gap={3}
      p={3}
      borderRadius="control"
      bg="bg.surfaceRaised"
      borderLeft="3px solid"
      borderColor={color}
      opacity={alert.acknowledged ? 0.6 : 1}
      align="flex-start"
    >
      <Icon name={SEVERITY_ICON[alert.severity]} size={18} color={color} mt="1px" />

      <Box flex="1" minW={0}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text fontSize="sm" fontWeight="600" color="text.primary">
            {alert.title}
          </Text>
          {alert.acknowledged && (
            <Mono fontSize="2xs" color="text.muted">
              ack&apos;d
            </Mono>
          )}
        </Flex>
        {alert.detail && (
          <Text fontSize="xs" color="text.muted" mt={0.5}>
            {alert.detail}
          </Text>
        )}
        <Mono fontSize="2xs" color="text.muted" mt={1} display="block">
          {alert.source} · {relativeTime(alert.ts, now)}
        </Mono>
      </Box>

      <Flex direction="column" gap={1} flexShrink={0}>
        {!alert.acknowledged && (
          <Button size="xs" variant="ghost" onClick={() => acknowledge(alert.id)}>
            Ack
          </Button>
        )}
        {alert.kind === "event" && (
          <Button size="xs" variant="ghost" onClick={() => dismiss(alert.id)}>
            Dismiss
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

export function AlertCenter() {
  const open = useNovaStore(sel.alertCenterOpen);
  const setOpen = useNovaStore((s) => s.setAlertCenterOpen);
  const alerts = useNovaStore(sel.alerts);
  const acknowledgeAll = useNovaStore((s) => s.acknowledgeAllAlerts);
  const clearEvents = useNovaStore((s) => s.clearEventAlerts);

  const now = Date.now();
  const sorted = [...alerts].sort(byPriority);
  const hasEvents = alerts.some((a) => a.kind === "event");

  return (
    <Dialog.Root open={open} onOpenChange={({ open: o }) => setOpen(o)}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="480px">
            <Dialog.Header>
              <Flex align="center" gap={2}>
                <Icon name="notifications" size={20} color="text.primary" />
                <Dialog.Title>Alerts</Dialog.Title>
                {alerts.length > 0 && (
                  <Mono fontSize="xs" color="text.muted">
                    {alerts.length}
                  </Mono>
                )}
              </Flex>
            </Dialog.Header>

            <Dialog.Body>
              {sorted.length === 0 ? (
                <Flex direction="column" align="center" justify="center" py={10} gap={2} color="text.muted">
                  <Icon name="check_circle" size={28} color="nominal" />
                  <Text fontSize="sm">No active alerts</Text>
                </Flex>
              ) : (
                <Flex direction="column" gap={2}>
                  {sorted.map((a) => (
                    <AlertRow key={a.id} alert={a} now={now} />
                  ))}
                </Flex>
              )}
            </Dialog.Body>

            <Dialog.Footer gap={2}>
              {hasEvents && (
                <Button variant="outline" size="sm" onClick={clearEvents}>
                  Clear events
                </Button>
              )}
              {sorted.some((a) => !a.acknowledged) && (
                <Button variant="outline" size="sm" onClick={acknowledgeAll}>
                  Acknowledge all
                </Button>
              )}
              <Button size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild>
              <Box
                as="button"
                position="absolute"
                top={3}
                right={3}
                p={1}
                borderRadius="control"
                color="text.muted"
                _hover={{ color: "text.primary" }}
                border="none"
                bg="transparent"
                cursor="pointer"
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={16} />
              </Box>
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
