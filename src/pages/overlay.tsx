'use client';

import React, {useEffect, useState} from 'react';
import {SensorSvg} from './components/SensorComponent';
import {ActuatorSvg, ServoSvg, SolenoidSvg} from './components/ActuatorComponent';
import {connectToSensorStream, sendCommand} from './backend';
import debounce from 'lodash.debounce';

// 1329 x 1014
type UIComponent = {
    id: string;
    label: string;
    UIType: string;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
};

interface OverlayProps {
    isLocked: boolean
    useFakeBackend: boolean
}

const Overlay: React.FC = ({isLocked, useFakeBackend}: OverlayProps) => {
    const [components, setComponents] = useState<UIComponent[]>([]);
    const [sensorValues, setSensorValues] = useState<Record<string, string>>({});
    const [sensorUnits, setSensorUnits] = useState<Record<string, string>>({});
    const [actuatorStates, setActuatorStates] = useState<Record<string, boolean>>({});

    const [servoPowerStates, setServoPowerStates] = useState<Record<string, boolean>>({});


    // Debounced updater to limit re-renders
    const debouncedSetSensorValues = debounce(
        (updates: Record<string, string>) => {
            setSensorValues(prev => ({...prev, ...updates}));
        },
        0.5,
        {leading: true, trailing: true}
    );

    useEffect(() => {
        fetch('/assets/ui-diagram.json')
            .then(res => res.json())
            .then(data => {
                setComponents(data);

                const actuatorInit: Record<string, boolean> = {};
                const servoPowerInit: Record<string, boolean> = {};
                const sensorValueInit: Record<string, string> = {};
                const sensorUnitInit: Record<string, string> = {};

                data.forEach((comp: UIComponent) => {
                    if (comp.UIType === 'SolenoidComponent') {
                        actuatorInit[comp.id] = false;
                    }
                    if (comp.UIType === 'ServoComponent') {
                        actuatorInit[comp.id] = false;
                        servoPowerInit[comp.id] = false;
                    }
                    if (comp.UIType === 'SensorComponent') {
                        sensorValueInit[comp.id] = '0.00';
                        sensorUnitInit[comp.id] = 'unit';
                    }
                });

                setActuatorStates(actuatorInit);
                setServoPowerStates(servoPowerInit);
                setSensorValues(sensorValueInit);
                setSensorUnits(sensorUnitInit);
            });
    }, []);

    useEffect(() => {
        if (components.length === 0) return;

        const cleanup = connectToSensorStream((sensors) => {
            const valueUpdates: Record<string, string> = {};
            const unitUpdates: Record<string, string> = {};

            sensors.forEach(sensor => {
                const comp = components.find(c => c.label === sensor.name);
                if (comp) {
                    valueUpdates[comp.id] = sensor.value;
                    unitUpdates[comp.id] = sensor.unit;
                }
            });

            debouncedSetSensorValues(valueUpdates);
            setSensorUnits(prev => ({...prev, ...unitUpdates}));
        }, useFakeBackend); // set to `true` to use the fake WebSocket

        return () => cleanup?.();
    }, [components]);

    // Toggle solenoid/servo actuator "open/closed" (affects `state`)
    const toggleActuator = async (
        id: string,
        label: string,
        type: 'solenoid' | 'servo'
    ) => {
        const currentState = actuatorStates[id];
        const newState = !currentState;

        try {
            await sendCommand(
                {
                    type,
                    name: label,
                    state: newState ? 'open' : 'closed',
                },
                useFakeBackend
            );

            // ✅ Only update the state after the command succeeds
            setActuatorStates(prev => ({
                ...prev,
                [id]: newState,
            }));
        } catch (error) {
            console.error('Command failed:', error);
            // Don't update the state if the command failed
        }
    };


    // Toggle servo "enabled/disabled" (affects `powerState`)
    const toggleServoPower = async (
        id: string,
        label: string,
        type: 'solenoid' | 'servo'
    ) => {
        const currentState = servoPowerStates[id];
        const newState = !currentState;

        try {
            await sendCommand(
                {
                    type,
                    name: label,
                    state: newState ? 'on' : 'off',
                },
                useFakeBackend
            );

            setServoPowerStates(prev => ({
                ...prev,
                [id]: newState,
            }));
        } catch (error) {
            console.error('Power toggle failed:', error);
        }
    };


    return (
        //<svg width={1329} height={1014} style={{ position: 'absolute', top: 0, left: 0, isolation: 'isolate'  }}>
        <svg
            viewBox="0 0 1329 1014"
            preserveAspectRatio="xMidYMid meet"
            style={{width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1}}
        >
            {components.map(component => {
                const {id, label, UIType, x, y, width, height} = component;

                if (UIType === 'SensorComponent') {
                    return (
                        <SensorSvg
                            key={id}
                            name={label}
                            value={sensorValues[id] ?? 'No Data'}
                            unit={sensorUnits[id] ?? 'unit'}
                            x={x - 40}
                            y={y - 48}
                        />
                    );
                }

                if (UIType === 'ActuatorButton') {
                    return (
                        <ActuatorSvg
                            key={id}
                            name={label}
                            x={x - 4404}
                            y={y}
                            width={width}
                            height={height}
                            state={actuatorStates[id]}
                            onClick={() => isLocked ? null : toggleActuator(id, label, 'solenoid')}
                        />
                    );
                }

                if (UIType === 'SolenoidComponent') {
                    return (
                        <SolenoidSvg
                            key={id}
                            name={label}
                            x={x - 40}
                            y={y - 45}
                            width={width}
                            height={height}
                            state={actuatorStates[id]}
                            onClick={() => isLocked ? null : toggleActuator(id, label, 'solenoid')}
                        />
                    );
                }

                if (UIType === 'ServoComponent') {
                    const isPowered = servoPowerStates[id];
                    return (
                        <ServoSvg
                            key={id}
                            name={label}
                            x={x - 40}
                            y={y - 40}
                            width={width}
                            height={height}
                            state={actuatorStates[id]}
                            powerState={isPowered}
                            onClick={() =>
                                isLocked || !isPowered
                                    ? null
                                    : toggleActuator(id, label, 'servo')
                            }
                            //powerState={servoPowerStates[id]}
                            //onClick={() => isLocked ? null : toggleActuator(id, label, 'servo')}
                            onClick2={() => isLocked ? null : toggleServoPower(id, label, 'servo')}
                        />
                    );
                }

                return null;
            })}
        </svg>
    )
}
export default Overlay;


// onClick={() => handleToggle(component.label)}