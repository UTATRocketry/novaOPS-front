import {
    Text,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
} from '@chakra-ui/react'
// import Link from "next/link";
import Diagram from "./diagram";
import Plots from "./plots";
import EpbCommands from './epb';

export default function Home() {
    //const btnRef = useRef(false)
    return (
        <div style={{ backgroundColor: 'white', width: '100%', height: '100%' }}>
            <Tabs align='end'>
                <TabList>
                    <Tab>P&ID</Tab>
                    <Tab>Plots</Tab>
                    <Tab>EPB</Tab>
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
                        <EpbCommands />
                    </TabPanel>
                    <TabPanel>
                        <Text margin='10px' fontSize='20px' as='b' position='absolute' top='0' left='0'> UTAT Rocketry</Text>
                        <ComingSoon />
                        {/* <Plots/> */}
                        {/* <ConfigPage /> */}
                        {/* <Parser /> */}
                        {/* <TestPage /> */}
                    </TabPanel>
                </TabPanels>
            </Tabs>

        </div>
    );
}

export function ComingSoon() {

    return (
        <div style={{position: 'relative', width: '100%', height: '100%', textAlign: 'center'}}>
            <Text margin='10px' fontSize='20px' as='b'> Coming Soon!</Text>
            <Text margin='10px' fontSize='16px'> This page is under construction.</Text>
        </div>
    );
}
/*
<Parser />
<Diagram/>
<Plots/>
<ConfigPage />
<TestPage />
*/
