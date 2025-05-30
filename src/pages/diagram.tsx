'use client';

import React, { useEffect, useState } from 'react';
import {
    Button,
} from "@chakra-ui/react";
import ControlMenu from "@/pages/components/ControlMenu";
import Background from './components/background';
import Overlay from './overlay';
import Parser from './parser';
import {loadConfig, startRecording, stopRecording, downloadDataFile} from './backend';

const Diagram: React.FC = () => {
    const [assetsAvailable, setAssetsAvailable] = useState(true);
    const [isMenuOpen, onMenuOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const useFakeBackend = false; // set to `true` to use the fake Backend

    useEffect(() => {
        Promise.all([
            fetch('/assets/ui-diagram-background.svg'),
            fetch('/assets/ui-diagram.json')
        ]).then(([svgRes, jsonRes]) => {
            setAssetsAvailable(svgRes.ok && jsonRes.ok);
        });
    }, []);

    const reloadConfig = async () => {
        try {
            await loadConfig(useFakeBackend);
        } catch (err) {
            console.error('Reload failed:', err);
        }
    }
    const toggleRecording = async () => {
        if (!isRecording) {
            try {
                await startRecording(useFakeBackend);
                setIsRecording(true);
            }
            catch (err) {
                console.error(err);
            }
        }
        else {
            try {
                await stopRecording(useFakeBackend);
                setIsRecording(false);
                await downloadDataFile(useFakeBackend);
            }
            catch (err) {
                console.error(err);
            }
        }
    }
    if (assetsAvailable) {
        return (
            <div>
                <ControlMenu
                    reloadConfig={reloadConfig}
                    isRecording={isRecording}
                    toggleRecording={toggleRecording}
                    isLocked={isLocked}
                    setIsLocked={setIsLocked}
                />
                <div style={{ position: 'relative', width: '100%', paddingTop: '76.3%' }}>
                    <Background />
                    <Overlay
                        isLocked={isLocked}
                        useFakeBackend={useFakeBackend}
                    />
                </div>
            </div>

        );
    }
    else {
        return (
            <div>
                <Parser />
            </div>
        )
    }
};
export default Diagram;


// <Background /> <Overlay />
/*
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