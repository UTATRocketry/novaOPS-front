import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adaptFlightData,
  adaptFlightEvents,
  getMissionStartMs,
  parseFasLink,
  resetFlightSession,
  resetMissionClock,
} from "./index";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000_000);
  resetFlightSession();
});

afterEach(() => {
  resetFlightSession();
  vi.useRealTimers();
});

const adapt = (raw: Record<string, unknown>) => adaptFlightData(raw);

describe("parseFasLink", () => {
  it("reads a full link block", () => {
    expect(parseFasLink({ connected: true, port: "COM3", baud: 460800, error: null })).toEqual({
      connected: true,
      port: "COM3",
      baud: 460800,
      error: null,
    });
  });

  it("returns undefined, not a closed link, when the block is absent", () => {
    for (const v of [undefined, null, 5, "x", [], true]) expect(parseFasLink(v)).toBeUndefined();
  });

  it("treats an empty port as no port", () => {
    expect(parseFasLink({ connected: false, port: "" })?.port).toBeNull();
  });

  it("defaults the missing fields to a closed, error-free link", () => {
    expect(parseFasLink({})).toEqual({ connected: false, port: null, baud: null, error: null });
  });

  it("accepts 0/1 as booleans and ignores wrong-typed fields", () => {
    expect(parseFasLink({ connected: 1, port: 5, baud: "9600", error: 7 })).toEqual({
      connected: true,
      port: null,
      baud: null,
      error: null,
    });
  });

  it("keeps an error string", () => {
    expect(parseFasLink({ connected: false, port: "COM3", error: "unplugged" })?.error).toBe("unplugged");
  });
});

describe("adaptFlightData: kinematics lifted from the first FMC", () => {
  const fmc = {
    imu_accel: { axes: [0, 0, 1], t_ms: 1234 },
    imu_gyro: { axes: [1, 2, 2] },
    accel_hg: { axes: [10, 0, 0] },
    mag: { axes: [3, 4, 0] },
    baro: { pressure_hpa: 1013.2, temp_c: 21.5, altitude_m: 88 },
  };

  it("converts the barometer block", () => {
    const t = adapt({ fas_fmc: { FMC_0: fmc } });
    expect(t).toMatchObject({ pressure: 1013.2, temperature: 21.5, altitude: 88 });
  });

  it("builds each axis triple with its magnitude", () => {
    const t = adapt({ fas_fmc: { FMC_0: fmc } });
    expect(t.accel).toEqual({ x: 0, y: 0, z: 1, magnitude: 1 });
    expect(t.gyro).toEqual({ x: 1, y: 2, z: 2, magnitude: 3 });
    expect(t.accelHi?.magnitude).toBe(10);
    expect(t.mag?.magnitude).toBe(5);
  });

  it("takes the timestamp from the accelerometer sample clock", () => {
    expect(adapt({ fas_fmc: { FMC_0: fmc } }).timestamp).toBe(1234);
  });

  it("uses the first FMC when there are several", () => {
    const t = adapt({ fas_fmc: { FMC_0: { baro: { altitude_m: 1 } }, FMC_1: { baro: { altitude_m: 2 } } } });
    expect(t.altitude).toBe(1);
  });

  it("leaves everything undefined for an empty payload, not zero", () => {
    const t = adapt({});
    expect(t).toEqual({});
    expect(t.altitude).toBeUndefined();
  });

  it.each([
    ["too few axes", { axes: [1, 2] }],
    ["a non-numeric axis", { axes: [1, "2", 3] }],
    ["a NaN axis", { axes: [1, NaN, 3] }],
    ["no axes", {}],
    ["a non-object", 5],
  ])("drops an axis block with %s instead of guessing", (_n, block) => {
    expect(adapt({ fas_fmc: { FMC_0: { imu_accel: block } } }).accel).toBeUndefined();
  });

  it("ignores non-finite barometer values", () => {
    const t = adapt({ fas_fmc: { FMC_0: { baro: { altitude_m: Infinity, pressure_hpa: "1000" } } } });
    expect(t.altitude).toBeUndefined();
    expect(t.pressure).toBeUndefined();
  });

  describe("GPS", () => {
    it("needs both a latitude and a longitude", () => {
      expect(adapt({ fas_fmc: { F: { gps_pos: { lat: 43.6 } } } }).gps).toBeUndefined();
      expect(adapt({ fas_fmc: { F: { gps_pos: { lat: 43.6, lon: -79.4 } } } }).gps).toEqual({ lat: 43.6, lon: -79.4 });
    });

    it("converts the info block: fix to a boolean, hdop back from x10", () => {
      const gps = adapt({
        fas_fmc: { F: { gps_pos: { lat: 1, lon: 2 }, gps_info: { alt_m: 120, fix: 3, sats: 9, hdop: 15, speed_mps: 4.5 } } },
      }).gps;
      expect(gps).toEqual({ lat: 1, lon: 2, alt: 120, fix: true, satellites: 9, hdop: 1.5, speed: 4.5 });
    });

    it("reports no fix when fix is 0", () => {
      expect(adapt({ fas_fmc: { F: { gps_pos: { lat: 1, lon: 2 }, gps_info: { fix: 0 } } } }).gps?.fix).toBe(false);
    });
  });
});

