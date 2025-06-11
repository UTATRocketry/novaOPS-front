'use client';

import React, {useEffect, useState} from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverArrow,
  PopoverCloseButton,
  PopoverAnchor,
  Button,
  useToast
} from '@chakra-ui/react'
import {SensorSvg} from './components/SensorComponent';
import {ActuatorSvg, ServoSvg, Servo3Svg, SolenoidSvg, PoweredSvg, GpioSvg, PoweredGpioSvg} from './components/ActuatorComponent';
import {connectToSensorStream, sendCommand} from './backend';
import { UIComponent } from './components/types';
import throttle from 'lodash.throttle';

// 1329 x 1014

interface OverlayProps {
    diagramFilename?: string
    width: number;
    height: number;
    isLocked: boolean
    useFakeBackend: boolean
    
}

const Overlay: React.FC = ({diagramFilename, width, height, isLocked, useFakeBackend }: OverlayProps) => {
    const [components, setComponents] = useState<UIComponent[]>([]);
    const [sensorValues, setSensorValues] = useState<Record<string, string>>({});
    const [sensorUnits, setSensorUnits] = useState<Record<string, string>>({});
    const [openStates, setOpenStates] = useState<Record<string, boolean>>({});
    const [powerStates, setPowerStates] = useState<Record<string, boolean>>({});
    const [armingStates, setArmingStates] = useState<Record<string, boolean>>({});
    const [positionStates, setPositionStates] = useState<Record<string, number>>({}); // For Servo3Component position, 1, 2, or 3
    const toast = useToast();

    const yOffset = -1116.5; // Adjust if needed for your diagram
    const xOffset = -876.4; 

    const notifyLocked = () => {
        console.warn('Actuators are locked. No action taken.');
        toast({
            id: 'actuators-locked',
            position: 'top',
            title: "Actuators are locked",
            status: "error",
            duration: 1000,
            isClosable: true,
        });
    }
    const notifyDisabled = () => {
        console.warn('Actuator is disabled. No action taken.');
        toast({
            id: 'actuator-disabled',
            position: 'top',
            title: "Actuator is disabled",
            status: "error",
            duration: 1000,
            isClosable: true,
        });
    }

    useEffect(() => {
        fetch(`/assets/${diagramFilename}-overlay.json`) // ui-diagram-v4-overlay ${diagramFilename}-overlay.json
            .then(res => res.json())
            .then(data => {
                setComponents(data);

                const openStatesInit: Record<string, boolean> = {};
                const powerStatesInit: Record<string, boolean> = {};
                const armingStatesInit: Record<string, boolean> = {};
                const positionStatesInit: Record<string, number> = {};
                const sensorValueInit: Record<string, string> = {};
                const sensorUnitInit: Record<string, string> = {};

                data.forEach((comp: UIComponent) => {
                    if (comp.UIType === 'SolenoidComponent') {
                        openStatesInit[comp.id] = false;
                    }
                    if (comp.UIType === 'ServoComponent') {
                        openStatesInit[comp.id] = false;
                        powerStatesInit[comp.id] = false;
                    }
                    if (comp.UIType === 'Servo3Component') {
                        positionStatesInit[comp.id] = 1; // Initialize position state
                        powerStatesInit[comp.id] = false;
                    }
                    if (comp.UIType === 'PoweredDeviceComponent') {
                        powerStatesInit[comp.id] = false;
                    }
                    if (comp.UIType === 'GpioDeviceComponent') {
                        armingStatesInit[comp.id] = false;
                        openStatesInit[comp.id] = false;
                    }
                    if (comp.UIType === 'PoweredGpioDeviceComponent') {
                        powerStatesInit[comp.id] = false;
                        armingStatesInit[comp.id] = false; 
                        openStatesInit[comp.id] = false;
                    }
                    if (comp.UIType === 'SensorComponent') {
                        sensorValueInit[comp.id] = '0.00';
                        sensorUnitInit[comp.id] = 'unit';
                    }
                });
                // Initialize actuator states
                setOpenStates(openStatesInit);
                setPowerStates(powerStatesInit);
                setArmingStates(armingStatesInit);
                setPositionStates(positionStatesInit);
                // Initialize sensor values and units
                setSensorValues(sensorValueInit);
                setSensorUnits(sensorUnitInit);
            });
    }, []);
    /*
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
            // Update sensor values and units
            setSensorValues(prev => ({...prev, ...valueUpdates}));
            setSensorUnits(prev => ({...prev, ...unitUpdates}));
        }, useFakeBackend); // set to `true` to use the fake WebSocket

        return () => cleanup?.();
    }, [components]);
    */
    useEffect(() => {
        if (components.length === 0) return;

        // Throttled handler to avoid frequent UI updates
        const throttledUpdate = throttle((sensors: any[]) => {
            const valueUpdates: Record<string, string> = {};
            const unitUpdates: Record<string, string> = {};

            sensors.forEach(sensor => {
                const comp = components.find(c => c.label === sensor.name);
                if (comp) {
                    valueUpdates[comp.id] = sensor.value;
                    unitUpdates[comp.id] = sensor.unit;
                }
            });

            setSensorValues(prev => ({ ...prev, ...valueUpdates }));
            setSensorUnits(prev => ({ ...prev, ...unitUpdates }));
        }, 200); // Adjust throttle delay in ms

        const cleanup = connectToSensorStream(throttledUpdate, useFakeBackend);

        return () => {
            cleanup?.();
            throttledUpdate.cancel(); // prevent memory leaks
        };
    }, [components, useFakeBackend]);

    // Toggle solenoid/servo actuator "open/closed" (affects `state`)
    // Toggle servo3 actuator "position" (1, 2, or 3)
    // Toggle powered device "on/off" (affects `power`)
    const toggleActuator = async (
        id: string,
        label: string,
        actuatorType: 'servo' | 'servo3' | 'solenoid' | 'poweredDevice' | 'gpioDevice' | 'poweredGpioDevice',
        stateType: 'open' | 'power' | 'arming' | 'position',
        newPosition?: number
    ) => {
        let currentState;
        let commandState;
        if (stateType === 'open') {
            currentState = openStates[id];
            commandState = !currentState ? 'open' : 'closed';
        } else if (stateType === 'power') {
            currentState = powerStates[id];
            commandState = !currentState ? 'on' : 'off';
        } else if (stateType === 'arming') {
            currentState = armingStates[id];
            commandState = !currentState ? 'armed' : 'disarmed';
        } else if (stateType === 'position' && newPosition) {
            const component = components.find(c => c.id === id);
            currentState = positionStates[id];
            commandState = component?.positions? component.positions[newPosition] : ["1", "2", "3"][newPosition]; // Default to 1, 2, 3 if not provided

        } else {
            console.error('Unknown state type:', stateType);
            return;
        }
        const newState = !currentState;

        try {
            await sendCommand(
                {
                    type: actuatorType,
                    name: label,
                    state: commandState,
                },
                useFakeBackend
            );

            if (stateType === 'open') {
                setOpenStates(prev => ({
                    ...prev,
                    [id]: newState,
                }));
            } else if (stateType === 'power') {
                setPowerStates(prev => ({
                    ...prev,
                    [id]: newState,
                }));
            } else if (stateType === 'arming') {
                setArmingStates(prev => ({
                    ...prev,
                    [id]: newState,
                }));
            } else if (stateType === 'position' && newPosition) {
                setPositionStates(prev => ({
                    ...prev,
                    [id]: newPosition,
                }));
            }
        } catch (error) {
            console.error('Toggle failed:', error);
        }
    };


    return (
        //<svg width={1329} height={1014} style={{ position: 'absolute', top: 0, left: 0, isolation: 'isolate'  }}>
        <div>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="xMidYMid meet"
                style={{
                    width: '100%', 
                    height: '100%', 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    zIndex: 1,
                    pointerEvents: 'auto'
                
                }}
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
                                x={x + xOffset}
                                y={y + yOffset}
                            />
                        );
                    }

                    if (UIType === 'SolenoidComponent') {
                        return (
                            <SolenoidSvg
                                key={id}
                                name={label}
                                x={x + xOffset}
                                y={y + yOffset}
                                width={width}
                                height={height}
                                openState={openStates[id]}
                                onOpenClick={() => isLocked ? notifyLocked() : toggleActuator(id, label, 'solenoid', 'open')}
                            />
                        );
                    }

                    if (UIType === 'ServoComponent') {
                        const isPowered = powerStates[id];
                        return (
                            <ServoSvg
                                key={id}
                                name={label}
                                x={x + xOffset}
                                y={y + yOffset}
                                width={width}
                                height={height}
                                openState={openStates[id]}
                                powerState={isPowered}
                                onOpenClick={ () =>
                                    isLocked || !isPowered
                                        ? (isLocked ? notifyLocked() : notifyDisabled())
                                        : toggleActuator(id, label, 'servo', 'open')
                                }
                                //powerState={servoPowerStates[id]}
                                //onClick={() => isLocked ? null : toggleActuator(id, label, 'servo')}
                                onPowerClick={() => isLocked ? notifyLocked() : toggleActuator(id, label, 'servo', 'power')}
                            />
                        );
                    }
                    if (UIType === 'Servo3Component') {
                        const isPowered = powerStates[id];
                        return (
                            <Servo3Svg
                                key={id}
                                name={label}
                                x={x + xOffset}
                                y={y + yOffset}
                                width={width}
                                height={height}
                                powerState={isPowered}
                                positionState={positionStates[id]} // Use position state
                                positionOptions={component.positions || ['1', '2', '3']} // Default to 1, 2, 3 if not provided
                                onPositionClick={(newPosition: number) =>
                                    isLocked || !isPowered
                                        ? (isLocked ? notifyLocked() : notifyDisabled())
                                        : toggleActuator(id, label, 'servo3', 'position', newPosition)
                                }
                                onPowerClick={() => isLocked ? notifyLocked() : toggleActuator(id, label, 'servo3', 'power')}
                            />
                        );
                    }
                    if (UIType === 'PoweredDeviceComponent') {
                        return (
                            <PoweredSvg
                                key={id}
                                name={label}
                                x={x + xOffset}
                                y={y + yOffset}
                                width={width}
                                height={height}
                                powerState={powerStates[id]}
                                onPowerClick={() => isLocked ? notifyLocked() : toggleActuator(id, label, 'poweredDevice', 'power')}
                            />
                        );
                    }
                    if (UIType === 'GpioDeviceComponent') {
                        return (
                            <GpioSvg
                                key={id}
                                name={label}
                                x={x + xOffset}
                                y={y + yOffset}
                                width={width}
                                height={height}
                                armedState={armingStates[id]}
                                onArmedClick={() => isLocked ? notifyLocked() : toggleActuator(id, label, 'gpioDevice', 'arming')}
                            />
                        );
                    }
                    if (UIType === 'PoweredGpioDeviceComponent') {
                        const isPowered = powerStates[id];
                        return (
                            <PoweredGpioSvg
                                key={id}
                                name={label}
                                x={x + xOffset}
                                y={y + yOffset}
                                width={width}
                                height={height}
                                powerState={powerStates[id]}
                                armedState={armingStates[id]}
                                onPowerClick={() => isLocked ? notifyLocked() : toggleActuator(id, label, 'poweredGpioDevice', 'power')}
                                onArmedClick={() =>
                                    isLocked || !isPowered
                                        ? (isLocked ? notifyLocked() : notifyDisabled())
                                        : toggleActuator(id, label, 'poweredGpioDevice', 'arming')
                                }
                            />
                        );
                    }
                    
                    return null;
                })}
            </svg>
            
        </div>
    )
}
export default Overlay;


// onClick={() => handleToggle(component.label)}
/*
{ Popovers rendered in HTML space }
            {components.map(component => {
                const { id, label, UIType, x, y } = component;

                if (UIType === 'SensorComponent') {
                return (
                    <Popover key={`popover-${id}`} placement="top">
                    <PopoverTrigger>
                        <Button
                            position="absolute"
                            left={x - 40}
                            top={y - 40}
                            size="xs"
                            variant="outline"
                            colorScheme="blue"
                            zIndex={2}
                        >
                            {label}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent p={3}>
                        <PopoverArrow />
                        <PopoverCloseButton />
                        <PopoverHeader>{label}</PopoverHeader>
                        <PopoverBody>
                        <strong>Value:</strong> {sensorValues[id] ?? 'No Data'}<br />
                        <strong>Unit:</strong> {sensorUnits[id] ?? 'unit'}
                        </PopoverBody>
                    </PopoverContent>
                    </Popover>
                );
                }
                return null;
            })}
*/