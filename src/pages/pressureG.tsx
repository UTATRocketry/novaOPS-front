import { Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import {useState, useEffect} from 'react'

import { fetchRandomData, fetchTestWS, Data, Actuator, Sensor } from "./api/backend";
import { LineChart } from './chart';
import { getRandomNumber } from './api/basicData';

interface DataPoint {
    time: number;
    value: number;
}

export interface DataSeries {
  name: string;
  data: DataPoint[];
  color: string;
}

export default function PressureGraph() {

  const [sensorArray, setSensorArray] = useState([]); // used explicitly for plotting
  const [actuatorArray, setActuatorArray] = useState([]); // used explicitly for plotting

    
    // const [data, setData] = useState([['time', 'pv', 'uv', 'qv'], [0, 0, 0, 1], [1, 0.5, 1, 0]]);

    const [bvftValueArray, setBVFTValue] = useState([]);

    const [rftpValueArray, setRFTPValue] = useState([]);

    const [rvftValueArray, setRVFTValue] = useState([]);

    const [bvftbValueArray, setBVFTBValue] = useState([]);

    const [mfvValueArray, setMFVValue] = useState([]);
    const [svftValueArray, setSVFTValue] = useState([]);

  

    const [bvotValueArray, setBVOTValue] = useState([]);

    const [rotpValueArray, setROTPValue] = useState([]);

    const [rvotValueArray, setRVOTValue] = useState([]);

    const [svotvValueArray, setSVOTVValue] = useState([]);

    const [svotdValueArray, setSVOTDValue] = useState([]);

    const [movValueArray, setMOVValue] = useState([]);

    const [pgngArray, setPGNG] = useState<DataPoint[]>([]);
    const [pftpgArray, setPFTPG] = useState<DataPoint[]>([]);
    const [pftArray, setPFT] = useState<DataPoint[]>([]);
    const [mftArray, setMFT] = useState<DataPoint[]>([]);
    const [tfmArray, setTFM] = useState<DataPoint[]>([]);
    const [pfmArray, setPFM] = useState<DataPoint[]>([]);
  
    //ox side
    const [potphg, setPOTPHG] = useState([]);
    const [potplg, setPOTPLG] = useState([]);
    const [pott, setPOTT] = useState([]);
    const [mot, setMOT] = useState<DataPoint[]>([]);
    const [tot, setTOT] = useState([]);
    const [potb, setPOTB] = useState([]);
    const [pcc, setPCC] = useState([]); 

    const parseSensors = (sensors: Sensor[]) => { 
    
        for (let i = 0; i < sensors.length; i++) {
          const now = Math.round(Date.now() / 1000);
          // console.log(now);
          
          const sensor = sensors[i];
          // console.log("Sensor: ", sensor)
          if (sensor['name'] == 'MOT') {
            const mot_value: DataPoint = {time: now, value: sensor['value']};
            setMOT(prevArray => {
              if(prevArray.length > 10){
                  prevArray.shift();
              }
              return [...prevArray, mot_value]
            })
          } else if (sensor['name'] == 'PGSO') {
            const pgso_value: DataPoint = {time: now, value: sensor['value']};
            setPGNG(prevArray => {
              if(prevArray.length > 10){
                  prevArray.shift();
              }
              return [...prevArray, pgso_value]
            })
          } else if (sensor['name'] == 'TGSO-G') {
            const tgso_g_value: DataPoint = {time: now, value: sensor['value']};
            setPFTPG(prevArray => {
              if(prevArray.length > 10){
                  prevArray.shift();
              }
              return [...prevArray, tgso_g_value]
            })
          }
        }
        // console.log(mot, pgngArray);
      }
    
    const formatArrayfromBackend = (sensors: [], actuators: []) => { // for keeping values for plotting
      const new_sensor_array = sensors.concat(sensorArray); 
      const new_actuator_array = actuators.concat(actuatorArray); 
      setSensorArray(new_sensor_array);
      setActuatorArray(new_actuator_array);
    }
    
    useEffect(() => {

        const fetchWSData = async () => {
          const currentTime = Date.now() / 1000;
          // setMOT([
          //   { time: currentTime - 0.1 * getRandomNumber(), value: getRandomNumber() },
          //   { time: currentTime - 0.1 * getRandomNumber(), value: getRandomNumber() },
          //   { time: currentTime - 0.1 * getRandomNumber(), value: getRandomNumber() },
          //   { time: currentTime - 0.1 * getRandomNumber(), value: getRandomNumber() }
          // ]);
          // setPGNG([
          //   { time: currentTime - 0.1 * getRandomNumber(), value: getRandomNumber() },
          //   { time: currentTime - 0.1 * getRandomNumber(), value: getRandomNumber() },
          //   { time: currentTime - 0.1 * getRandomNumber(), value: getRandomNumber() },
          //   { time: currentTime - 0.1 * getRandomNumber(), value: getRandomNumber() }
          // ]);
            setMOT(prevArray => {
            if (prevArray.length >= 20) {
              prevArray.shift();
            }
            return [...prevArray, { time: currentTime - 0.05 * getRandomNumber(), value: getRandomNumber() }];
            });
            
            setPGNG(prevArray => {
            if (prevArray.length >= 20) {
              prevArray.shift();
            }
            return [...prevArray, { time: currentTime - 0.05 * getRandomNumber(), value: getRandomNumber() }];
            });

            setPFT(prevArray => {
              if (prevArray.length >= 20) {
                prevArray.shift();
              }
              return [...prevArray, { time: currentTime - 0.05 * getRandomNumber(), value: getRandomNumber() }];
              });

            setPFTPG(prevArray => {
              if (prevArray.length >= 20) {
                prevArray.shift();
              }
              return [...prevArray, { time: currentTime - 0.05 * getRandomNumber(), value: getRandomNumber() }];
              }

            );  

            setMFT(prevArray => {
              if (prevArray.length >= 20) {
                prevArray.shift();
              }
              return [...prevArray, { time: currentTime - 0.05 * getRandomNumber(), value: getRandomNumber() }];
              }
            );

            setTFM(prevArray => {
              if (prevArray.length >= 20) {
                prevArray.shift();
              }
              return [...prevArray, { time: currentTime - 0.05 * getRandomNumber(), value: getRandomNumber() }];
              }
            );

            setPFM(prevArray => {
              if (prevArray.length >= 20) {
                prevArray.shift();
              }
              return [...prevArray, { time: currentTime - 0.05 * getRandomNumber(), value: getRandomNumber() }];
              }
            );
            var result: Data;
            try {
              result = await fetchRandomData();
            } catch (error) {
              console.error("Error fetching data from WebSocket:", error);
              return;
            }
            var result_data_list = result['data'];
            if (result_data_list !== undefined) {
              var actuators = result_data_list['actuators'];
              var sensors = result_data_list['sensors'];
              // console.log("Actuators: ", actuators);
              // console.log("Sensors: ", sensors);
              formatArrayfromBackend(sensors, actuators);
              //parseSensors(sensors);
            }
          }

        const delay = 500; //delay to actually read the values in real time
        const intervalId = setInterval(fetchWSData, delay);

        return () => clearInterval(intervalId);
    }, []);



    return (
        <div className={'graphs__container'}>
            <LineChart title="Graph #1 Title" data={[{name: 'data1', data: mot, color:'red'}, {name: 'data2', data: pgngArray, color:'blue'}]} />
            <LineChart title="Graph #2" data={[{name: 'data1', data: pftpgArray, color:'red'}, {name: 'data2', data: pfmArray, color:'blue'}]} />
            <LineChart title="Graph #3" data={[{name: 'data1', data: mftArray, color:'orange'}]} />
            <LineChart title="Graph #4" data={[{name: 'data1', data: pftArray, color:'red'}, {name: 'data2', data:pftpgArray, color:'orange'}]} />
            <LineChart title="Graph #5" data={[{name: 'data1', data: tfmArray, color:'red'}]} />
            <LineChart title="Graph #6" data={[{name: 'data1', data: pfmArray, color:'green'}]} />
        </div>
    )
}