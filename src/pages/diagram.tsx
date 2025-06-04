'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
    Button,
    Spinner,
    Flex,
    Text,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    useDisclosure,
    useToast,
} from "@chakra-ui/react";
import ControlMenu from "@/pages/components/ControlMenu";
import Background from './components/background';
import Overlay from './overlay';
import Parser from './parser';
import {
    loadConfig, 
    startRecording, 
    stopRecording, 
    downloadDataFile,
    toggleCalibration
} from './backend';

const Diagram: React.FC = () => {
    const [assetsAvailable, setAssetsAvailable] = useState(false);
    const [checkingAssets, setCheckingAssets] = useState(false);
    const [isMenuOpen, onMenuOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const isRecordingRef = useRef(isRecording);
    const [isLocked, setIsLocked] = useState(false);
    const isLockedRef = useRef(isLocked);
    const [isCalibrated, setIsCalibrated] = useState(true);
     const isCalibratedRef = useRef(isCalibrated);
    const {
        isOpen: isParserOpen,
        onOpen: onParserOpen,
        onClose: onParserClose,
    } = useDisclosure();
    const toast = useToast();
    let diagramFilename = 'ui-diagram-v6.2'; // default diagram filename
    const useFakeBackend = false; // set to `true` to use the fake Backend

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);
    useEffect(() => {
        isLockedRef.current = isLocked;
    }, [isLocked]);
    useEffect(() => {
        isCalibratedRef.current = isCalibrated;
    }, [isCalibrated]);

    const loadDiagram = async (newFilename: string) => {
        setCheckingAssets(true); // show loading state
        // Recheck asset availability
        const [svgRes, jsonRes] = await Promise.all([
            fetch(`/assets/${newFilename}-background.svg`),
            //fetch(`/assets/ui-diagram-v4.1-background.svg`),
            fetch(`/assets/${newFilename}-overlay.json`),
            //fetch(`/assets/ui-diagram-v4.1-overlay.json`),
        ]);

        const available = svgRes.ok && jsonRes.ok;
        setAssetsAvailable(available);
        setCheckingAssets(false);
        if (!svgRes.ok && jsonRes.ok) {
            toast({
                title: "Background SVG not found",
                description: "Please ensure the background SVG is available in /public/assets/",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        }
        if (!jsonRes.ok && svgRes.ok) {
            toast({
                title: "UI Diagram JSON not found",
                description: "Please ensure the UI diagram JSON is available in /public/assets/",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        }
        if (available) {
            diagramFilename = newFilename;
            onParserClose(); // now it's okay to close
        }
    };
    useEffect(() => {
        Promise.all([
            fetch(`/assets/${diagramFilename}-background.svg`),
            fetch(`/assets/${diagramFilename}-overlay.json`),
        ]).then(([svgRes, jsonRes]) => {
             const available = svgRes.ok && jsonRes.ok;
            setAssetsAvailable(available);
            if (!available) {
                onParserOpen(); // force modal open
            }
            
        });
    }, [assetsAvailable]);
    

    const reloadConfig = async () => {
        try {
            await loadConfig(useFakeBackend);
            toast({
                id: 'config-reloaded',
                position: 'top',
                title: 'Reloading config...',
                status: 'success',
                duration: 1000,
                isClosable: true,
            });
        } catch (err) {
            console.error('Reload failed:', err);
            toast({
                id: 'config-reload-error',
                position: 'top',
                title: 'Failed to reload config',
                description: 'Please check the console for errors.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        }
    }
    const toggleRecording = async () => {
        if (!isRecordingRef.current) {
            try {
                await startRecording(useFakeBackend);
                setIsRecording(true);
                toast({
                    id: 'recording-started',
                    position: 'top',
                    title: 'Started recording data',
                    status: 'success',
                    duration: 1000,
                    isClosable: true,
                });
            }
            catch (err) {
                console.error(err);
                toast({
                    id: 'recording-error-start',
                    position: 'top',
                    title: 'Failed to start recording data',
                    description: 'Please check the console for errors.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        }
        else {
            try {
                await stopRecording(useFakeBackend);
                setIsRecording(false);
                toast({
                    id: 'recording-stopped',
                    position: 'top',
                    title: 'Stopped recording data',
                    status: 'info',
                    duration: 1000,
                    isClosable: true,
                });
                await downloadDataFile(useFakeBackend);
            }
            catch (err) {
                console.error(err);
                toast({
                    id: 'recording-error-stop',
                    position: 'top',
                    title: 'Failed to stop recording data',
                    description: 'Please check the console for errors.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        }
    }
    const toggleCalibrationState = async () => {
        if (!isCalibratedRef.current) {
            try {
                // Call calibration API here
                await toggleCalibration(true, useFakeBackend);
                setIsCalibrated(true);
                toast({
                    id: 'calibrated',
                    position: 'top',
                    title: 'Switched to calibrated values',
                    status: 'success',
                    duration: 1000,
                    isClosable: true,
                });
            } catch (err) {
                console.error('Failed to switch to calibrated value:', err);
                setIsCalibrated(false);
                toast({
                    id: 'calibrated-error',
                    position: 'top',
                    title: 'Failed to switch to calibrated value',
                    description: 'Please check the console for errors.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        }
        else {
            try {
                // Call uncalibration API here
                await toggleCalibration(false, useFakeBackend);
                setIsCalibrated(false);
                toast({
                    id: 'uncalibrated',
                    position: 'top',
                    title: 'Switched to uncalibrated values',
                    status: 'info',
                    duration: 1000,
                    isClosable: true,
                });
            } catch (err) {
                console.error('Failed to switch to uncalibrated value:', err);
                setIsCalibrated(true);
                toast({
                    id: 'uncalibrated-error',
                    position: 'top',
                    title: 'Failed to switch to uncalibrated value',
                    description: 'Please check the console for errors.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        }
    }
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+R or just R (you can customize this)
            // !e.ctrlKey for just R
            if ((e.key === 'r' || e.key === 'R') && e.altKey && !isParserOpen) {
                e.preventDefault();
                reloadConfig();
            }
            if ((e.key === 's' || e.key === 'S') && e.altKey && !isParserOpen) {
                e.preventDefault();
                toggleRecording();
            }
            if ((e.key === 'c' || e.key === 'C') && e.ctrlKey && e.altKey && !isParserOpen) {
                e.preventDefault();
                toggleCalibrationState();
            }
            if ((e.key === 'l' || e.key === 'L') && e.altKey && !isParserOpen) {
                e.preventDefault();
                if (isLockedRef.current) {
                    setIsLocked(false);
                    toast({
                        id: 'unlock-actuators',
                        position: 'top',
                        title: 'Unlocked actuators',
                        status: 'info',
                        duration: 1000,
                        isClosable: true,
                    });
                }
                else if (!isLockedRef.current) {
                    setIsLocked(true);
                    toast({
                        id: 'lock-actuators',
                        position: 'top',
                        title: 'Locked actuators',
                        status: 'info',
                        duration: 1000,
                        isClosable: true,
                    });
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);
    return (
        <div>

            <Modal 
                isOpen={isParserOpen} 
                onClose={onParserClose}
                closeOnOverlayClick={false}
                closeOnEsc={false} 
                size='3xl'
            >
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Upload P&ID</ModalHeader>
                    {/* Hide the close button unless loading is done and assets are found */}
                    {(!checkingAssets && assetsAvailable) && <ModalCloseButton />}
                    <ModalBody>
                        {checkingAssets ? (
                            <Flex direction="column" align="center" justify="center" py={12}>
                                <Spinner size="xl" />
                                <Text mt={4}>Checking files...</Text>
                            </Flex>
                        ) : (
                            <Parser 
                                onClose={loadDiagram}
                                diagramAvailable={assetsAvailable}
                            />
                        )}
                    </ModalBody>
                </ModalContent>
            </Modal>
            { assetsAvailable && (   
                <div>
                    <ControlMenu
                        isOpen={isMenuOpen}
                        onOpen={onMenuOpen}
                        isRecording={isRecording}
                        toggleRecording={toggleRecording}
                        reloadConfig={reloadConfig}
                        isCalibrated={isCalibrated}
                        toggleCalibrationState={toggleCalibrationState}
                        isLocked={isLocked}
                        setIsLocked={setIsLocked}
                        openParser={onParserOpen}
                    />
                                         
                    <div style={{ position: 'relative', width: '100%', paddingTop: '76.3%' }}>
                        <Background
                            diagramFilename={diagramFilename}
                            width={1358}
                            height={1023}
                        />
                        <Overlay
                            diagramFilename={diagramFilename}
                            width={1358}
                            height={1023}
                            isLocked={isLocked}
                            useFakeBackend={useFakeBackend}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
export default Diagram;

// <Background /> <Overlay />
/*
           toast({
                    title: "Assets not found",
                    description: "Please ensure the background SVG and UI diagram JSON are available in /public/assets/",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
<MenuButton
                        as={IconButton}
                        isDisabled={!isMenuOpen}
                        onClick={() => onMenuOpen(!isMenuOpen)}
                        aria-label="ControlMenu"
                        rounded="full"
                        bottom="10px"
                        right="10px"
                        zIndex={10}
                        size="lg"
                        icon={isMenuOpen ? <FaChevronDown/> : <FaChevronUp />}
                    />
            <div style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 10 }}>
                <ActuatorSvg
                    name="BVFTP"
                    x={280}
                    y={200}
                    width={60}
                    height={30}
                />
            </div>
            <SensorSvg
                name="PFT"
                value={"0.00"}
                unit={"psi"}
                x={50}
                y={50}
            />*/