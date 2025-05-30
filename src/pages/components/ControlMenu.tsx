'use client';

import React from "react";
import {IconButton, MenuButton, MenuList, MenuItem, Menu} from '@chakra-ui/react';
import {FaChevronUp, FaChevronDown, FaTools, FaPlay, FaStop, FaLock, FaUnlock, FaBolt} from "react-icons/fa";
import {LuMenu, LuSettings2} from "react-icons/lu";

interface ControlMenuProps {
    reloadConfig?: () => void
    isRecording?: boolean
    toggleRecording?: () => void
    isLocked?: boolean
    setIsLocked?: (isLocked: boolean) => void
}


const ControlMenu: React.FC = ({reloadConfig, isRecording, toggleRecording, isLocked, setIsLocked}: ControlMenuProps) => {
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
                    <MenuItem icon={<FaTools/>} onClick={() => reloadConfig ? reloadConfig() : null}>
                        Reload Config
                    </MenuItem>
                    <MenuItem icon={isRecording ? <FaStop/> : <FaPlay/>} onClick={() => toggleRecording ? toggleRecording() : null}>
                        {isRecording ? "Stop Recording Data" : "Start Recording Data"}
                    </MenuItem>
                    <MenuItem icon={isLocked ? <FaUnlock/> : <FaLock/>} onClick={() => setIsLocked ? setIsLocked(!isLocked) : null}>
                        {isLocked ? "Unlock Actuators" : "Lock Actuators"}
                    </MenuItem>
                    <MenuItem icon={<FaBolt/>} onClick={() => null}>
                        Action 1
                    </MenuItem>
                    <MenuItem icon={<FaBolt/>} onClick={() => null}>
                        Action 2
                    </MenuItem>
                </MenuList>
            </Menu>
        </div>
    )
};
export default ControlMenu;