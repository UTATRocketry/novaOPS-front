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
} from 'recharts';
import { useEffect, useRef, useState } from 'react';
import { connectToSensorStream } from './backend';

// Grid imports
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Grid, GridItem } from "@chakra-ui/react";

// Settable constants
const TIME_WINDOW_SECONDS = 20; // visible time window
const TICK_INTERVAL_SECONDS = 0; // x-axis tick spacing

type SensorDataPoint = { time: number; value: number };
type Plot = { id: string; sensor: string, expanded: boolean };

function SortablePlotCard({
    plot,
    headerRight,
    children,
}: {
    plot: Plot;
    headerRight?: React.ReactNode; // buttons go here
    children: React.ReactNode;     // chart/content goes here
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: plot.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.8 : 1,
        touchAction: "none",
    };

    return (
        <GridItem
            ref={setNodeRef}
            style={style}
            colSpan={{ base: 1, md: plot.expanded ? 2 : 1 }}
        >
            <Box borderWidth="1px" rounded="md" p={3}>
                <Flex align="center" justify="space-between" mb={2}>
                    <Box
                        {...attributes}
                        {...listeners}
                        cursor="grab"
                        userSelect="none"
                        fontWeight="semibold"
                    >
                        {plot.sensor || "Select a sensor"}
                    </Box>

                    {headerRight}
                </Flex>

                {/* body */}
                <Box width="100%">
                    {children}
                </Box>
            </Box>
        </GridItem>
    );
}

export default function SensorPlots() {
    const [sensorDict, setSensorDict] = useState<Record<string, SensorDataPoint[]>>({});
    const [availableSensors, setAvailableSensors] = useState<string[]>([]);
    const [plots, setPlots] = useState<Plot[]>([{ id: crypto.randomUUID(), sensor: '', expanded: false }])        // React likes unique identifiers

    const sensorStartTimes = useRef<Record<string, number>>({});
    const latestTime = useRef<number>(0);
    const useFakeBackend = false; // set to `true` to use the fake Backend

    const setPlotSensor = (id: string, sensor: string) => {
        // set prev plot state's object that we are looking for to have the new sensor.
        console.log("id: " + id + "sensor: " + sensor);
        setPlots(prev => prev.map(p => (p.id === id ? { ...p, sensor } : p)));
    };

    const addPlot = () => {
        // append a new object at the end
        setPlots(prev => [...prev, {
            id: crypto.randomUUID(),
            sensor: '',
            expanded: false
        }]);
    }

    const deletePlot = (id: string) => {
        setPlots(prev => prev.filter(p => p.id !== id));
    }

    const toggleExpand = (id: string) => {
        // toggle id's particular expanded status
        setPlots(prev => prev.map(p => (p.id === id ? { ...p, expanded: !p.expanded } : p)))
    }

    const plotIds = plots.map(p => p.id);


    useEffect(() => {
        const cleanup = connectToSensorStream((sensors) => {
            const now = Date.now();
            setSensorDict((prev) => {
                const updated = { ...prev };
                sensors.forEach(({ name, value, timestamp }) => {
                    const num = parseFloat(value);
                    if (isNaN(num)) return;

                    // timestamp is now getting the correct ms input
                    // TODO: make sure that webserver (using mqtt) is giving this ms
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
        },
            useFakeBackend);

        return () => cleanup?.();
    }, []);

    return (
        <Box p={4}>
            <Text fontSize="2xl" mb={4} fontWeight="bold" textAlign="center">
                Sensor Plots
            </Text>

            <Flex gap={4} mb={6} wrap="wrap" align="center">
                {plots.map((p) => (
                    <Flex key={p.id} gap={2} align="center">
                        <Select
                            value={p.sensor}
                            onChange={(e) => setPlotSensor(p.id, e.target.value)}
                            placeholder="Select a sensor"
                            width="200px"
                        >
                            {availableSensors.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </Select>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deletePlot(p.id)}
                            isDisabled={plots.length === 1}
                        >
                            [x]
                        </Button>
                    </Flex>
                ))}
                <Button onClick={addPlot}>+ Add Plot</Button>
            </Flex>

            <DndContext
                collisionDetection={closestCenter}
                onDragEnd={({ active, over }) => {
                    if (!over || active.id === over.id) return;
                    setPlots(prev => {
                        const oldIndex = prev.findIndex(p => p.id === active.id);
                        const newIndex = prev.findIndex(p => p.id === over.id);
                        return arrayMove(prev, oldIndex, newIndex);
                    });
                }}
            >
                <SortableContext items={plotIds} strategy={rectSortingStrategy}>
                    <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={6}>
                        {plots.map((p) => (
                            <SortablePlotCard key={p.id} plot={p} headerRight={
                                <Button size="sm" variant="outline" onClick={() => toggleExpand(p.id)}>
                                    {p.expanded ? "Half" : "Full"}
                                </Button>
                            }>
                                {p.sensor && sensorDict[p.sensor] ? (
                                    <Box key={p.id}>
                                        <Text mb={2} fontWeight="semibold" textAlign="center">
                                            {p.sensor}
                                        </Text>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <LineChart data={sensorDict[p.sensor]}>
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
                                ) : null}
                            </SortablePlotCard>
                        ))
                        }
                    </Grid>
                </SortableContext>
            </DndContext>
        </Box>
    );
}


