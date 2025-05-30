// backend.ts
import {SensorData, SensorUpdateCallback, Command, Config, ConfigUpdateCallback} from './components/types';

const BACKEND_URL = 'http://192.168.0.1:8000';
// /start_saving_data, /stop_saving_data, /download_data_file, /upload_config, /update_config
const WS_URL = 'ws://192.168.0.1:8000/ws_basic';


const FAKE_SENSOR_NAMES = ['PFT', 'POT', 'PVO', 'MOT', 'MFT', 'PFM', 'PCC', 'PGSO', 'PGS'];
let socket: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout;

/**
 * Connects to the sensor data WebSocket or starts fake data generation.
 */
export function connectToSensorStream(onUpdate: SensorUpdateCallback, useFake = false) {
    if (useFake) {
        // Simulate sensor updates every 500ms
        const fakeInterval = setInterval(() => {
            const sensors: SensorData[] = FAKE_SENSOR_NAMES.map(name => ({
                name,
                value: (Math.random() * 100).toFixed(2),
                unit: 'psi',
                timestamp: Date.now()
            }));
            onUpdate(sensors);
        }, 500);

        return () => clearInterval(fakeInterval);
    }

    const connect = () => {
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            console.log('[WebSocket] Connected');
        };

        socket.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                if (data?.sensors) {
                    onUpdate(data.sensors);
                }
            } catch (err) {
                console.error('[WebSocket] Message parse error:', err);
            }
        };

        socket.onerror = error => {
            console.error('[WebSocket] Error:', error);
        };

        socket.onclose = () => {
            console.warn('[WebSocket] Connection closed. Retrying in 2s...');
            reconnectTimeout = setTimeout(connect, 2000);
        };
    };

    connect();

    return () => {
        clearTimeout(reconnectTimeout);
        socket?.close();
    };
}

/**
 * Sends a command to the backend HTTP endpoint or logs it if in fake mode.
 */
export async function sendCommand(command: Command, useFake = false): Promise<void> {
    if (useFake) {
        console.log('[FAKE COMMAND]', command);
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/send_command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(command)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('[COMMAND SENT]', command);
    } catch (err) {
        console.error('[COMMAND ERROR]', err);
    }
}

export async function downloadDataFile(useFake = false): Promise<void> {
    if (useFake) {
        console.log('[FAKE DATA FILE]');
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/download_data_file`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        let filename = "data.csv"
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="([^"]+)"/);
            if (match && match[1] !== '') {
                filename = match[1];
            }
        }
        return response.blob().then(blob => ({blob, filename}));
        console.log('[DATA FILE DOWNLOADED]');

    }
    catch (err) {
        console.error('[DATA FILE ERROR]', err);
    }
}

/**
 * Gets the config from the backend HTTP endpoint or logs it if in fake mode.
 */
export async function getConfig(onUpdate: ConfigUpdateCallback, useFake = false): Promise<void> {
    if (useFake) {
        console.log('[FAKE CONFIG]');
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/get_config`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const configJSON = JSON.parse( await response.text() );
        // Convert JSON structure to match the Config type
        const config: Config = {
            sensors: Object.values(configJSON.sensors),
            relays: Object.values(configJSON.relays),
            servos: Object.values(configJSON.servos)
        };
        onUpdate(config);
        console.log('[CONFIG LOADED]');
    }
    catch (err) {
        console.error('[CONFIG ERROR]', err);
    }
}


export async function loadConfig(useFake = false): Promise<void> {
    if (useFake) {
        console.log('[FAKE CONFIG]');
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/update_config`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        console.log('[CONFIG LOADED]');
    }
    catch (err) {
        console.error('[CONFIG ERROR]', err);
    }
}

/**
 * Sends a config to the backend HTTP endpoint or logs it if in fake mode.
 */
export async function setConfig(config: string, useFake = false): Promise<void> {
    if (useFake) {
        console.log('[FAKE CONFIG]', config);
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/upload_config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('[CONFIG SENT]', config);
    } catch (err) {
        console.error('[CONFIG ERROR]', err);
    }
}

export async function startRecording(useFake = false): Promise<void> {
    if (useFake) {
        console.log('[FAKE STARTED RECORDING DATA]');
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/start_saving_data`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        console.log('[STARTED RECORDING DATA]');
    }
    catch (err) {
        console.error('[START RECORDING DATA ERROR]', err);
    }
}

export async function stopRecording(useFake = false): Promise<void> {
    if (useFake) {
        console.log('[FAKE STOPPED RECORDING DATA]');
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/stop_saving_data`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        console.log('[STOPPED RECORDING DATA]');
    }
    catch (err) {
        console.error('[STOP RECORDING DATA ERROR]', err);
    }
}