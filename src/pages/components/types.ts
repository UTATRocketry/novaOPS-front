// types.ts

export type SensorData = {
    name: string;
    value: string;
    unit: string;
    timestamp: number;
};

export type SensorUpdateCallback = (sensors: SensorData[]) => void;

export type Command = {
    type: 'solenoid' | 'servo';
    name: string;
    state: string;
};

export type SensorConfig = {
    hatID: number;
    channelID: number;
    name: string;
    unit?: string;
    type?: string;
    calibration?: number[][];
};
export type RelayConfig = {
    channelID: number;
    name: string;
    type?: string;
}
export type ServoConfig = {
    channelID: number;
    name: string;
    open_pos: number;
    open_over?: number;
    close_pos: number;
    close_over?: number;
    relayID?: number;
}
export type Config = {
    sensors: Array<SensorConfig>;
    relays: Array<RelayConfig>;
    servos: Array<ServoConfig>;
}

export type ConfigUpdateCallback = (config: Config) => void;

export type UIComponent = {
    id: string;
    label: string;
    UIType: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type SensorSvgProps = {
    name: string;
    value: string;
    unit: string;
    x: number;
    y: number;
    fontSize?: number;
    fillColor?: string;
    strokeColor?: string;
    textColor?: string;
};

export type ActuatorSvgProps = {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize?: number;
    fillColor?: string;
    strokeColor?: string;
    textColor?: string;
    state: boolean;
    powerState?: boolean;
    onClick: () => void;
    onClick2?: () => void;
};