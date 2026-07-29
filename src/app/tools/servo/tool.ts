import { registerTool } from "@/lib/tools/registry";

registerTool({
  slug: "servo",
  label: "Servo Tester",
  description: "Direct PWM pulse control. Half-circle dial, presets, A/B sweep.",
  icon: "tune",
});
