import type {
  ActuatorStatesMessage,
  ClientMessage,
  ClientRole,
  EngineDataMessage,
  ErrorMessage,
  FlightDataMessage,
  FlightEventsMessage,
  ParsedDataMessage,
  PhysicalLockoutMessage,
  PidLayoutMessage,
  RoleRequestMessage,
  SessionMessage,
  SnapshotMessage,
} from "../types";
import { validateLayout } from "../pid/serializer";
import { createStalenessTimer, useNovaStore } from "../store";
import type { FreshnessWindows } from "../store";
import { adaptFlightData, adaptFlightEvents, resetMissionClock } from "../flight";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface NovaSocketOptions {
  /** Per-stream freshness window overrides (ms). See DEFAULT_FRESHNESS_WINDOWS. */
  freshnessWindows?: Partial<FreshnessWindows>;
  /** WS endpoint path. Default "/ws". */
  path?: string;
  /** Initial reconnect delay in ms (doubles each attempt). Default 1 000. */
  baseReconnectDelayMs?: number;
  /** Upper bound on reconnect delay in ms. Default 30 000. */
  maxReconnectDelayMs?: number;
}

// ---------------------------------------------------------------------------
// NovaSocket
// ---------------------------------------------------------------------------

/**
 * Manages the single WebSocket connection to the NovaOps backend.
 *
 * Responsibilities:
 * - Opens/closes the WebSocket and reconnects with exponential backoff + jitter.
 * - Routes every inbound message by `type` into the Zustand store.
 * - flight_data and flight_events pass through the flight adapters before ingestion.
 * - Restores the desired (non-admin) role after each successful reconnect.
 * - Starts/stops the store staleness timer alongside the connection.
 *
 * Usage:
 *   const socket = new NovaSocket();
 *   socket.connect();
 *   // ...
 *   socket.disconnect(); // cleanup on teardown
 */
export class NovaSocket {
  private readonly path: string;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly freshnessWindows: Partial<FreshnessWindows>;

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stalenessCleanup: (() => void) | null = null;

  /**
   * Role to re-request after reconnect. Admin is never re-requested
   * automatically because we do not store the password.
   */
  private desiredRole: Exclude<ClientRole, "admin"> | null = null;

  /** Set to true by disconnect(); prevents any further reconnect attempts. */
  private destroyed = false;

  /**
   * True while a WebSocket is being opened but `onopen` has not yet fired.
   * Guards against double-connect races (e.g. React StrictMode double-mount).
   */
  private connecting = false;

  constructor(options: NovaSocketOptions = {}) {
    this.path = options.path ?? "/ws";
    this.baseDelay = options.baseReconnectDelayMs ?? 1_000;
    this.maxDelay = options.maxReconnectDelayMs ?? 30_000;
    this.freshnessWindows = options.freshnessWindows ?? {};
  }

  // ---- Public API ----------------------------------------------------------

  /**
   * Open the WebSocket. No-ops if already open or permanently disconnected.
   * Call once on mount; reconnects are handled internally.
   */
  connect(): void {
    if (this.destroyed || this.ws || this.connecting) return;
    if (typeof WebSocket === "undefined") return; // SSR guard

    this.connecting = true;
    useNovaStore.getState().markConnecting();

    this.ws = new WebSocket(this.buildUrl());
    this.ws.onopen = this.handleOpen;
    this.ws.onmessage = this.handleMessage;
    this.ws.onclose = this.handleClose;
    this.ws.onerror = this.handleError;
  }

  /**
   * Permanently close the connection and stop all timers.
   * Call on component unmount / app teardown.
   */
  disconnect(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.stopStalenessTimer();
    resetMissionClock();
    if (this.ws) {
      this.ws.onclose = null; // prevent handleClose from scheduling a reconnect
      this.ws.close();
      this.ws = null;
    }
    useNovaStore.getState().markDisconnected();
  }

  /**
   * Send a typed client→server message.
   * Silently drops if the socket is not open — callers should gate on
   * `sel.socketStatus` or `sel.canCommand`.
   */
  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Request a role change and persist it for automatic re-request on reconnect.
   * - viewer / pad / operator: stored and re-sent after each reconnect.
   * - admin: sent once only; password is not stored.
   */
  requestRole(role: ClientRole, password?: string): void {
    if (role !== "admin") {
      this.desiredRole = role as Exclude<ClientRole, "admin">;
    }
    const msg: RoleRequestMessage = { type: "role_request", role };
    if (role === "admin" && password) msg.password = password;
    this.send(msg);
  }