describe("adaptFlightData: FAS fleet", () => {
  it("parses boards, skipping entries missing a key, kind or id", () => {
    const t = adapt({
      fas_boards: [
        { key: "EPB:0", kind: "EPB", board_id: 0, online: 1, uptime_ms: 5000, fw_version: 3 },
        { key: "PMB:0", kind: "PMB", board_id: 0 },
        { kind: "FMC", board_id: 0 },
        { key: "X", board_id: 1 },
        "junk",
      ],
    });
    expect(t.boards).toEqual([
      { key: "EPB:0", kind: "EPB", boardId: 0, online: true, uptimeMs: 5000, fwVersion: 3 },
      { key: "PMB:0", kind: "PMB", boardId: 0, online: false },
    ]);
  });

  it("omits the fleet entirely when nothing parses", () => {
    expect(adapt({ fas_boards: [{ nope: 1 }] }).boards).toBeUndefined();
    expect(adapt({ fas_boards: "x" }).boards).toBeUndefined();
    expect(adapt({ fas_actuators: {} }).actuators).toBeUndefined();
  });

  it("parses actuator channels per board", () => {
    const t = adapt({
      fas_actuators: { EPB_0: [{ channel_idx: 2, load_sw_on: true, fault_bits: 4, pulse_us: 1500, period_us: 20000 }, { load_sw_on: true }, "x"], BAD: "x" },
    });
    expect(t.actuators).toEqual({ EPB_0: [{ channelIdx: 2, loadSwOn: true, faultBits: 4, pulseUs: 1500, periodUs: 20000 }] });
  });

  it("parses sensor masks and board power rails", () => {
    const t = adapt({
      fas_sensors: { EPB_0: { connected_mask: 3, saturated_mask: 1 } },
      fas_board_status: { EPB_0: { v_8v4: 8.4, i_24v0: 0.5 } },
    });
    expect(t.sensorMasks).toEqual({ EPB_0: { connectedMask: 3, saturatedMask: 1, errorMask: 0 } });
    expect(t.boardPower).toEqual({ EPB_0: { v8v4: 8.4, i24v: 0.5 } });
  });

  it("parses PMB power, voltage monitor, temperatures, charger and charge config", () => {
    const t = adapt({
      fas_pmb: {
        PMB_0: {
          pwr: { v_8v4: 8.4, p_24v0: 12 },
          vmon: { v_batt: 15.2, v_main: 24, buck_on: 1, protect: false, charger: true },
          temp: { temp_amb: 20, temp_buck: 41, temp_boost: 39 },
          charger: { i_chg_a: 1.5, charging: true, state: "cc", cells: 4 },
          chg_cfg: { i_setting: 10, cells: 4, enabled_intent: false, control_unknown: true },
        },
      },
    });
    const pmb = t.pmb!.PMB_0;
    expect(pmb.pwr).toEqual({ v8v4: 8.4, p24v0: 12 });
    expect(pmb.vmon).toEqual({ vBatt: 15.2, vMain: 24, buckOn: true, protect: false, charger: true });
    expect(pmb.temp).toEqual({ ambient: 20, buck: 41, boost: 39 });
    expect(pmb.charger).toEqual({ iChg: 1.5, charging: true, state: "cc", cells: 4 });
    expect(pmb.chgCfg).toEqual({ iSetting: 10, cells: 4, enabledIntent: false, controlUnknown: true });
  });

  it("leaves a PMB block out rather than reporting zeros when its data is absent", () => {
    const pmb = adapt({ fas_pmb: { PMB_0: {} } }).pmb!.PMB_0;
    expect(pmb.vmon).toBeUndefined();
    expect(pmb.charger).toBeUndefined();
  });

  it("parses FMC health, SD card, radio and temperatures", () => {
    const t = adapt({
      fas_fmc: {
        FMC_0: {
          health: { imu_ok: 1, baro_ok: false, gps_present: true },
          sd: { state: 2, state_name: "full", pct_used: 99.5, near_full: true, full: true, rate_div: null, stalled: false },
          radio: { state_name: "ready", queue_depth: 3, powered: 1, fault: 0 },
          temp: { temp_h7: 55, temp_pwr: 40 },
        },
      },
    });
    const fmc = t.fmc!.FMC_0;
    expect(fmc.health).toEqual({ imuOk: true, baroOk: false, gpsPresent: true });
    expect(fmc.sd).toMatchObject({ state: 2, stateName: "full", pctUsed: 99.5, nearFull: true, full: true, rateDiv: null, stalled: false });
    expect(fmc.radio).toMatchObject({ stateName: "ready", queueDepth: 3, powered: true, fault: false });
    expect(fmc.temp).toEqual({ h7: 55, pwr: 40 });
  });

  it("keeps a null SD rate divisor (a custom rate) distinct from a missing one", () => {
    expect(adapt({ fas_fmc: { F: { sd: { rate_div: null } } } }).fmc!.F.sd!.rateDiv).toBeNull();
    expect(adapt({ fas_fmc: { F: { sd: { rate_div: 4 } } } }).fmc!.F.sd!.rateDiv).toBe(4);
    expect(adapt({ fas_fmc: { F: { sd: {} } } }).fmc!.F.sd).not.toHaveProperty("rateDiv");
  });

  it("parses the ignition module controller and recovery arming boards", () => {
    const t = adapt({
      fas_imc: { armed: true, arm_line: 1, board_id: 2 },
      fas_rab: { "RAB:0": { rab_id: 0, fc_armed: true, arm_mismatch: true, rx_count8: 9 }, "RAB:1": "x" },
    });
    expect(t.imc).toEqual({ armed: true, armLine: true, disarmLine: false, boardId: 2 });
    expect(t.rab).toEqual({
      "RAB:0": {
        rabId: 0,
        fcArmed: true,
        armLine: false,
        disarmLine: false,
        fcArmedGpio: false,
        fmcRx: false,
        armMismatch: true,
        armExpected: false,
        rxCount8: 9,
      },
    });
  });

  it("does not read the superseded RAB disagree flag", () => {
    const rab = adapt({ fas_rab: { "RAB:0": { disagree: true } } }).rab!["RAB:0"];
    expect(rab).not.toHaveProperty("disagree");
    expect(rab.armMismatch).toBe(false);
  });

  // Known gap: a present-but-incomplete IMC block reports "disarmed" for fields
  // the board did not send, though an arming indicator should say unknown.
  it.fails("does not report an IMC with no arm state as disarmed", () => {
    expect(adapt({ fas_imc: { board_id: 1 } }).imc?.armed).toBeUndefined();
  });

  describe("aux", () => {
    it("parses power, PPS and RF amplifier state", () => {
      const aux = adapt({ fas_aux: { runcam_powered: 1, pps_present: true, rf_pa_on: false, rf_pa_inhibited: true, pps_count: 7, pps_age_ms: 120, aux_flags: 3 } }).aux;
      expect(aux).toEqual({ runcamPowered: true, ppsPresent: true, rfPaOn: false, rfPaInhibited: true, ppsCount: 7, ppsAgeMs: 120, flags: 3 });
    });

    it("preserves a null RunCam record time, which is 'not applicable' and not zero seconds", () => {
      expect(adapt({ fas_aux: { runcam_record_s: null } }).aux?.runcamRecordS).toBeNull();
      expect(adapt({ fas_aux: { runcam_record_s: 0 } }).aux?.runcamRecordS).toBe(0);
      expect(adapt({ fas_aux: { runcam_record_s: "x" } }).aux?.runcamRecordS).toBeNull();
      expect(adapt({ fas_aux: {} }).aux).not.toHaveProperty("runcamRecordS");
    });
  });

  describe("radio config", () => {
    const record = {
      callsign: "VE3UTA",
      network_id: 7,
      vehicle_node_id: 2,
      allocation_low_hz: 902e6,
      allocation_high_hz: 928e6,
      lora: { frequency_hz: 915e6, bandwidth_hz: 125000, power_dbm: 20, spreading_factor: 9, coding_rate: "4/5", preamble_symbols: 8 },
      pressure_channels: [{ board_id: 0, channel: 1 }, { board_id: 1 }],
      rf_chain: { cycle_period_ms: 1000, warmup_ms: 50, duty_cycle: 1, pa_board_id: 0, pa_channel: null },
    };

    it("parses a full record and its transaction envelope", () => {
      const cfg = adapt({ fas_radio_cfg: { config: record, status: 0, status_name: "ok", persisted: true, generation: 4 } }).radioConfig!;
      expect(cfg).toMatchObject({ status: 0, statusName: "ok", persisted: true, generation: 4 });
      expect(cfg.config).toMatchObject({ callsign: "VE3UTA", networkId: 7, vehicleNodeId: 2 });
      expect(cfg.config!.lora).toMatchObject({ frequencyHz: 915e6, spreadingFactor: 9, codingRate: "4/5" });
      expect(cfg.config!.pressureChannels).toEqual([{ boardId: 0, channel: 1 }]);
      expect(cfg.config!.rfChain).toMatchObject({ cyclePeriodMs: 1000, dutyCycle: true, paBoardId: 0, paChannel: null });
    });

    it("keeps an unfitted peripheral binding (null) distinct from an absent one", () => {
      const chain = adapt({ fas_radio_cfg: { config: record } }).radioConfig!.config!.rfChain;
      expect(chain.paChannel).toBeNull();
      expect(chain).not.toHaveProperty("runcamBoardId");
    });

    it("reports a decode error instead of a half-parsed record", () => {
      const cfg = adapt({ fas_radio_cfg: { config_decode_error: "bad crc", raw_hex: "00ff", config: record } }).radioConfig!;
      expect(cfg.decodeError).toBe("bad crc");
      expect(cfg.config).toBeUndefined();
    });

    it("leaves the record out when its LoRa or RF-chain section is missing", () => {
      const { lora: _l, ...noLora } = record;
      expect(adapt({ fas_radio_cfg: { config: noLora, status: 1 } }).radioConfig).toEqual({ status: 1 });
    });

    it("is absent when the block holds nothing recognisable", () => {
      expect(adapt({ fas_radio_cfg: {} }).radioConfig).toBeUndefined();
    });
  });

  describe("soundboard", () => {
    it("parses status and clips", () => {
      const sound = adapt({
        fas_sound: {
          status: { clip_count: 2, playing_idx: 1, pct: 40, busy: 1, used_kb: 12, cap_kb: 100 },
          clips: [{ idx: 0, name: "beep", format: 1, length: 100, sample_rate: 8000 }, { idx: 1 }, { name: "no idx" }],
        },
      }).sound!;
      expect(sound.status).toEqual({ clipCount: 2, playingIdx: 1, pct: 40, busy: true, usedKb: 12, capKb: 100 });
      expect(sound.clips).toEqual([{ idx: 0, name: "beep", format: 1, length: 100, sampleRate: 8000 }, { idx: 1, name: "" }]);
    });

    it("keeps a null playing index (idle) distinct from a clip index", () => {
      expect(adapt({ fas_sound: { status: { playing_idx: null } } }).sound?.status?.playingIdx).toBeNull();
      expect(adapt({ fas_sound: { status: { playing_idx: 0 } } }).sound?.status?.playingIdx).toBe(0);
    });

    it("is absent when there is neither status nor clips", () => {
      expect(adapt({ fas_sound: {} }).sound).toBeUndefined();
      expect(adapt({ fas_sound: { clips: [] } }).sound).toBeUndefined();
    });
  });

  it("carries the bridge link state through", () => {
    expect(adapt({ fas_link: { connected: true, port: "COM3", baud: 9600 } }).link).toMatchObject({ connected: true, port: "COM3" });
    expect(adapt({}).link).toBeUndefined();
  });

  it("never throws on hostile input", () => {
    const junk = [null, 0, "x", [], {}, NaN, [null], { a: { b: [] } }];
    const keys = ["fas_fmc", "fas_boards", "fas_actuators", "fas_sensors", "fas_board_status", "fas_pmb", "fas_imc", "fas_rab", "fas_aux", "fas_radio_cfg", "fas_sound", "fas_link", "fas_fsm"];
    for (const key of keys) for (const v of junk) expect(() => adapt({ [key]: v })).not.toThrow();
  });
});

