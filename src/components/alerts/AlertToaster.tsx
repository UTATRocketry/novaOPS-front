"use client";

import { useEffect, useRef } from "react";
import {
  Portal,
  Stack,
  Toast,
  Toaster as ChakraToaster,
  createToaster,
} from "@chakra-ui/react";
import { useNovaStore, sel } from "@/lib/store";
import { SEVERITY_CHAKRA_STATUS, SEVERITY_PALETTE } from "@/lib/alerts";

// ---------------------------------------------------------------------------
// AlertToaster — transient toasts, built on Chakra's own toaster.
//
// The store stays the single source of truth: an effect diffs the alert list
// and drives Chakra imperatively (`create` for newly-active alerts, `dismiss`
// when an alert clears or is acknowledged elsewhere). Chakra owns positioning,
// stacking, timers, animation and pause-on-hover. Toasts render top-center and
// open the alert center on click.
// ---------------------------------------------------------------------------

/** How long a toast stays before Chakra auto-dismisses it. */
const TOAST_MS = 6000;

/** Module-level singleton — toasts are raised through this instance. */
const alertToaster = createToaster({
  placement: "top",
  pauseOnPageIdle: true,
  max: 5,
});

interface ToastMeta {
  palette: string;
  alertId: string;
}

export function AlertToaster() {
  const alerts = useNovaStore(sel.alerts);
  const setOpen = useNovaStore((s) => s.setAlertCenterOpen);

  // Alert ids we have already raised a toast for (and not yet torn down).
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const byId = new Map(alerts.map((a) => [a.id, a] as const));

    // Tear down toasts whose alert cleared or was acknowledged.
    for (const id of Array.from(seen.current)) {
      const a = byId.get(id);
      if (!a || a.acknowledged) {
        alertToaster.dismiss(id);
        seen.current.delete(id);
      }
    }

    // Raise a toast for each newly-active, unacknowledged alert.
    for (const a of alerts) {
      if (seen.current.has(a.id) || a.acknowledged) continue;
      seen.current.add(a.id);
      alertToaster.create({
        id: a.id,
        type: SEVERITY_CHAKRA_STATUS[a.severity],
        title: a.title,
        description: a.detail,
        duration: TOAST_MS,
        meta: { palette: SEVERITY_PALETTE[a.severity], alertId: a.id } satisfies ToastMeta,
      });
    }
  }, [alerts]);

  return (
    <Portal>
      <ChakraToaster toaster={alertToaster} insetInline={{ mdDown: "4" }}>
        {(toast) => {
          const meta = toast.meta as ToastMeta | undefined;
          return (
            <Toast.Root
              colorPalette={meta?.palette}
              width={{ base: "92vw", sm: "sm" }}
              cursor="pointer"
              onClick={() => {
                setOpen(true);
                alertToaster.dismiss(toast.id);
              }}
            >
              <Toast.Indicator />
              <Stack gap="1" flex="1" maxWidth="100%">
                {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
                {toast.description && (
                  <Toast.Description>{toast.description}</Toast.Description>
                )}
              </Stack>
              <Toast.CloseTrigger onClick={(e) => e.stopPropagation()} />
            </Toast.Root>
          );
        }}
      </ChakraToaster>
    </Portal>
  );
}
