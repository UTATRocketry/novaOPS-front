import { useState, useRef,  } from "react";
import {
    Text,
    Button,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
    Drawer,
    DrawerBody,
    DrawerFooter,
    DrawerHeader,
    DrawerOverlay,
    DrawerContent,
    DrawerCloseButton,
} from '@chakra-ui/react'
// import Link from "next/link";
import Diagram from "./diagram";
import Plots from "./plots";
import ConfigPage from "./config";

export default function Home() {
    const [isOpen, onOpen] = useState(false)
    //const btnRef = useRef(false)
    return (
        <div style={{ backgroundColor: 'white', width: '100%', height: '100%' }}>
            <Tabs align='end'>
                <TabList>
                    <Tab>P&ID</Tab>
                    <Tab>Plots</Tab>
                    <Tab>Config</Tab>
                </TabList>

                <TabPanels>
                    <TabPanel>
                        <Text margin='10px' fontSize='20px' as='b' position='absolute' top='0' left='0'> UTAT Rocketry</Text>
                        <Diagram/>
                    </TabPanel>
                    <TabPanel>
                        <Text margin='10px' fontSize='20px' as='b' position='absolute' top='0' left='0'> UTAT Rocketry</Text>
                        <Plots/>
                    </TabPanel>
                    <TabPanel>
                        <Text margin='10px' fontSize='20px' as='b' position='absolute' top='0' left='0'> UTAT Rocketry</Text>
                        <ConfigPage />
                    </TabPanel>
                </TabPanels>
            </Tabs>

        </div>
    );
}