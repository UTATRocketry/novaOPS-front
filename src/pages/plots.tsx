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
const MIN_PLOT_SAMPLE_INTERVAL_MS = 900;
const LAYOUT_KEY = "sensorPlots.layout.v1";
const USE_FAKE_BACKEND = false;

type SensorDataPoint = { time: number; value: number };
type Plot = { id: string; sensor: string, expanded: boolean };
type SavedLayoutV1 = {
    version: 1;
    plots: Array<{ id: string; sensor: string; expanded: boolean }>;
};

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

// Helpers for saving plot setup into local storage
function safeParseLayout(raw: string | null): SavedLayoutV1 | null {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (obj?.version !== 1 || !Array.isArray(obj.plots)) return null;
        // basic shape check
        for (const p of obj.plots) {
            if (typeof p?.id !== "string") return null;
            if (typeof p?.sensor !== "string") return null;
            if (typeof p?.expanded !== "boolean") return null;
        }
        return obj as SavedLayoutV1;
    } catch {
        return null;
    }
}

function downloadJSON(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function timestampToMs(timestamp: number | string | null | undefined, fallbackMs: number) {
    if (timestamp === null || timestamp === undefined || timestamp === '') {
        return fallbackMs;
    }

    const numericTimestamp = Number(timestamp);
    if (Number.isFinite(numericTimestamp)) {
        if (numericTimestamp > 1_000_000_000_000) {
            return numericTimestamp;
        }
        if (numericTimestamp > 1_000_000_000) {
            return numericTimestamp * 1000;
        }
        return fallbackMs + numericTimestamp * 1000;
    }

    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function isStm32Sensor(name: string) {
    return name.startsWith('FMC ') ||
        name.startsWith('PMB ') ||
        name.startsWith('EPB1 ') ||
        name.startsWith('EPB2 ') ||
        name.startsWith('EPB3 ') ||
        name.startsWith('EPB4 ');
}

export default function SensorPlots() {
    const [sensorDict, setSensorDict] = useState<Record<string, SensorDataPoint[]>>({});
    const [availableSensors, setAvailableSensors] = useState<string[]>([]);
    const [plots, setPlots] = useState<Plot[]>([{ id: crypto.randomUUID(), sensor: '', expanded: false }])        // React likes unique identifiers

    const sensorStartTimes = useRef<Record<string, number>>({});
    const lastPlottedTimes = useRef<Record<string, number>>({});
    const latestTime = useRef<number>(0);

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
    };

    const deletePlot = (id: string) => {
        setPlots(prev => prev.filter(p => p.id !== id));
    };

    const toggleExpand = (id: string) => {
        // toggle id's particular expanded status
        setPlots(prev => prev.map(p => (p.id === id ? { ...p, expanded: !p.expanded } : p)))
    };

    const plotIds = plots.map(p => p.id);


    // PLOT CONFIGURATION HELPERS
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const saved = safeParseLayout(localStorage.getItem(LAYOUT_KEY));
        if (saved?.plots?.length) {
            setPlots(saved.plots);
        }
    }, []);

    useEffect(() => {
        const payload: SavedLayoutV1 = {
            version: 1,
            plots
        };
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(payload));
    }, [plots]);

    const saveToFile = () => {
        const payload: SavedLayoutV1 = { version: 1, plots };
        downloadJSON("sensor-plots-layout.json", payload);
    };

    const triggerLoadFromFile = () => fileInputRef.current?.click();

    const onLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const text = await file.text();
        const loaded = safeParseLayout(text);
        if (!loaded?.plots?.length) return;

        setPlots(loaded.plots);
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(loaded));

        e.target.value = "";
    };


    useEffect(() => {
        const cleanup = connectToSensorStream((sensors) => {
            const now = Date.now();
            setSensorDict((prev) => {
                const updated = { ...prev };
                sensors.forEach(({ name, value, timestamp }) => {
                    const num = parseFloat(value);
                    if (isNaN(num)) return;

                    const ts = timestampToMs(timestamp, now);
                    const lastPlottedTime = lastPlottedTimes.current[name];
                    if (lastPlottedTime !== undefined) {
                        const elapsedMs = ts - lastPlottedTime;
                        if (elapsedMs <= 0 || (isStm32Sensor(name) && elapsedMs < MIN_PLOT_SAMPLE_INTERVAL_MS)) {
                            return;
                        }
                    }
                    lastPlottedTimes.current[name] = ts;

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
                setAvailableSensors((prev) => Array.from(new Set([...prev, ...allNames])));

                return updated;
            });
        },
            USE_FAKE_BACKEND);

        return () => cleanup?.();
    }, []);

    return (
        <Box p={4}>
            <Text fontSize="2xl" mb={4} fontWeight="bold" textAlign="center">
                Sensor Plots
            </Text>
            <Flex gap={2} mb={4} justify="center" wrap="wrap">
                <Button onClick={saveToFile} variant="outline">Save Layout</Button>
                <Button onClick={triggerLoadFromFile} variant="outline">Load Layout</Button>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={onLoadFile}
                />
            </Flex>

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
