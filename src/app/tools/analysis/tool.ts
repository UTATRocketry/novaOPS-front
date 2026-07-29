import { registerTool } from "@/lib/tools/registry";

registerTool({
  slug: "analysis",
  label: "Data Analysis",
  description:
    "Calibrate and plot a recorded capture. Merges novaGround/novaThermo/FAS logs, overlays actuation events, exports CSV.",
  icon: "analytics",
});