  // ---- Connection lifecycle ------------------------------------------------

  private handleOpen = (): void => {
    this.connecting = false;
    useNovaStore.getState().markOpen(); // also resets reconnectAttempt to 0
    this.startStalenessTimer();
    if (this.desiredRole) {
      this.send({ type: "role_request", role: this.desiredRole });
    }
  };

  private handleMessage = (event: MessageEvent<string>): void => {
    this.route(event.data);
  };

  private handleClose = (): void => {
    this.ws = null;
    this.connecting = false;
    this.stopStalenessTimer();
    useNovaStore.getState().markDisconnected();
    if (!this.destroyed) {
      this.scheduleReconnect();
    }
  };

  private handleError = (): void => {
    // onerror always precedes onclose for the same event — let handleClose
    // own the reconnect logic. We only update the store's error text here.
    useNovaStore.getState().setSocketError("WebSocket connection error");
  };

  private scheduleReconnect(): void {
    // Read the attempt count before incrementing so the first retry uses
    // attempt=0 → baseDelay, giving: 1 s, 2 s, 4 s, … up to maxDelay.
    const attempt = useNovaStore.getState().socket.reconnectAttempt;
    const delay =
      Math.min(this.baseDelay * 2 ** attempt, this.maxDelay) +
      Math.random() * 500; // jitter to spread reconnects under mass-reload

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) {
        useNovaStore.getState().incrementReconnect();
        this.connect();
      }
    }, delay);
  }

  // ---- Message router ------------------------------------------------------

  private route(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // non-JSON from server — ignore
    }

    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return;

    const m = msg as Record<string, unknown>;
    const store = useNovaStore.getState();

    switch (m["type"]) {
      case "session":
        store.ingestSession(m as unknown as SessionMessage);
        break;

      case "snapshot":
        store.ingestSnapshot(m as unknown as SnapshotMessage);
        break;

      case "actuator_states":
        store.ingestActuatorStates(m as unknown as ActuatorStatesMessage);
        break;

      case "engine_data": {
        const { data } = m as unknown as EngineDataMessage;
        if (Array.isArray(data)) store.ingestEngineData(data);
        break;
      }

      // parsed_data is a backward-compat alias for engine_data
      case "parsed_data": {
        const { sensors } = m as unknown as ParsedDataMessage;
        if (Array.isArray(sensors)) store.ingestEngineData(sensors);
        break;
      }

      case "flight_data": {
        const { data } = m as unknown as FlightDataMessage;
        const payload =
          typeof data === "object" && data !== null && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : {};
        store.ingestFlightData(adaptFlightData(payload));
        break;
      }

      case "flight_events": {
        const { events } = m as unknown as FlightEventsMessage;
        const payload = Array.isArray(events)
          ? (events as Array<Record<string, unknown>>)
          : [];
        store.ingestFlightEvents(adaptFlightEvents(payload));
        break;
      }

      case "physical_lockout": {
        const { state } = m as unknown as PhysicalLockoutMessage;
        if (state === "locked" || state === "unlocked") {
          store.ingestPhysicalLockout(state);
        }
        break;
      }

      case "error": {
        const { detail } = m as unknown as ErrorMessage;
        store.setSocketError(typeof detail === "string" ? detail : "Unknown server error");
        break;
      }

      case "pid_layout": {
        const { layout } = m as unknown as PidLayoutMessage;
        const parsed = layout ? validateLayout(layout) : null;
        store.ingestPidLayout(parsed);
        break;
      }

      default:
        // Console passthrough or unrecognised message.
        // These will be routed to the Console store slice in Phase 3.
        break;
    }
  }

  // ---- Helpers -------------------------------------------------------------

  private buildUrl(): string {
    if (typeof window === "undefined") {
      return `${process.env.NEXT_PUBLIC_NOVA_WS_BASE_URL ?? "ws://localhost:8000"}${this.path}`;
    }
    const base =
      process.env.NEXT_PUBLIC_NOVA_WS_BASE_URL ??
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
    return `${base}${this.path}`;
  }

  private startStalenessTimer(): void {
    this.stopStalenessTimer();
    this.stalenessCleanup = createStalenessTimer(this.freshnessWindows);
  }

  private stopStalenessTimer(): void {
    this.stalenessCleanup?.();
    this.stalenessCleanup = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
