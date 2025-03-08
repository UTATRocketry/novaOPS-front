import { useEffect, useState } from "react";
import { fetchTestMessage, fetchTestWS } from "./api/backend";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button, Text, Flex, Box } from '@chakra-ui/react';
import axios from 'axios';
import Link from "next/link";

export default function Plots() {
  const [trigger, setTrigger] = useState(0);
  const [sensorDict, setSensorDict] = useState({});
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
      const result = await fetchTestWS();
      const result_data_list = result['data'];
      const actuators = result_data_list['actuators'];
      const sensors = result_data_list['sensors'];
      console.log("Actuators: ", actuators);
      console.log("Sensors: ", sensors);
      updateDictFirstTime(sensors);
    };

    const updateDictFirstTime = (sensors: any) => {
      const now = new Date();
      console.log("sensors: ", sensors);
      const target_sensor_array = sensors[0];
    
      // Create a new sensor entry
      const new_entry = {
        index: target_sensor_array["timestamp"],
        value: target_sensor_array["value"],
      };
    
      // updating state dict properly
      setSensorDict((prevDict: any) => {
        return { ...prevDict, [new_entry.index]: new_entry.value };
      });
    };
    

    console.log("sensor dict: ", sensorDict);
    if (stopGraphingStatus == false) {
      fetchWSData();
      const delay = 2500; // Delay to read the values in real time
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
      <Text padding="30px" fontSize="20px" marginTop="40px" as="b">PFT Plot</Text>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={sensorDict['PFT'] || []} // Handle undefined gracefully
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="index"
            interval="preserveStartEnd" // Ensure only start and end ticks are displayed
            tickCount={5} // Adjust the number of ticks shown
            padding={{ left: 20, right: 20 }}
            tickFormatter={(value) => `${value}s`} // Optionally format the tick (e.g., append "s")
            label={{
              value: "Time (s)", // X-axis label
              position: "insideBottom", // Position the label at the bottom
              offset: -20, // Adjust spacing from the axis
              dx: 40
            }}
          />
          <YAxis label={{
            value: "Sensor Value (kg/s)", // Y-axis label
            angle: -90, // Rotate the label vertically
            position: "insideLeft", // Position inside the left side
            dx: -10, // Adjust horizontal spacing from the axis
            dy: 90
          }}/>
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} isAnimationActive={false}/>
        </LineChart>
      </ResponsiveContainer>
      </div>
      </Box>
      <Box width='100%'>
      <div className='mot'>
      <Text padding="30px" fontSize="20px" marginTop="40px" as="b">MOT Plot</Text>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={sensorDict['MOT'] || []} // Handle undefined gracefully
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="index"
            interval="preserveStartEnd" // Ensure only start and end ticks are displayed
            tickCount={5} // Adjust the number of ticks shown
            padding={{ left: 20, right: 20 }}
            tickFormatter={(value) => `${value}s`} // Optionally format the tick (e.g., append "s")
            label={{
              value: "Time (s)", // X-axis label
              position: "insideBottom", // Position the label at the bottom
              offset: -20, // Adjust spacing from the axis
              dx: 40
            }}
          />
          <YAxis label={{
            value: "Sensor Value (kg/s)", // Y-axis label
            angle: -90, // Rotate the label vertically
            position: "insideLeft", // Position inside the left side
            dx: -10, // Adjust horizontal spacing from the axis
            dy: 90
          }}/>
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} isAnimationActive={false}/>
        </LineChart>
      </ResponsiveContainer>
      </div>
      </Box>
      </Flex>

      <Flex justify='center'>
      <Box width='100%'>
      <div className='pcc'>
      <Text padding="30px" fontSize="20px" marginTop="40px" as="b">PCC Plot</Text>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={sensorDict['PCC'] || []} // Handle undefined gracefully
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="index"
            interval="preserveStartEnd" // Ensure only start and end ticks are displayed
            tickCount={5} // Adjust the number of ticks shown
            padding={{ left: 20, right: 20 }}
            tickFormatter={(value) => `${value}s`} // Optionally format the tick (e.g., append "s")
            label={{
              value: "Time (s)", // X-axis label
              position: "insideBottom", // Position the label at the bottom
              offset: -20, // Adjust spacing from the axis
              dx: 40
            }}
          />
          <YAxis label={{
            value: "Sensor Value (kg/s)", // Y-axis label
            angle: -90, // Rotate the label vertically
            position: "insideLeft", // Position inside the left side
            dx: -10, // Adjust horizontal spacing from the axis
            dy: 90
          }}/>
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} isAnimationActive={false}/>
        </LineChart>
      </ResponsiveContainer>
      </div>
      </Box>

      <Box width='100%'>
      <div className='pfm'>
      <Text padding="30px" fontSize="20px" marginTop="40px" as="b">PFM Plot</Text>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={sensorDict['PFM'] || []} // Handle undefined gracefully
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="index"
            interval="preserveStartEnd" // Ensure only start and end ticks are displayed
            tickCount={5} // Adjust the number of ticks shown
            padding={{ left: 20, right: 20 }}
            tickFormatter={(value) => `${value}s`} // Optionally format the tick (e.g., append "s")
            label={{
              value: "Time (s)", // X-axis label
              position: "insideBottom", // Position the label at the bottom
              offset: -20, // Adjust spacing from the axis
              dx: 40
            }}
          />
          <YAxis label={{
            value: "Sensor Value (kg/s)", // Y-axis label
            angle: -90, // Rotate the label vertically
            position: "insideLeft", // Position inside the left side
            dx: -10, // Adjust horizontal spacing from the axis
            dy: 90
          }}/>
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} isAnimationActive={false}/>
        </LineChart>
      </ResponsiveContainer>
      </div>
      </Box>
      </Flex>

      <div style={{ textAlign: 'center' }}>
      {uploadStatus == true ? <Text padding="30px" fontSize="15px" marginTop="40px" as="b" color='green'>Exported successfully</Text> : null}
      </div>
    </div>
  );
}
