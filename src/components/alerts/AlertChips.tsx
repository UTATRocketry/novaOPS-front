"use client";

import { Box, Flex } from "@chakra-ui/react";
import { Chip, Icon, Mono } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { SEVERITIES_DESC, SEVERITY_ICON, SEVERITY_STATUS } from "@/lib/alerts";
import type { AlertSeverity } from "@/lib/alerts";

// ---------------------------------------------------------------------------
// AlertChips — top-bar cluster
//
// One chip per non-empty severity, coloured by meaning, showing the live count.
// The whole cluster is a single button that opens the alert center. When there
// are no alerts it collapses to a muted "all clear" chip (still opens the
// center, which shows its empty state).
// ---------------------------------------------------------------------------

export function AlertChips() {
  const alerts = useNovaStore(sel.alerts);
  const setOpen = useNovaStore((s) => s.setAlertCenterOpen);

  const counts = {} as Record<AlertSeverity, number>;
  for (const sev of SEVERITIES_DESC) counts[sev] = 0;
  for (const a of alerts) counts[a.severity] += 1;

  const nonEmpty = SEVERITIES_DESC.filter((sev) => counts[sev] > 0);
  const total = alerts.length;

  return (
    <Box
      as="button"
      onClick={() => setOpen(true)}
      bg="transparent"
      border="none"
      p={0}
      cursor="pointer"
      aria-label={total > 0 ? `${total} active alerts` : "No active alerts"}
      title={total > 0 ? `${total} active alert${total === 1 ? "" : "s"}` : "No active alerts"}
      _hover={{ filter: "brightness(1.15)" }}
      style={{ transition: "filter 150ms ease" }}
    >
      <Flex align="center" gap={2}>
        {total === 0 ? (
          <Chip status="neutral">
            <Icon name="check_circle" size={12} color="currentColor" />
            <Mono>OK</Mono>
          </Chip>
        ) : (
          nonEmpty.map((sev) => (
            <Chip key={sev} status={SEVERITY_STATUS[sev]}>
              <Icon name={SEVERITY_ICON[sev]} size={12} color="currentColor" />
              <Mono>{counts[sev]}</Mono>
            </Chip>
          ))
        )}
      </Flex>
    </Box>
  );
}
