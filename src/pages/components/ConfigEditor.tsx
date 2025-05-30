import React, {useState, useEffect} from "react";
import {
    Box,
    Button,
    FormControl,
    FormLabel,
    Input,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    Select,
    Textarea,
    VStack,
    HStack,
    Heading,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    TableContainer,
} from "@chakra-ui/react";
import {Config, SensorConfig, RelayConfig, ServoConfig} from "./types";

//import yaml from "js-yaml";

interface ConfigEditorProps {
    filename: string
    setFilename: React.Dispatch<React.SetStateAction<string>>
    config: Config;
    setConfig: React.Dispatch<React.SetStateAction<Config>>;

}
// (config: Config) => void
//React.SetStateAction<

const ConfigEditor = ({filename, setFilename, config, setConfig }: ConfigEditorProps) => {
    // The config state stores arrays for each section.
    // const [config, setConfig] = useState<Config>(selectedconfig);
    // const [filename, setFilename] = useState(selectedfilename);

    // Functions to handle input changes.
    /*
    const handleInputChange = (section: string, index: number, key: string, value: string) => {
        setTempConfig(prev => ({
            ...prev,
            [section]: prev[section].map((item, i) => {
                if (i === index) {
                    return {
                        ...item,
                        [key]: value
                    };
                }
            })
        }))
    }*/
    const handleInputChange = (
        section: 'sensors' | 'relays' | 'servos',
        index: number,
        field: string,
        value: string | number
    ) => {
        setConfig(prev => {
            const updatedSection = [...prev[section]];
            const item = { ...updatedSection[index], [field]: value };
            updatedSection[index] = item;
            return {
                ...prev,
                [section]: updatedSection
            };
        });
    };
    // Functions to add new entries.
    const addSensor = () => {
        setConfig(prev => ({
            ...prev,
            sensors: [
                ...prev.sensors,
                {
                    hatID: 0,
                    channelID: 0,
                    name: "",
                    unit: "",
                    type: "",
                    calibration: []
                }
            ]
        }));
    };

    const addRelay = () => {
        setConfig(prev => ({
            ...prev,
            relays: [
                ...prev.relays,
                {
                    channelID: 0,
                    name: "",
                    type: ""
                }
            ]
        }));
    };

    const addServo = () => {
        setConfig(prev => ({
            ...prev,
            servos: [
                ...prev.servos,
                {
                    channelID: 0,
                    name: "",
                    open_pos: 0,
                    open_over: 0,
                    close_pos: 0,
                    close_over: 0,
                    relayID: 0
                }
            ]
        }));
    };

    // Functions to remove entries.
    const removeSensor = (index: number) => {
        setConfig(prev => ({
            ...prev,
            sensors: prev.sensors.filter((_, i) => i !== index)
        }));
    };

    const removeRelay = (index: number) => {
        setConfig(prev => ({
            ...prev,
            relays: prev.relays.filter((_, i) => i !== index)
        }));
    };

    const removeServo = (index: number) => {
        setConfig(prev => ({
            ...prev,
            servos: prev.servos.filter((_, i) => i !== index)
        }));
    };

    return (
        <Box p={5}>
            <FormControl mb={2}>
                <FormLabel>Config Filename</FormLabel>
                <HStack justifyContent="space-between" mb={2}>
                    <Input
                        type="string"
                        value={filename}
                        onChange={(e) => setFilename ? setFilename(e.target.value) : null}
                    />
                </HStack>
            </FormControl>
            <VStack spacing={8} align="stretch">
                {/* Sensors (MCCDAQ) Section */}
                <Box borderWidth="1px" borderRadius="lg" p={4}>
                    <Heading as="h2" size="md" mb={4}>
                        Sensors Configuration
                    </Heading>
                    {config.sensors.map((sensor, index) => (
                        <Box key={index} mb={4} p={3} borderWidth="1px" borderRadius="md">
                            <HStack justifyContent="space-between" mb={2}>
                                <Heading as="h3" size="sm">
                                    Sensor {index}
                                </Heading>
                                <Button
                                    colorScheme="red"
                                    size="sm"
                                    onClick={() => removeSensor(index)}
                                >
                                    Remove
                                </Button>
                            </HStack>
                            <FormControl mb={2} isRequired>
                                <FormLabel>Hat ID</FormLabel>
                                <NumberInput
                                    max={7}
                                    min={0}
                                    value={sensor.hatID}
                                    onChange={(_, num) => handleInputChange("sensors", index, "hatID", num)}
                                >
                                    <NumberInputField/>
                                    <NumberInputStepper>
                                        <NumberIncrementStepper/>
                                        <NumberDecrementStepper/>
                                    </NumberInputStepper>
                                </NumberInput>
                            </FormControl>
                            <FormControl mb={2}>
                                <FormLabel>Channel ID</FormLabel>
                                <NumberInput
                                    max={7}
                                    min={0}
                                    value={sensor.channelID}
                                    onChange={(_, num) => handleInputChange("sensors", index, "channelID", num)}
                                >
                                    <NumberInputField/>
                                    <NumberInputStepper>
                                        <NumberIncrementStepper/>
                                        <NumberDecrementStepper/>
                                    </NumberInputStepper>
                                </NumberInput>
                            </FormControl>
                            <FormControl mb={2}>
                                <FormLabel>Name</FormLabel>
                                <Input
                                    value={sensor.name}
                                    onChange={(e) =>handleInputChange("sensors", index, "name", e.target.value)}
                                />
                            </FormControl>
                            <FormControl mb={2}>
                                <FormLabel>Unit</FormLabel>
                                <Input
                                    value={sensor.unit}

                                />
                            </FormControl>
                            <FormControl mb={2}>
                                <FormLabel>Type</FormLabel>
                                <Input
                                    value={sensor.type || ""}
                                    onChange={(e) =>handleInputChange("sensors", index, "type", e.target.value)}
                                />
                            </FormControl>
                            <FormControl mb={2}>
                                <FormLabel>Calibration</FormLabel>
                                <Textarea
                                    //value={sensor.calibration.join("\n") || ""}
                                    //isReadOnly rows={10}
                                    //onChange={(e) =>handleInputChange("sensors", index, "calibration", e.target.value)}
                                />
                            </FormControl>
                        </Box>
                    ))}
                    <Button colorScheme="blue" onClick={addSensor}>
                        Add Sensor
                    </Button>
                </Box>

                {/* Relays Section */}
                <Box borderWidth="1px" borderRadius="lg" p={4}>
                    <Heading as="h2" size="md" mb={4}>
                        Relays Configuration
                    </Heading>
                    {config.relays.map((relay, index) => (
                        <Box key={index} mb={4} p={3} borderWidth="1px" borderRadius="md">
                            <HStack justifyContent="space-between" mb={2}>
                                <Heading as="h3" size="sm">
                                    Relay {index}
                                </Heading>
                                <Button
                                    colorScheme="red"
                                    size="sm"
                                    onClick={() => removeRelay(index)}
                                >
                                    Remove
                                </Button>
                            </HStack>
                            <FormControl mb={2}>
                                <FormLabel>Channel ID</FormLabel>
                                <NumberInput
                                    max={16}
                                    min={0}
                                    value={relay.channelID}
                                    onChange={(_, num) => handleInputChange("relays", index, "channelID", num)}
                                >
                                    <NumberInputField/>
                                    <NumberInputStepper>
                                        <NumberIncrementStepper/>
                                        <NumberDecrementStepper/>
                                    </NumberInputStepper>
                                </NumberInput>
                            </FormControl>
                            <FormControl mb={2}>
                                <FormLabel>Name</FormLabel>
                                <Input
                                    value={relay.name}
                                    onChange={(e) => handleInputChange("relays", index, "name", e.target.value)}
                                />
                            </FormControl>
                            <FormControl mb={2}>
                                <FormLabel>Type</FormLabel>
                                <Input
                                    value={relay.type}
                                    onChange={(e) => handleInputChange("relays", index, "type", e.target.value)}
                                />
                            </FormControl>
                        </Box>
                    ))}
                    <Button colorScheme="blue" onClick={addRelay}>
                        Add Relay
                    </Button>
                </Box>

                {/* Servos Section */}
                <Box borderWidth="1px" borderRadius="lg" p={4}>
                    <Heading as="h2" size="md" mb={4}>
                        Servos Configuration
                    </Heading>
                    {config.servos.map((servo, index) => (
                        <Box key={index} mb={4} p={3} borderWidth="1px" borderRadius="md">
                            <HStack justifyContent="space-between" mb={2}>
                                <Heading as="h3" size="sm">
                                    Servo {index}
                                </Heading>
                                <Button
                                    colorScheme="red"
                                    size="sm"
                                    onClick={() => removeServo(index)}
                                >
                                    Remove
                                </Button>
                            </HStack>
                            <FormControl mb={2}>
                                <FormLabel>Channel ID</FormLabel>
                                <NumberInput
                                    max={16}
                                    min={0}
                                    value={servo.channelID}
                                    onChange={(_, num) => handleInputChange("servos", index, "channelID", num)}
                                >
                                    <NumberInputField/>
                                    <NumberInputStepper>
                                        <NumberIncrementStepper/>
                                        <NumberDecrementStepper/>
                                    </NumberInputStepper>
                                </NumberInput>
                            </FormControl>
                            <FormControl mb={2}>
                                <FormLabel>Name</FormLabel>
                                <Input
                                    value={servo.name}
                                    onChange={(e) => handleInputChange("servos", index, "name", e.target.value)}
                                />
                            </FormControl>
                            <HStack spacing={4} mb={2}>
                                <FormControl>
                                    <FormLabel>Open Position</FormLabel>
                                    <Input
                                        type="number"
                                        value={servo.open_pos}
                                        onChange={(e) => handleInputChange("servos", index, "open_pos", parseInt(e.target.value))}
                                    />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Open Over</FormLabel>
                                    <Input
                                        type="number"
                                        value={servo.open_over}
                                        onChange={(e) => handleInputChange("servos", index, "open_over", parseInt(e.target.value))}
                                    />
                                </FormControl>
                            </HStack>
                            <HStack spacing={4} mb={2}>
                                <FormControl>
                                    <FormLabel>Close Position</FormLabel>
                                    <Input
                                        type="number"
                                        value={servo.close_pos}
                                        onChange={(e) => handleInputChange("servos", index, "close_pos", parseInt(e.target.value))}
                                    />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>Close Over</FormLabel>
                                    <Input
                                        type="number"
                                        value={servo.close_over}
                                        onChange={(e) => handleInputChange("servos", index, "close_over", parseInt(e.target.value))}
                                    />
                                </FormControl>
                            </HStack>
                            <FormControl mb={2}>
                                <FormLabel>Relay ID</FormLabel>
                                <NumberInput
                                    max={16}
                                    min={0}
                                    value={servo.relayID}
                                    onChange={(_, num) => handleInputChange("servos", index, "relayID", num)}
                                >
                                    <NumberInputField/>
                                    <NumberInputStepper>
                                        <NumberIncrementStepper/>
                                        <NumberDecrementStepper/>
                                    </NumberInputStepper>
                                </NumberInput>
                            </FormControl>
                        </Box>
                    ))}
                    <Button colorScheme="blue" onClick={addServo}>
                        Add Servo
                    </Button>
                </Box>
            </VStack>
        </Box>
    );

};

export default ConfigEditor;


/*
const [config, setConfig] = useState<Config>({
        sensors: [
            // Example sensor config.
            {
                hatID: 0,
                channelID: 0,
                name: "",
                unit: "",
                type: "",
                calibration: []
            }
        ],
        relays: [
            // Example relay config.
            {
                channelID: 0,
                name: "",
                type: ""
            }
        ],
        servos: [
            // Example servo config.
            {
                channelID: 0,
                name: "",
                open_pos: 0,
                open_over: 0,
                close_pos: 0,
                close_over: 0,
                relayID: 0
            }
        ]
    });
 */