import React, {useState, useEffect} from "react";
import {
    Box,
    Button,
    FormControl,
    FormLabel,
    Input,
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

interface ConfigViewerProps {
    config: Config;
    filename: string

}
const ConfigViewer = ({ config, filename}: ConfigViewerProps) => {
    return (
        <Box p={5}>
            <FormControl mb={2} isReadOnly>
                <FormLabel>Config Filename</FormLabel>
                <HStack justifyContent="space-between" mb={2}>
                    <Input
                        type="string"
                        value={filename}
                    />
                </HStack>
            </FormControl>
            <VStack spacing={8} align="stretch">
                {/* Sensors (MCCDAQ) Section */}
                <Heading as="h2" size="md" mb={4}>
                    Sensors Configuration
                </Heading>
                <TableContainer>
                    <Table variant="striped">
                        <Thead>
                            <Tr>
                                <Th>Sensor</Th>
                                <Th>Hat ID</Th>
                                <Th>Channel ID</Th>
                                <Th>Unit</Th>
                                {/*<Th>Min</Th>
                                <Th>Max</Th>*/}
                                <Th>Type</Th>
                                {/*<Th>Calibration</Th>*/}
                            </Tr>
                        </Thead>
                        <Tbody>
                            {config.sensors.map((sensor, index) => (
                                <Tr key={index}>
                                    <Td>{sensor.name}</Td>
                                    <Td>{sensor.hatID}</Td>
                                    <Td>{sensor.channelID}</Td>
                                    <Td>{sensor.unit != null ? sensor.unit: ""}</Td>
                                    {/*<Td>{sensor.min}</Td>
                                    <Td>{sensor.max}</Td>*/}
                                    <Td>{sensor.type != null ? sensor.type: ""}</Td>
                                    {/*<Td>{sensor.calibration}</Td>*/}
                                </Tr>))}
                        </Tbody>
                    </Table>
                </TableContainer>
                {/* Relays Section */}
                <Heading as="h2" size="md" mb={4}>
                    Relays Configuration
                </Heading>
                <TableContainer>
                    <Table variant="striped">
                        <Thead>
                            <Tr>
                                <Th>Relay</Th>
                                <Th>Channel ID</Th>
                                <Th>Type</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {config.relays.map((relay, index) => (
                                <Tr key={index}>
                                    <Td>{relay.name}</Td>
                                    <Td>{relay.channelID}</Td>
                                    <Td>{relay.type != null ? relay.type: ""}</Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                </TableContainer>
                {/* Servos Section */}
                <Heading as="h2" size="md" mb={4}>
                    Servos Configuration
                </Heading>
                <TableContainer>
                    <Table variant="striped">
                        <Thead>
                            <Tr>
                                <Th>Servo</Th>
                                <Th>Channel ID</Th>
                                <Th>Name</Th>
                                <Th>Open Position</Th>
                                <Th>Open Over</Th>
                                <Th>Close Position</Th>
                                <Th>Close Over</Th>
                                <Th>Relay ID</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {config.servos.map((servo, index) => (
                                <Tr key={index}>
                                    <Td>{servo.name}</Td>
                                    <Td>{servo.channelID}</Td>
                                    <Td>{servo.name}</Td>
                                    <Td>{servo.open_pos}</Td>
                                    <Td>{servo.open_over != null ? servo.open_over: "" }</Td>
                                    <Td>{servo.close_pos}</Td>
                                    <Td>{servo.close_over != null ? servo.close_over: "" }</Td>
                                    <Td>{servo.relayID != null ? servo.relayID: "" }</Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                </TableContainer>
            </VStack>
        </Box>
    );
}
export default ConfigViewer;

/*
<VStack spacing={8} align="stretch">

<Box borderWidth="1px" borderRadius="lg" p={4}>
    <Heading as="h2" size="md" mb={4}>
        Sensors Configuration
    </Heading>
    {testConfig.sensors.map((sensor, index) => (
        <Box key={index} mb={4} p={3} borderWidth="1px" borderRadius="md">
            <HStack justifyContent="space-between" mb={2}>
                <Heading as="h3" size="sm">
                    Sensor {index}
                </Heading>
            </HStack>
            <FormControl mb={2} isReadOnly>
                <FormLabel>Hat ID</FormLabel>
                <Input
                    type="number"
                    value={sensor.hatID}
                />
            </FormControl>
            <FormControl mb={2} isReadOnly>
                <FormLabel>Channel ID</FormLabel>
                <Input
                    type="number"
                    value={sensor.channelID}
                />
            </FormControl>
            <FormControl mb={2} isReadOnly>
                <FormLabel>Name</FormLabel>
                <Input
                    value={sensor.name}
                />
            </FormControl>
            <FormControl mb={2} isReadOnly>
                <FormLabel>Unit</FormLabel>
                <Input
                    value={sensor.unit}
                />
            </FormControl>
            <FormControl mb={2} isReadOnly>
                <FormLabel>Type</FormLabel>
                <Input
                    value={sensor.type}
                />
            </FormControl>
            <FormControl mb={2} isReadOnly>
                <FormLabel>Calibration</FormLabel>
                <Textarea
                    isReadOnly rows={2}
                    value={ sensor.calibration ? sensor.calibration.join("\n") : ""}
                />
            </FormControl>
        </Box>

    ))}
</Box>
</VStack>
 */