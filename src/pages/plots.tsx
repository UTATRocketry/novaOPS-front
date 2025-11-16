'use client';

import {
    Box,
    Button,
    Flex,
    Select,
    Text,
} from '@chakra-ui/react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend
} from 'recharts';
import { useEffect, useRef, useState } from 'react';
import { connectToSensorStream } from './backend';

// Settable constants
const TIME_WINDOW_SECONDS = 10; // visible time window
const TICK_INTERVAL_SECONDS = 0; // x-axis tick spacing

type SensorDataPoint = { time: number; value: number };

export default function SensorPlots() {
    const [sensorDict, setSensorDict] = useState<Record<string, SensorDataPoint[]>>({});
    const [availableSensors, setAvailableSensors] = useState<string[]>([]);
    const [selectedSensors, setSelectedSensors] = useState<string[]>(['']);

    const sensorStartTimes = useRef<Record<string, number>>({});
    const latestTime = useRef<number>(0);
    const useFakeBackend = false; // set to `true` to use the fake Backend

    const handleChange = (value: string, index: number) => {
        const updated = [...selectedSensors];
        updated[index] = value;
        setSelectedSensors(updated);
    };

    useEffect(() => {
        const cleanup = connectToSensorStream((sensors) => {
            const now = Date.now();
            setSensorDict((prev) => {
                const updated = { ...prev };
                sensors.forEach(({ name, value, timestamp }) => {
                    const num = parseFloat(value);
                    if (isNaN(num)) return;

                    const ts = timestamp ? new Date(timestamp).getTime() : now;

                    if (!sensorStartTimes.current[name]) {
                        sensorStartTimes.current[name] = ts;
                    }
                    const relTime = (ts - sensorStartTimes.current[name]) / 1000;
                    latestTime.current = Math.max(latestTime.current, relTime);

                    if (!updated[name]) updated[name] = [];
                    updated[name] = [...updated[name], { time: relTime, value: num }]
                        .filter(d => relTime - d.time <= TIME_WINDOW_SECONDS);
                });

                const allNames = Array.from(new Set(sensors.map(s => s.name)));
                setAvailableSensors((prev) => (prev.length === 0 ? allNames : prev));

                return updated;
            });
        }, useFakeBackend);

        return () => cleanup?.();
    }, []);

    return (
        <Box p={4}>
            <Text fontSize="2xl" mb={4} fontWeight="bold" textAlign="center">
                Sensor Plots
            </Text>

            <Flex gap={4} mb={6} wrap="wrap">
                {selectedSensors.map((sensor, idx) => (
                    <Select
                        key={idx}
                        value={sensor}
                        onChange={(e) => handleChange(e.target.value, idx)}
                        placeholder="Select a sensor"
                        width="200px"
                    >
                        {availableSensors.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </Select>
                ))}
                <Button onClick={() => setSelectedSensors([...selectedSensors, ''])}>
                    + Add Plot
                </Button>
            </Flex>

            <Flex direction="column" gap={8}>
                {selectedSensors.map((sensor, idx) =>
                    sensor && sensorDict[sensor] ? (
                        <Box key={sensor + idx}>
                            <Text mb={2} fontWeight="semibold" textAlign="center">
                                {sensor}
                            </Text>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={sensorDict[sensor]}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="time"
                                        domain={[Math.max(0, latestTime.current - TIME_WINDOW_SECONDS), latestTime.current]}
                                        type="number"
                                        interval="preserveStartEnd" //{TICK_INTERVAL_SECONDS}
                                        tickCount={TIME_WINDOW_SECONDS}
                                        allowDecimals={true}
                                        //tickFormatter={(v) => `${(latestTime.current-v).toFixed(0)}s`}
                                        tickFormatter={(v) => `${(v).toFixed(1)}s`}
                                        label={{ value: 'Time (s)', position: 'insideBottom', offset: -10 }}
                                    />
                                    <YAxis
                                        label={{
                                            value: 'Value',
                                            angle: -90,
                                            position: 'insideLeft',
                                            offset: 0
                                        }}
                                    />
                                    <Tooltip />
                                    {/* <Legend /> */}
                                    <Line type="monotone" dataKey="value" stroke="#3182ce" dot={false} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                            
                        </Box>
                    ) : null
                )}
            </Flex>
        </Box>
    );
}
