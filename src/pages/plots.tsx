import { useEffect, useState } from "react";
import { fetchRandomData, fetchTestMessage, fetchTestWS } from "./api/backend";
// import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button, Text, Flex, Box } from '@chakra-ui/react';
import { LineChart, DataPoint } from './chart';
import { Data, Sensor, Actuator } from './api/backend';
import axios from 'axios';
import Link from "next/link";
import Chart from "react-google-charts";

export default function Plots() {
  const [trigger, setTrigger] = useState(0);

  const [sensorDict, setSensorDict] = useState<{ [key: string]: DataPoint[] }>({});
  const [stopGraphingStatus, setGraphingStatus] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(false);

  const handleStopExport = async () => {
    setGraphingStatus(true);
    try {
      await axios.post('/api/writeYaml', { sensorDict });
      console.log('YAML file created successfully');
      setUploadStatus(true);
    } catch (error) {
      console.error('Failed to create YAML file', error);
    }
  }

  useEffect(() => {
    const fetchWSData = async () => {
      const result: Data = await fetchRandomData();
      const result_data_list = result['data'];
      const actuators = result_data_list['actuators'];
      const sensors = result_data_list['sensors'];
      console.log("Actuators: ", actuators);
      console.log("Sensors: ", sensors);
      updateDictFirstTime(sensors);
    };

    const updateDictFirstTime = (sensorArray: Sensor[]) => {
      const now = new Date();
      const currentTime = now.getTime() / 1000;
      // const secondsSinceStartOfDay =
      //   now.getHours() * 3600 +
      //   now.getMinutes() * 60 +
      //   now.getSeconds();

      setSensorDict((prevDict) => {
        const newDict = { ...prevDict }; // Create a new object
        sensorArray.forEach((sensor) => {
          if (!sensor) return;

          const { name, value } = sensor;
          if (!newDict[name]) {
            newDict[name] = [{ time: currentTime, value }];
          } else {
            newDict[name] = [...newDict[name], { time: currentTime, value }];
          }
        });
        return newDict;
      });
    };

    console.log("sensor dict: ", sensorDict);
    if (stopGraphingStatus == false) {
      // fetchWSData();
      const delay = 500; // Delay to read the values in real time
      const intervalId = setInterval(() => {
        fetchWSData();
        setTrigger((prev) => prev + 1); // Trigger a re-render
      }, delay);

      return () => clearInterval(intervalId); // Cleanup interval
    }
  }, [trigger, stopGraphingStatus]);

  return (
    <div>
      <Text padding="30px" fontSize="40px" marginTop="40px" as="b">
        Plots
      </Text>
      <Button position='absolute' padding='20px' margin='40px' top='0' right='0' onClick={() => handleStopExport()}><Text>Export</Text></Button>
      <Button position='absolute' padding='20px' margin='40px' top='0' right='120'><Link href='/'>Home</Link></Button>
      <Flex justify='center'>
      <Box width='100%'>
      <div className='mft'>
      <LineChart data={[{name:'MFT', data: sensorDict['MFT'] || [], color:'green'}, {name:'MOT', data: sensorDict['MOT'] || [], color:'red'}]} plotDifference={true} title='MFT Plot' />
      </div>
      </Box>
      <Box width='100%'>
      <div className='mot'>
      <LineChart data={[{name:'MOT', data: sensorDict['MOT'] || [], color:'red'}]} title='MOT Plot' />
      </div>
      </Box>
      <Box width='100%'>
      <div className='mot'>
      <LineChart data={[{name:'MOT', data: sensorDict['MOT'] || [], color:'red'}]} title='MOT Plot' />
      </div>
      </Box>
      </Flex>

      <Flex justify='center'>
      <Box width='100%'>
      <div className='pcc'>
      <LineChart data={[{name:'PCC', data: sensorDict['PCC'] || [], color:'red'}]} title='PCC Plot' />
      </div>
      </Box>

      <Box width='100%'>
      <div className='pfm'>
      <LineChart data={[{name:'PFM', data: sensorDict['PFM'] || [], color:'red'}]} title='PFM Plot' />
      </div>
      </Box>
      <Box width='100%'>
      <div className='pfm'>
      <LineChart data={[{name:'PFM', data: sensorDict['PFM'] || [], color:'red'}]} title='PFM Plot' />
      </div>
      </Box>
      </Flex>

      <div style={{ textAlign: 'center' }}>
      {uploadStatus == true ? <Text padding="30px" fontSize="15px" marginTop="40px" as="b" color='green'>Exported successfully</Text> : null}
      </div>
    </div>
  );
}
