import { registerTool } from "@/lib/tools/registry";

registerTool({
  slug: "relay",
  label: "Relay Tester",
  description: "Direct relay/load-switch control. On/off, momentary pulse, blink.",
  icon: "toggle_on",
});
