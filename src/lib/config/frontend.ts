/**
 * Devices / Packets / Procedures are now part of the backend `SystemConfig`
 * contract (see `src/lib/types.ts`). They are edited on the Config page and
 * round-trip through PUT /api/config like every other section, then consumed by
 * the Devices, Console, and Engine pages respectively.
 *
 * These re-exports keep the `@/lib/config` import path stable for the tables.
 */
export type { DeviceEntry, PacketEntry, ProcedureEntry } from "../types";
