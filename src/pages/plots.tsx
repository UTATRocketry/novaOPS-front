import { useEffect, useState } from "react";
import { fetchTestWS } from "./api/backend";
import { Chart } from "react-google-charts";
import { Button, Text, Flex, Box } from "@chakra-ui/react";
import axios from "axios";
import Link from "next/link";

export default function Plots() {
  const [trigger, setTrigger] = useState(0);
  const [sensorDict, setSensorDict] = useState({});
  const [stopGraphingStatus, setGraphingStatus] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(false);

  const handleStopExport = async () => {
    setGraphingStatus(true);
    try {
      await axios.post("/api/writeYaml", { sensorDict });
      console.log("YAML file created successfully");
      setUploadStatus(true);
    } catch (error) {
      console.error("Failed to create YAML file", error);
    }
  };

  useEffect(() => {
    const fetchWSData = async () => {
      const result = await fetchTestWS();
      const sensors = result["data"]["sensors"];
      updateDictFirstTime(sensors);
    };

    const updateDictFirstTime = (sensors) => {
      setSensorDict((prevDict) => {
        const newDict = { ...prevDict };
        sensors.forEach((sensor) => {
          const new_entry = [sensor["timestamp"], sensor["value"], sensor["name"]];
          if (!newDict[sensor.name]) {
            newDict[sensor.name] = [["Time", "Value"]]; // Google Charts format
          }
          newDict[sensor.name].push(new_entry);
        });
        return newDict;
      });
    };

    if (!stopGraphingStatus) {
      fetchWSData();
      const intervalId = setInterval(() => {
        fetchWSData();
        setTrigger((prev) => prev + 1);
      }, 2500);
      return () => clearInterval(intervalId);
    }
  }, [trigger, stopGraphingStatus]);

  const renderChart = (sensorType, title) => (
    <Box width="100%">
      <Text padding="30px" fontSize="20px" marginTop="40px" as="b">{title}</Text>
      <Chart
        width="100%"
        height="300px"
        chartType="LineChart"
        loader={<Text>Loading Chart...</Text>}
        data={sensorDict[sensorType] || [["Time", "Value"]]}
        options={{
          hAxis: { title: "Time (s)" },
          vAxis: { title: "Sensor Value" },
          legend: "none",
        }}
      />
    </Box>
  );

  return (
    <div>
      <Text padding="30px" fontSize="40px" marginTop="40px" as="b">
        Plots
      </Text>
      <Button position="absolute" padding="20px" margin="40px" top="0" right="0" onClick={handleStopExport}>
        <Text>Export</Text>
      </Button>
      <Button position="absolute" padding="20px" margin="40px" top="0" right="120">
        <Link href="/">Home</Link>
      </Button>
      <Flex justify="center">
        {renderChart("PFT", "PFT Plot")}
        {renderChart("MOT", "MOT Plot")}
      </Flex>
      <Flex justify="center">
        {renderChart("PCC", "PCC Plot")}
        {renderChart("PFM", "PFM Plot")}
      </Flex>
      <div style={{ textAlign: "center" }}>
        {uploadStatus && (
          <Text padding="30px" fontSize="15px" marginTop="40px" as="b" color="green">
            Exported successfully
          </Text>
        )}
      </div>
    </div>
  );
}
