import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import {useState, useEffect} from 'react'

import { fetchTestWS } from "./api/backend";

// api imports
import { getRandomNumber } from "./api/basicData";

export default function PressureGraph() {
    
    const [data, setData] = useState([{name: 1, uv: 40, pv: 20, qv: 20}, {name: 2, uv: 20, pv: 10, qv: 0}, {name: 3, uv: 10, pv: 20, qv: 20}])

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
      
            var result = await fetchTestWS();
            var result_data_list = result['data'];
            var actuators = result_data_list['actuators'];
            var sensors = result_data_list['sensors'];
            console.log("Actuators: ", actuators);
            console.log("Sensors: ", sensors);
      
            //return actuators, sensors;
            parseSensors(sensors);
 
          }

        const delay = 1000; //delay to actually read the values in real time
        const timeoutId = setTimeout(fetchWSData, delay);
    })



    return (
        <div>
            
            <LineChart width={500} height={300} data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line type="monotone" dataKey="uv" stroke="#1684d8" />
                <Line type="monotone" dataKey="pv" stroke="orange" />
                <Line type="monotone" dataKey="qv" stroke="red" />
                <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
            </LineChart>
        </div>
    )
}