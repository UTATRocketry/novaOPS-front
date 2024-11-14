import PressureGraph from "./pressureG";
import FlowVelocityGraph from "./flowvelocity";
import FlowVelocityGraphTwo from "./massflowTwo";
import PressureGraphTwo from "./pressureTwo";

import { Flex, Spacer,  Box, Center, Text, FormControl, FormLabel, SimpleGrid, Divider, Tabs, TabList, TabPanels, Tab, TabPanel} from '@chakra-ui/react'
import PIDDiagram from "./diagram";
import Link from "next/link";



export default function Plots() {

    return (
        <div>
            <Tabs align='end'>
          <TabList>
            <Tab> <Link href='/'>Home</Link></Tab>
            
          </TabList>

          <TabPanels>
            <TabPanel>
              
              <Text margin='10px' fontSize='20px' as='b' position='absolute' top='0' left='0'> UTAT Rocketry</Text>
              
            </TabPanel>
            <TabPanel>
              <p>Coming Soon!</p>
            </TabPanel>
            <TabPanel>
              <p>Coming Soon!</p>
            </TabPanel>
          </TabPanels>
            </Tabs>


            <Box marginTop='10px'>
          <Flex justifyContent='space-between' padding='10px'>
            {/* <Box>
              <Text fontSize='28px' as='b'>Mass-Flow </Text>
              <FlowVelocityGraph />
            </Box>
            <Box>
              <Text fontSize='28px' as='b'>Pressure in PGN-G, PFTP-G, PFT</Text>
              <PressureGraph />
            </Box> */}
            <Box>
              {/* <Text fontSize='28px' as='b'>Mass flow in RFTP, BVFTP, PFT, RVFT, SVFTV</Text> */}
              <PressureGraph />
            </Box>
          </Flex>
            <Center>
            
            </Center>
          </Box>

          {/* <Box marginTop='10px'>
            <Flex justifyContent='space-between' padding='10px'>
                <Box>
                <Text fontSize='28px' as='b'> Mass-Flow of BVFTB-M, MFV</Text>
                <FlowVelocityGraphTwo />
                </Box>
                <Box>
                    <Text fontSize='28px' as='b'>Pressure in TFM, PFM</Text>
                    <PressureGraphTwo />

                </Box>
                
            </Flex>
          </Box> */}
          <Divider mt='10' />
          <Box as='footer' py='10' textAlign='center'>
            <Text>© 2024 UTAT Rocketry</Text>
          </Box>


          
        </div>
    )
}