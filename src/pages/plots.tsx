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
import { useEffect, useState } from 'react';
import { connectToSensorStream } from './backend';

type SensorDataPoint = { index: number; value: number };

export default function SensorPlots() {
    const [sensorDict, setSensorDict] = useState<Record<string, SensorDataPoint[]>>({});
    const [availableSensors, setAvailableSensors] = useState<string[]>([]);
    const [selectedSensors, setSelectedSensors] = useState<string[]>(['']);
    const [startTime] = useState(() => Date.now());

    // Handle dropdown change
    const handleChange = (value: string, index: number) => {
        const updated = [...selectedSensors];
        updated[index] = value;
        setSelectedSensors(updated);
    };

    useEffect(() => {
        const cleanup = connectToSensorStream((sensors) => {
            const now = Math.floor((Date.now() - startTime) / 1000);
            setSensorDict((prev) => {
                const updated = { ...prev };
                sensors.forEach(({ name, value }) => {
                    const num = parseFloat(value);
                    if (isNaN(num)) return;

                    if (!updated[name]) updated[name] = [];
                    updated[name] = [...updated[name], { index: now, value: num }].slice(-100); // keep last 100 points
                });

                const allNames = Array.from(new Set(sensors.map(s => s.name)));
                setAvailableSensors((prev) =>
                    prev.length === 0 ? allNames : prev
                );

                return updated;
            });
        }, true); // set to `true` to use the fake Backend

        return () => cleanup?.();
    }, [startTime]);

    return (
        <Box p={4}>
            <Text fontSize="2xl" mb={4} fontWeight="bold" textAlign="center">
                Sensor Plots
            </Text>

            <Flex gap={4} mb={6}>
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
                            <Text mb={2} fontWeight="semibold">
                                {sensor}
                            </Text>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={sensorDict[sensor]}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="index"
                                        tickFormatter={(v) => `${v}s`}
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
                                    <Legend />
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
