import { Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import {useState, useEffect} from 'react'

import { fetchTestWS } from "./api/backend";
import { LineChart } from './chart';

// api imports
import { getRandomNumber } from "./api/basicData";

export default function PressureGraph() {
    
    const [data, setData] = useState([['time', 'pv', 'uv', 'qv'], [0, 0, 0, 1], [1, 0.5, 1, 0]]);

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

    const [pgngArray, setPGNG] = useState([]);
    const [pftpgArray, setPFTPG] = useState([]);
    const [pftArray, setPFT] = useState([]);
    const [mftArray, setMFT] = useState([]);
    const [tfmArray, setTFM] = useState([]);
    const [pfmArray, setPFM] = useState([]);
  
    //ox side
    const [potphg, setPOTPHG] = useState([]);
    const [potplg, setPOTPLG] = useState([]);
    const [pott, setPOTT] = useState([]);
    const [mot, setMOT] = useState([]);
    const [tot, setTOT] = useState([]);
    const [potb, setPOTB] = useState([]);
    const [pcc, setPCC] = useState([]); 

    const parseSensors = (sensors: [string: any]) => { 
    
        for (let i = 0; i < sensors.length; i++) {
          
          const sensor = sensors[i];
          console.log("Sensor: ", sensor)
          if (sensor['name'] == 'MOT') {
            const mot_value = sensor['value'];
            setMOT(prevMOT => [...prevMOT, mot_value]);
          } else if (sensor['name'] == 'PGSO') {
            // ignore this 
          } else if (sensor['name'] == 'TGSO-G') {
            // ignore this
          }
    
        }
      }

    useEffect(() => {

        const fetchWSData = async () => {
            var result = {};
            try {
              result = await fetchTestWS();
            } catch (error) {
              console.error("Error fetching data from WebSocket:", error);
              return;
            }
            var result_data_list = result['data'];
            if (result_data_list !== undefined) {
              var actuators = result_data_list.get('actuators');
              var sensors = result_data_list.get('sensors');
              console.log("Actuators: ", actuators);
              console.log("Sensors: ", sensors);
              parseSensors(sensors);
            }

            var randomValue1 = getRandomNumber();
            var randomValue2 = getRandomNumber();
            var randomValue3 = getRandomNumber();
      
            //return actuators, sensors;
            const length = data.length > 0 ? data[data.length - 1][0] : 0;
            const new_data = [length + 1, randomValue1, randomValue2, randomValue3];
            setData(prevArray => {
              if(prevArray.length > 10){
                  // remove index 1, and re-add legend
                  prevArray.shift();
                  prevArray[0] = ['time', 'pv', 'uv', 'qv'];
              }
              return [...prevArray, new_data]
          })
            console.log("Data: ", data);
          }

        const delay = 1000; //delay to actually read the values in real time
        const intervalId = setInterval(fetchWSData, delay);

        return () => clearInterval(intervalId);
    }, [data])



    return (
        <div>
            
            {/* <LineChart width={500} height={300} data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line type="monotone" dataKey="uv" stroke="#1684d8" />
                <Line type="monotone" dataKey="pv" stroke="orange" />
                <Line type="monotone" dataKey="qv" stroke="red" />
                <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
            </LineChart> */}
            <LineChart title="Pressure in PGN-G, PFTP-G, PFT" data={data} />
        </div>
    )
}