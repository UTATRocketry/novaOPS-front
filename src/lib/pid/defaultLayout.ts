/**
 * Default P&ID layout shipped with the Engine page.
 *
 * The layout now lives in `defaultLayout.json` — the exact same shape the editor
 * serializes and the Download button exports — so a downloaded layout file can
 * replace it verbatim. This module just imports the JSON and types it.
 *
 * Vocabulary: Tank/Vessel, Ball2/Solenoid valves, PT/TC/LC instruments only.
 * Layout: pressurant (blue) → fuel (red) + oxidizer (green) → engine.
 */
import type { NovaPidLayout } from "./serializer";
import layout from "./testLayout.json";

export const DEFAULT_LAYOUT: NovaPidLayout = layout as unknown as NovaPidLayout;
