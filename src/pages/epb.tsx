'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
    Badge,
    Box,
    Button,
    Flex,
    FormControl,
    FormLabel,
    Heading,
    HStack,
    NumberInput,
    NumberInputField,
    Select,
    Stack,
    Text,
    useToast,
} from '@chakra-ui/react';
import { connectToBackendStream, sendUartCommand, type UartAck } from './backend';

const EPB_OPTIONS = [
    { label: 'EPB1', value: 4 },
    { label: 'EPB2', value: 5 },
    { label: 'EPB3', value: 6 },
    { label: 'EPB4', value: 7 },
];

const ACK_STATUS_NAMES: Record<number, string> = {
    1: 'accepted',
    2: 'rejected',
    3: 'busy',
    4: 'done ok',
    5: 'done fail',
    6: 'timeout',
    7: 'ping',
};

type AckFeedEntry = UartAck & {
    receivedAt: number;
    key: string;
};

function epbName(nodeId?: number) {
    return EPB_OPTIONS.find(option => option.value === nodeId)?.label ?? `node ${nodeId ?? '?'}`;
}

function ackStatusLabel(status?: number) {
    if (status === undefined) {
        return 'unknown';
    }
    return ACK_STATUS_NAMES[status] ?? `status ${status}`;
}

function ackToastStatus(ack: UartAck): 'success' | 'error' | 'warning' | 'info' {
    if (ack.ok || ack.status === 4 || ack.status === 7) {
        return 'success';
    }
    if (ack.status === 2 || ack.status === 5 || ack.status === 6) {
        return 'error';
    }
    if (ack.status === 3) {
        return 'warning';
    }
    return 'info';
}

export default function EpbCommands() {
    const [target, setTarget] = useState(4);
    const [opcode, setOpcode] = useState(1);
    const [isSending, setIsSending] = useState(false);
    const [ackFeed, setAckFeed] = useState<AckFeedEntry[]>([]);
    const nextCommandId = useRef(1);
    const latestAckKey = useRef('');
    const toast = useToast();

    useEffect(() => {
        const cleanup = connectToBackendStream(data => {
            const ack = data.uart_ack;
            if (!ack) {
                return;
            }

            const key = `${ack.sender ?? ''}:${ack.cmd_id ?? ''}:${ack.opcode ?? ''}:${ack.status ?? ''}:${ack.ok ?? ''}`;
            if (key === latestAckKey.current) {
                return;
            }
            latestAckKey.current = key;

            const entry = {
                ...ack,
                receivedAt: Date.now(),
                key,
            };

            setAckFeed(prev => [entry, ...prev].slice(0, 8));
            toast({
                id: `uart-ack-${key}`,
                position: 'top-right',
                title: `${epbName(ack.sender)} ACK`,
                description: `cmd ${ack.cmd_id ?? '?'} opcode ${ack.opcode ?? '?'}: ${ackStatusLabel(ack.status)}`,
                status: ackToastStatus(ack),
                duration: 4500,
                isClosable: true,
            });
        });

        return () => cleanup?.();
    }, [toast]);

    const sendEpbCommand = async () => {
        if (opcode < 0 || opcode > 0xffff) {
            toast({
                position: 'top-right',
                title: 'Opcode must fit in uint16',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        const cmdId = nextCommandId.current;
        nextCommandId.current += 1;

        setIsSending(true);
        try {
            await sendUartCommand({
                target,
                cmd_id: cmdId,
                opcode,
                args: [],
            });
            toast({
                position: 'top-right',
                title: `Command sent to ${epbName(target)}`,
                description: `cmd ${cmdId}, opcode ${opcode}`,
                status: 'info',
                duration: 1800,
                isClosable: true,
            });
        } catch (error) {
            toast({
                position: 'top-right',
                title: 'Command send failed',
                description: error instanceof Error ? error.message : 'Backend request failed',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Box minH="calc(100vh - 48px)" bg="#f6f7f9" px={{ base: 4, md: 8 }} py={6}>
            <Stack spacing={6} maxW="960px">
                <Box>
                    <Heading size="md" color="#1f2933">EPB Commands</Heading>
                    <Text mt={1} color="#596270" fontSize="sm">
                        Send UART commands through novaOps-back and novaGround.
                    </Text>
                </Box>

                <Flex
                    bg="white"
                    border="1px solid #d8dee8"
                    borderRadius="8px"
                    p={4}
                    gap={4}
                    align={{ base: 'stretch', md: 'end' }}
                    direction={{ base: 'column', md: 'row' }}
                    boxShadow="0 1px 2px rgba(15, 23, 42, 0.06)"
                >
                    <FormControl maxW={{ md: '180px' }}>
                        <FormLabel fontSize="sm" color="#384252">EPB</FormLabel>
                        <Select value={target} onChange={event => setTarget(Number(event.target.value))}>
                            {EPB_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl maxW={{ md: '220px' }}>
                        <FormLabel fontSize="sm" color="#384252">Opcode</FormLabel>
                        <NumberInput
                            min={0}
                            max={0xffff}
                            value={opcode}
                            onChange={(_, value) => setOpcode(Number.isNaN(value) ? 0 : value)}
                        >
                            <NumberInputField />
                        </NumberInput>
                    </FormControl>

                    <Button
                        colorScheme="blue"
                        onClick={sendEpbCommand}
                        isLoading={isSending}
                        minW="150px"
                    >
                        Send Command
                    </Button>
                </Flex>

                <Box
                    bg="white"
                    border="1px solid #d8dee8"
                    borderRadius="8px"
                    p={4}
                    boxShadow="0 1px 2px rgba(15, 23, 42, 0.06)"
                >
                    <Heading size="sm" color="#1f2933" mb={3}>ACK Feed</Heading>
                    <Stack spacing={2}>
                        {ackFeed.length === 0 ? (
                            <Text color="#667085" fontSize="sm">Waiting for ACK frames...</Text>
                        ) : (
                            ackFeed.map(ack => (
                                <HStack
                                    key={ack.key}
                                    justify="space-between"
                                    border="1px solid #e5e9f0"
                                    borderRadius="6px"
                                    px={3}
                                    py={2}
                                >
                                    <HStack spacing={3}>
                                        <Badge colorScheme={ackToastStatus(ack) === 'success' ? 'green' : 'orange'}>
                                            {epbName(ack.sender)}
                                        </Badge>
                                        <Text fontSize="sm" color="#2f3745">
                                            cmd {ack.cmd_id ?? '?'} / opcode {ack.opcode ?? '?'}
                                        </Text>
                                    </HStack>
                                    <Text fontSize="sm" color="#596270">
                                        {ackStatusLabel(ack.status)}
                                    </Text>
                                </HStack>
                            ))
                        )}
                    </Stack>
                </Box>
            </Stack>
        </Box>
    );
}
