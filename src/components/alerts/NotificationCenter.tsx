"use client";

import { useAlertMonitor } from "@/lib/alerts";
import { AlertToaster } from "./AlertToaster";
import { AlertCenter } from "./AlertCenter";

// ---------------------------------------------------------------------------
// NotificationCenter — mount ONCE at the app shell. Runs the alert monitor
// (state → alerts + bus → alerts) and renders the two global surfaces: the
// transient toaster and the alert-center dialog. It renders no chrome itself,
// so it is safe to drop anywhere in the shell tree.
// ---------------------------------------------------------------------------

export function NotificationCenter() {
  useAlertMonitor();

  return (
    <>
      <AlertToaster />
      <AlertCenter />
    </>
  );
}
