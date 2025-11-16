'use client';

import React from "react";
import {IconButton, MenuButton, MenuList, MenuItem, Menu} from '@chakra-ui/react';
import {
    FaChevronUp, FaChevronDown, FaChevronLeft, FaChevronRight,
    FaTools, 
    FaPlay, FaStop, FaDownload , 
    FaLock, FaUnlock, FaBolt, FaProjectDiagram 
} from "react-icons/fa";
import {LuMenu, LuSettings2, LuSlidersHorizontal, LuDownload  } from "react-icons/lu";

interface ControlMenuProps {
    reloadConfig?: () => void
    isRecording?: boolean
    toggleRecording?: () => void
    downloadData?: () => void
    isLocked?: boolean
    setIsLocked?: (isLocked: boolean) => void
    isCalibrated?: boolean
    toggleCalibration?: () => void
    openParser?: () => void
}


const ControlMenu: React.FC = ({reloadConfig, isRecording, toggleRecording, downloadData, isLocked, setIsLocked, isCalibrated, toggleCalibration, openParser}: ControlMenuProps) => {
    return (
        <div>
            <Menu>
                <MenuButton
                    as={IconButton}
                    rounded="full"
                    right="10px"
                    zIndex={10}
                    size="md"
                    aria-label='Options'
                    icon={<LuMenu/>}
                >
                </MenuButton>
                <MenuList>
                    <MenuItem icon={<FaTools/>} onClick={() => reloadConfig ? reloadConfig() : null} command="Alt+R">
                        Reload Config
                    </MenuItem>
                    <MenuItem icon={isRecording ? <FaStop/> : <FaPlay/>} onClick={() => toggleRecording ? toggleRecording() : null} command="Alt+S">
                        {isRecording ? "Stop Recording Data" : "Start Recording Data"}
                    </MenuItem>
                    <MenuItem icon={<FaDownload />} onClick={() => downloadData ? downloadData() : null} command="Alt+D">
                        Download Data
                    </MenuItem>
                    <MenuItem icon={isLocked ? <FaUnlock/> : <FaLock/>} onClick={() => setIsLocked ? setIsLocked(!isLocked) : null} command="Alt+L">
                        {isLocked ? "Unlock Actuators" : "Lock Actuators"}
                    </MenuItem>
                    <MenuItem icon={<LuSlidersHorizontal/>}  onClick={() => toggleCalibration ? toggleCalibration() : null} command="Ctrl+Alt+C">
                        {isCalibrated ? "Get Uncalibrated values" : "Get Calibrated values"}
                    </MenuItem>
                    <MenuItem icon={<FaProjectDiagram/>} onClick={() => openParser ? openParser() : null}>
                        Upload New Diagram
                    </MenuItem>
                    <MenuItem icon={<FaBolt/>} onClick={() => null}>
                        Action
                    </MenuItem>
                </MenuList>
            </Menu>
        </div>
    )
};
export default ControlMenu;