describe("adaptFlightData: flight state machine", () => {
  it("reads state and phase onto both the fsm block and the top level", () => {
    const t = adapt({ fas_fsm: { fas_state: "boost", flight_phase: "ascent" } });
    expect(t.fsm).toEqual({ state: "boost", phase: "ascent" });
    expect(t.state).toBe("boost");
    expect(t.phase).toBe("ascent");
  });

  it("ignores an fsm block with neither", () => {
    expect(adapt({ fas_fsm: { other: 1 } }).fsm).toBeUndefined();
  });

  it("clears the latched mission when the vehicle returns to standby", () => {
    adaptFlightEvents([{ name: "launch" }]);
    expect(getMissionStartMs()).not.toBeNull();
    adapt({ fas_fsm: { fas_state: "STANDBY" } });
    expect(getMissionStartMs()).toBeNull();
  });

  it("does not clear it for any other state", () => {
    adaptFlightEvents([{ name: "launch" }]);
    adapt({ fas_fsm: { fas_state: "boost" } });
    expect(getMissionStartMs()).not.toBeNull();
  });
});

describe("adaptFlightEvents", () => {
  it("normalises events, naming a nameless one UNKNOWN and keeping extra fields", () => {
    const { events } = adaptFlightEvents([{ name: "apogee", timestamp: 12, extra: "x" }, {}, { name: 5, timestamp: "t" }]);
    expect(events).toEqual([
      { name: "apogee", timestamp: 12, extra: "x" },
      { name: "UNKNOWN", timestamp: undefined },
      { name: "UNKNOWN", timestamp: undefined },
    ]);
  });

  it.each([
    ["launchDetected", ["launch", "liftoff", "ignition", "launch_detected"]],
    ["motorBurnout", ["burnout", "motor_burnout", "motor_cutoff", "meco"]],
    ["apogeeDetected", ["apogee", "apogee_detected"]],
    ["drogueDeployed", ["drogue", "drogue_deploy", "drogue_deployed"]],
    ["mainDeployed", ["main", "main_deploy", "main_deployed", "main_chute", "chute_deploy"]],
    ["landingDetected", ["landing", "landed", "touchdown", "touch_down"]],
  ] as const)("recognises every name for %s, in any case, and only that milestone", (milestone, names) => {
    for (const name of names) {
      resetFlightSession();
      const { milestones } = adaptFlightEvents([{ name: name.toUpperCase() }]);
      const set = Object.entries(milestones).filter(([, v]) => v).map(([k]) => k);
      expect(set, name).toEqual([milestone]);
    }
  });

  it("recognises none of an unknown event", () => {
    expect(Object.values(adaptFlightEvents([{ name: "mystery" }]).milestones).some(Boolean)).toBe(false);
  });

  it("latches a milestone: it never reverts when later messages omit it", () => {
    adaptFlightEvents([{ name: "apogee" }]);
    const later = adaptFlightEvents([{ name: "drogue" }]);
    expect(later.milestones).toMatchObject({ apogeeDetected: true, drogueDeployed: true });
    expect(adaptFlightEvents([]).milestones.apogeeDetected).toBe(true);
  });

  it("returns a fresh milestones object each time", () => {
    const a = adaptFlightEvents([{ name: "launch" }]).milestones;
    const b = adaptFlightEvents([]).milestones;
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  describe("T-0", () => {
    it("is null until launch", () => {
      expect(adaptFlightEvents([{ name: "apogee" }]).launchEpochMs).toBeNull();
      expect(getMissionStartMs()).toBeNull();
    });

    it("is stamped with the wall clock at first launch detection", () => {
      expect(adaptFlightEvents([{ name: "launch" }]).launchEpochMs).toBe(5_000_000);
      expect(getMissionStartMs()).toBe(5_000_000);
    });

    it("is never overwritten by a later launch event", () => {
      adaptFlightEvents([{ name: "launch" }]);
      vi.setSystemTime(9_000_000);
      expect(adaptFlightEvents([{ name: "liftoff" }]).launchEpochMs).toBe(5_000_000);
    });

    it("is cleared by resetMissionClock", () => {
      adaptFlightEvents([{ name: "launch" }]);
      resetMissionClock();
      expect(getMissionStartMs()).toBeNull();
    });
  });

  it("reads phase and state from any event, the last one winning", () => {
    const out = adaptFlightEvents([
      { name: "a", flight_phase: "boost", fas_state: "armed" },
      { name: "b", flight_phase: "coast" },
    ]);
    expect(out).toMatchObject({ phase: "coast", state: "armed" });
  });

  it("starts a new flight cycle when the state returns to standby, before applying that message's events", () => {
    adaptFlightEvents([{ name: "launch" }, { name: "apogee" }]);
    const out = adaptFlightEvents([{ name: "reset", fas_state: "standby" }]);
    expect(out.milestones.launchDetected).toBe(false);
    expect(out.milestones.apogeeDetected).toBe(false);
    expect(out.launchEpochMs).toBeNull();
  });

  it("latches a launch that arrives in the same message as standby", () => {
    const out = adaptFlightEvents([{ name: "launch", fas_state: "standby" }]);
    expect(out.milestones.launchDetected).toBe(true);
  });
});
