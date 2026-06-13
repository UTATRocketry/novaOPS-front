"use client";

import { useNovaStore, sel } from "@/lib/store";
import type { SafetyRules } from "@/lib/types";
import { useConfig } from "./useConfig";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandGateInput {
  /** Actuator or system command name to check against safetyRules. */
  name: string;
  /**
   * Command state (e.g. "open", "close"). If omitted, any rule whose key
   * matches `name` is treated as a match.
   */
  state?: string;
}

export interface CommandGateResult {
  /** Whether the UI should enable this command. Advisory only — backend re-enforces. */
  canSend: boolean;
  /** Human-readable reason when canSend is false. null when canSend is true. */
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------

/**
 * Test whether a command (name + optional state) appears in a safetyRules array.
 *
 * Matching is case-insensitive. A rule value of "ALL" blocks every state for
 * that command/actuator. Multiple states may be listed as an array.
 */
function matchesRules(
  rules: SafetyRules["hazardous"] | SafetyRules["critical"],
  name: string,
  state: string | undefined,
): boolean {
  if (!rules || rules.length === 0) return false;

  const nameLower = name.toLowerCase();

  for (const rule of rules) {
    // Keys are compared case-insensitively (backend may vary casing)
    const matchKey = Object.keys(rule).find((k) => k.toLowerCase() === nameLower);
    if (!matchKey) continue;

    const val = rule[matchKey];

    // "ALL" blocks every state for this name
    const isAll =
      val === "ALL" || (Array.isArray(val) && val.includes("ALL"));
    if (isAll) return true;

    // No state supplied → any rule for this name is a match
    if (state === undefined) return true;

    const stateLower = state.toLowerCase();
    if (Array.isArray(val)) {
      if (val.some((v) => v.toLowerCase() === stateLower)) return true;
    } else {
      if (val.toLowerCase() === stateLower) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns whether the current session may send a specific command.
 *
 * Three layers checked in order:
 * 1. Role — viewer cannot send; pad is restricted to safety-critical commands
 *    (those in safetyRules.hazardous or safetyRules.critical).
 * 2. Physical lockout — hazardous commands are blocked when locked (or unknown).
 * 3. safetyRules classification — determines which of the above apply.
 *
 * UI-advisory only. The backend independently enforces all of these rules and
 * will return 4xx if they are violated regardless of what this hook returns.
 *
 * @example
 * const { canSend, reason } = useCommandGate({ name: "SVFTV", state: "open" });
 * <Button isDisabled={!canSend} title={reason ?? undefined}>Open</Button>
 */
export function useCommandGate({ name, state }: CommandGateInput): CommandGateResult {
  const role = useNovaStore(sel.sessionRole);
  const isLocked = useNovaStore(sel.isLocked);
  const { data: config } = useConfig();

  // ── 1. No session ──────────────────────────────────────────────────────────
  if (!role) {
    return { canSend: false, reason: "Not connected" };
  }

  // ── 2. Viewer: read-only, no commands at all ───────────────────────────────
  if (role === "viewer") {
    return { canSend: false, reason: "Viewer role cannot send commands" };
  }

  // ── 3. Config not loaded — fail-safe: isHazardous cannot be computed, so
  //       the lockout check would be silently skipped for operator/admin. ────
  if (!config) {
    return { canSend: false, reason: "Configuration not loaded" };
  }

  // ── 4. Classify the command against safetyRules ────────────────────────────
  const safetyRules = config.safetyRules;
  const isHazardous = matchesRules(safetyRules?.hazardous, name, state);
  const isCritical  = matchesRules(safetyRules?.critical,  name, state);
  const isSafetyCritical = isHazardous || isCritical;

  // ── 5. Pad: safety-critical commands only ─────────────────────────────────
  if (role === "pad" && !isSafetyCritical) {
    return { canSend: false, reason: "Pad role: safety-critical commands only" };
  }

  // ── 6. Physical lockout blocks hazardous commands for all remaining roles ──
  if (isLocked && isHazardous) {
    return { canSend: false, reason: "Physical lockout active" };
  }

  // ── 7. Operator / admin (or pad with a safety-critical command): allowed ───
  return { canSend: true, reason: null };
}
