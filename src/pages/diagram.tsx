// chakra and component imports
import { useState, useEffect, useRef, useCallback, useMemo, act} from "react";
import {
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  Button, Text, Flex, Tabs, TabList, TabPanels, Tab, TabPanel
} from '@chakra-ui/react'
import Link from "next/link";

//api imports 
import { getRandomNumber } from "./api/basicData";
import { fetchTestMessage } from "./api/backend";
import { sendDataCommand } from "./api/backend";
import { fetchTestWS } from "./api/backend";










const PIDDiagram = () => {
  const [trigger, setTrigger] = useState(0);
  const [actuatorDictBuffer, setActuatorDictBuffer] = useState<ArrayBuffer | undefined>(undefined);
  const [sensorDictBuffer, setSensorDictBuffer] = useState<ArrayBuffer | undefined>(undefined);
 

  //valves
  const [bvft, setBVFT] = useState(false);
  const [bvftValue, setBVFTValue] = useState(0);
  const [rftp, setRFTP] = useState(false);
  const [rftpValue, setRFTPValue] = useState(0);
  const [rvft, setRVFT] = useState(false);
  const [rvftValue, setRVFTValue] = useState(0);
  const [bvftb, setBVFTB] = useState(false);
  const [bvftbValue, setBVFTBValue] = useState(0);
  const [mfv, setMFV] = useState(false);
  const [mfvValue, setMFVValue] = useState(0);
  const [svftValue, setSVFTValue] = useState(0);
  const [svft, setSVFT] = useState(false);

  const [bvot, setBVOT] = useState(false);
  const [bvotValue, setBVOTValue] = useState(0);
  const [rotp, setROTP] = useState(false);
  const [rotpValue, setROTPValue] = useState(0);
  const [rvot, setRVOT] = useState(false);
  const [rvotValue, setRVOTValue] = useState(0);
  const [svotv, setSVOTV] = useState(false);
  const [svotvValue, setSVOTVValue] = useState(0);
  const [svotd, setSVOTD] = useState(false);
  const [svotdValue, setSVOTDValue] = useState(0);
  const [mov, setMOV] = useState(false);
  const [movValue, setMOVValue] = useState(0);


  // pressure gauges and tc's 

  //fuel side
  const [pgng, setPGNG] = useState({name: 'pgng', type:'pressure gauge', value: 0});
  const [pftpg, setPFTPG] = useState({name: 'pftpg', type:'pressure gauge', value: 0});
  const [pft, setPFT] = useState({name: 'pft', type:'pressure gauge', value: 0});
  const [mft, setMFT] = useState({name: 'mft', type:'pressure gauge', value: 0});
  const [tfm, setTFM] = useState({name: 'tfm', type:'pressure gauge', value: 0});
  const [pfm, setPFM] = useState({name: 'pfm', type:'pressure gauge', value: 0});

  //ox side
  const [potphg, setPOTPHG] = useState({name: 'potphg', type:'pressure gauge', value: 0});
  const [potplg, setPOTPLG] = useState({name: 'potplg', type:'pressure gauge', value: 0});
  const [pott, setPOTT] = useState({name: 'pott', type:'pressure gauge', value: 0});
  const [mot, setMOT] = useState({name: 'mot', type:'load cell', value: 0});
  const [tot, setTOT] = useState({name: 'tot', type:'load cell', value: 0});
  const [potb, setPOTB] = useState({name: 'potb', type:'pressure gauge', value: 0});
  const [pcc, setPCC] = useState({name: 'pcc', type:'pressure gauge', value: 0}); 


  const [eventArray, seteventArray] = useState([])
  const [isOpen, onOpen] = useState(false)
  const btnRef = useRef()


// need to change this in the future. Ideally, one function that can update all actuators

  const addMFV = async (e) => {
    console.log("changing MFV status")
    if (actuatorDict['MFV'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'MFV': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'MFV', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'MFV': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'MFV', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }

  const addRFTP = async (e) => {
    console.log("changing RFTP status")
    if (actuatorDict['RFTP'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'RFTP': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'RFTP', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'RFTP': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'RFTP', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }
  
  const addBVFTP = async (e) => {
    console.log("changing BVFTP status")
    if (actuatorDict['BVFTP'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'BVFTP': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'BVFTP', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'RFTP': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'BVFTP', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }

  const addBVFTB = async (e) => {
    console.log("changing BVFTB status")
    if (actuatorDict['BVFTB'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'BVFTB': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'BVFTB', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'BVFTB': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'BVFTB', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }

  const addROTP = async (e) => {
    console.log("changing ROTP status")
    if (actuatorDict['ROTP'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'ROTP': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'ROTP', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'ROTP': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'ROTP', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }

  const addBVOTP = async (e) => {
    console.log("changing BVOTP status")
    if (actuatorDict['BVOTP'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'BVOTP': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'BVOTP', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'BVOTP': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'BVOTP', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }

  const addSVOTV = async (e) => {
    console.log("changing SVOTV status")
    if (actuatorDict['SVOTV'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'SVOTV': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'SVOTV', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'SVOTV': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'SVOTV', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }

  const addRVOT = async (e) => {
    console.log("changing RVOT status")
    if (actuatorDict['RVOT'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'RVOT': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'RVOT', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'RVOT': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'RVOT', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }

  const addMOV = async (e) => {
    console.log("changing MOV status")
    if (actuatorDict['MOV'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'MOV': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'MOV', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'MOV': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'MOV', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }


  const addRVFT = async (e) => {
    console.log("changing RVFT status")
    if (actuatorDict['RVFT'] == 'close') {
      const updatedActuatorDict = {...actuatorDict, 'RVFT': 'open'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'RVFT', value: 'open'}]);
      await sendStatusData(updatedActuatorDict);
      
    } else {
      const updatedActuatorDict = {...actuatorDict, 'RVFT': 'close'};
      const updatedActuatorBuffer = convertActuatorsToBuffer(updatedActuatorDict);
      setActuatorDictBuffer(updatedActuatorBuffer);
      seteventArray([...eventArray, {name: 'RVFT', value: 'close'}]);
      await sendStatusData(updatedActuatorDict);
    }

  }





  const sendStatusData = async (actuatorDict) => {
    const result = await sendDataCommand(actuatorDict);
    console.log(result);

  }


  const formatActuatorArrayForDisplay = useCallback((actuators: any[]) => {
    return actuators.reduce((acc, actuator) => {
      if (actuator) {
        acc[actuator.name] = actuator.status;
      }
      return acc;
    }, {} as { [key: string]: any });
  }, []);

  const convertActuatorsToBuffer = useCallback((actuators: any[]): ArrayBuffer => {
    const jsonString = JSON.stringify(actuators);
    const encoder = new TextEncoder();
    return encoder.encode(jsonString).buffer;
  }, []);

  const formatSensorArrayForDisplay = (sensors: []) => {
    const new_dict: [string: [any]] = {}
    for (let i =0; i <= sensors.length; i++) {
      if (sensors[i] == undefined) {
        continue;
      } else {
        const current_dict = sensors[i];
        new_dict[current_dict['id']] = current_dict['value']; // we are only storing because that's all we care about for display
      }

    }

    return new_dict
  }

  const convertSensorsToBuffer = useCallback((sensors: any[]): ArrayBuffer => {
    const jsonString = JSON.stringify(sensors);
    const encoder = new TextEncoder();
    return encoder.encode(jsonString).buffer;
  }, []);

  const decodeActuatorBuffer = useCallback((buffer: ArrayBuffer | undefined) => {
    if (!buffer) return {};
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(buffer));
  }, []);

  const decodeSensorBuffer = useCallback((buffer: ArrayBuffer | undefined) => {
    if (!buffer) return {};
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(buffer));
  }, []);



  useEffect( () => {
    
    // api fetching functions
    const fetchMessage = async () => {
      var result = await fetchTestMessage();
      console.log(result)
    }

    const fetchWSData = async () => {
      
      var result = await fetchTestWS();
      var result_data_list = result['data'];
      var actuators = result_data_list['actuators'];
      var sensors = result_data_list['sensors'];
      console.log("Actuators: ", actuators);
      console.log("Sensors: ", sensors);
      
      //return actuators, sensors;
      //parseSensors(sensors);
      
      const actuator_dict_display = formatActuatorArrayForDisplay(actuators);
      const actuator_dict_buffer = convertActuatorsToBuffer(actuator_dict_display);
      console.log("Actuator Buffer: ", actuator_dict_buffer);
      setActuatorDictBuffer(actuator_dict_buffer);

      const sensor_dict_display = formatSensorArrayForDisplay(sensors);
      const sensor_dict_buffer = convertSensorsToBuffer(sensor_dict_display);
      console.log("Sensor Buffer: ", sensor_dict_buffer);
      setSensorDictBuffer(sensor_dict_buffer);
      
    }
    
    const delay = 2500; // Delay to actually read the values in real time
    const timeoutId = setTimeout(() => {
      fetchWSData();
      setTrigger(prev => prev + 1); // Update the trigger state to re-run useEffect
    }, delay);

    

  }, [trigger, sensorDictBuffer, actuatorDictBuffer]);
  const actuatorDict = decodeActuatorBuffer(actuatorDictBuffer);
  const sensorDict = decodeSensorBuffer(sensorDictBuffer);
  console.log("Sensor Dictionary after Decoding: ", sensorDict);
  console.log("Actuatot Dictionary after Decoding: ", actuatorDict);

    return ( // need to replace values with values in buffer
      <div style={{ backgroundColor: 'white', width: '100%', height: '100%' }}>
        <Tabs align='end'>
          <TabList>
            <Tab>Liquid</Tab>
            <Tab>Hybrid</Tab>
            <Tab>Solid</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <svg viewBox="0 0 1200 1000" className="w-full h-full" > 
                <image x="50" y="180" width="60" height="60" href="images/gptOne.png" />
                <image x="150" y="180" width="60" height="60" href="images/rf.png" onClick={(e) => addRFTP(e)} />
                {rftp == true ? <text x="146" y="180" fontSize='10px' >RFTP (open)</text>: <text x="146" y="180" fontSize='10px' >RFTP (close)</text>}
                <text x="164" y="240" fontSize='10px' >{rftpValue} kg/s</text>
                <image x="100" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="255" y="175" width="60" height="60" href="images/bv.png" onClick={(e) => addBVFTP(e)} />
                <text x="252" y="175" fontSize='10px' >BVFTP ({actuatorDict['BVFTP']}) </text>
                <text x="268" y="235" fontSize='10px' >{bvftValue} kg/s </text>
                <image x="200" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="309" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="360" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="420" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="530" y="185" width="60" height="60" href="images/ft.png" />
                <image x="479" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="640" y="185" width="60" height="60" href="images/bvf.png" onClick={(e) => addBVFTB(e)}/>
                {bvftb == true ? <text x="624" y="189" fontSize='10px'>BVFTB-M (open)</text>: <text x="624" y="189" fontSize='10px'>BVFTB-M (close)</text>}
                <text x="654" y="239" fontSize='10px'>{bvftbValue} kg/s</text>
                <image x="582" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="750" y="175" width="60" height="60" href="images/bv.png" onClick={(e) => addMFV(e)}/>
                <text x="748" y="179" fontSize='10px'>MFV ({actuatorDict['MFV']})</text>
                <text x="768" y="239" fontSize='10px'>{mfvValue} kg/s</text>
                <image x="695" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="855" y="185" width="60" height="60" href="images/venturi.png" />
                <text x="865" y="185" fontSize='10px'>Venturi</text>
                <image x="803" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="908" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="960" y="185" width="60" height="60" href="images/horizontalFour.png" />
                <image x="1020" y="185" width="60" height="60" href="images/horizontalFour.png" />
                

                
                <image x="102" y="265" width="60" height="60" href="images/pg.png" />
                <text x="115" y="325" fontSize='10px'>PGN-G</text>
                <text x="117" y="335" fontSize='10px'>{pgng['value']} psi</text>
                <image x="100" y="215" width="60" height="60" href="images/verticalThree.png" />
                <image x="197" y="265" width="60" height="60" href="images/pg.png" />
                <text x="207" y="325" fontSize='10px'>PFTP-G</text>
                <text x="210" y="335" fontSize='10px'>{pftpg['value']} psi</text>
                <image x="195" y="215" width="60" height="60" href="images/verticalThree.png" />
                <image x="325" y="215" width="60" height="60" href="images/verticalThree.png" />
                <image x="331" y="346" width="60" height="60" href="images/sv.png" onClick={(e) => addSVFT(e)}/>
                <text x="310" y="375" fontSize='10px'>SVFTV</text>
                <text x="308" y="385" fontSize='10px'>({actuatorDict['SVFTV']}) </text>
                <text x="307" y="397" fontSize='10px'>{svftValue} kg/s</text>
                <text x="340" y="287" fontSize='12px'>vent</text>
                <image x="325" y="295" width="60" height="60" href="images/verticalThree.png" />
                <image x="367" y="265" scale="0.7" width="60" height="60" href="images/pt.png" />
                <text x="385" y="327" fontSize='10px'>PFT</text>
                <text x="385" y="337" fontSize='10px'>{sensorDict[0]} psi</text>
                <image x="365" y="215" width="60" height="60" href="images/verticalThree.png" />
                <image x="412" y="266" width="60" height="60" href="images/rv.png" onClick={(e) => addRVFT(e)}/>
                {rvft == true ? <text x="465" y="296" fontSize='10px'>RVFT (open)</text>: <text x="465" y="296" fontSize='10px'>RVFT (close)</text>}
                <text x="465" y="306" fontSize='10px'>{rvftValue} kg/s</text>
                <image x="405" y="215" width="60" height="60" href="images/verticalThree.png" />
                <image x="465" y="155" width="60" height="60" href="images/verticalThree.png" />
                <image x="465" y="30" width="60" height="60" href="images/fill.png" />
                <text x="485" y="150" fontSize='12px'>Fill</text>
                <image x="465" y="75" width="60" height="60" href="images/verticalThree.png" />
                <image x="536" y="79" width="60" height="60" href="images/LC.png" />
                <text x="550" y="75" fontSize='12px'>MFT</text>
                <text x="550" y="60" fontSize='12px'>{sensorDict[1]} mV/V</text>
                <image x="533" y="126" width="60" height="60" href="images/verticalThree.png" />
                <image x="1010" y="105" width="60" height="60" href="images/pt.png" />
                <text x="1027" y="109" fontSize='10px'>PFM</text>
                <text x="1027" y="95" fontSize='10px'>{sensorDict[2]} psi</text>
                <image x="1010" y="155" width="60" height="60" href="images/verticalThree.png" />
                <image x="952" y="109" width="60" height="60" href="images/tc.png" />
                <text x="966" y="109" fontSize='10px'>TFM</text>
                <text x="966" y="95" fontSize='10px'>{sensorDict[3]} V</text>
                <image x="950" y="155" width="60" height="60" href="images/verticalThree.png" />
                <image x="997" y="288" width="100" height="100" scale='2' href="images/cc.png" />
                <image x="1070" y="285" width="60" height="60" href="images/horizontalFour.png" />
                <image x="997" y="224" width="100" height="100" scale='2' href="images/injector.png" />
                <text x="1030" y="287" fontSize='10px'>injector</text>
                <image x="1050" y="215" width="60" height="60" href="images/verticalThree.png" />



                <image x="50" y="420" width="60" height="60" href="images/gtTwo.png" />
                <image x="150" y="415" width="60" height="60" href="images/rf.png" onClick={(e) => addROTP(e)}/>
                {rotp == true ? <text x="150" y="415" fontSize='10px' >ROTP (open)</text>: <text x="150" y="415" fontSize='10px' >ROTP (close)</text>}
                <text x="165" y="475" fontSize='10px' >{rotpValue} kg/s</text>
                <image x="100" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="255" y="410" width="60" height="60" href="images/bv.png" onClick={(e) => addBVOTP(e)}/>
                <text x="250" y="477" fontSize='10px' >BVOTP ({actuatorDict['BVOTP']}) </text>
                <text x="270" y="495" fontSize='10px' >{sensorDict[4]} kg/s</text>
                <image x="200" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="307" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="366" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="420" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="530" y="420" width="60" height="60" href="images/ot.png" />
                <image x="479" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="581" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="638" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="688" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="748" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="788" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="834" y="410" width="60" height="60" href="images/pmov.png" onClick={(e) => addMOV(e)}/>
                {mov == true ? <text x="834" y="410" fontSize='10px'>MOV (open)</text>: <text x="834" y="410" fontSize='10px'>MOV (close)</text>}
                <text x="850" y="470" fontSize='10px'>{movValue} kg/s</text>
                <image x="782" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="888" y="420" width="60" height="60" href="images/horizontalFour.png" />
                <image x="945" y="250" width="60" height="60" href="images/horizontalFour.png" />
                
                <image x="102" y="497" width="60" height="60" href="images/pg.png" />
                <text x="110" y="560" fontSize='10px'>POTPH-G</text>
                <text x="112" y="570" fontSize='10px'>{potphg['value']} psi</text>
                <image x="100" y="450" width="60" height="60" href="images/verticalThree.png" />
                <image x="197" y="497" width="60" height="60" href="images/pg.png" />
                <text x="204" y="560" fontSize='10px'>POTPL-G</text>
                <text x="210" y="570" fontSize='10px'>{potplg['value']} psi</text>
                <image x="195" y="450" width="60" height="60" href="images/verticalThree.png" />
                <image x="440" y="335" width="60" height="60" href="images/svunshaded.png" onClick={(e) => addSVOTD(e)}/>
                <text x="448" y="335" fontSize='10px'>Dump</text>
                <text x="420" y="365" fontSize='10px'>SVOTD</text>
                <text x="407" y="377" fontSize='10px'>({actuatorDict['SVOTD']})</text>
                <text x="407" y="389" fontSize='10px'>{svotdValue} kg/s</text>
                <image x="440" y="450" width="60" height="60" href="images/verticalThree.png" />
                <text x="460" y="520" fontSize='10px'>vent</text>
                <image x="435" y="390" width="60" height="60" href="images/verticalThree.png" />
                <image x="350" y="480" width="60" height="60" href="images/svrotated.png" onClick={(e) => addSVOTV(e)}/>
                <text x="342" y="540" fontSize='10px'>SVOTV ({actuatorDict['SVOTV']})</text>
                <text x="362" y="550" fontSize='10px'>{svotvValue} kg/s</text>
                <image x="400" y="487" width="60" height="60" href="images/horizontalFour.png" />
                
                
                <image x="435" y="390" width="60" height="60" href="images/verticalThree.png" />
                <image x="488" y="336" width="60" height="60" href="images/rv.png"  onClick={(e) => addRVOT(e)}/>
                {rvot == true ? <text x="542" y="366" fontSize='10px'>RVOT (open)</text>: <text x="542" y="366" fontSize='10px'>RVOT (close)</text>}
                <text x="562" y="376" fontSize='10px'>{rvotValue} kg/s</text>
                <image x="482" y="390" width="60" height="60" href="images/verticalThree.png" />
                <image x="488" y="500" width="60" height="60" href="images/pt.png" />
                <text x="502" y="566" fontSize='10px'>POTT</text>
                <text x="504" y="576" fontSize='10px'>{sensorDict[5]} psi</text>
                <image x="485" y="450" width="60" height="60" href="images/verticalThree.png" />
                <image x="618" y="506" width="60" height="60" href="images/LC.png" onClick={() => console.log("hello")}/>
                <text x="636" y="566" fontSize='10px'>MOT</text>
                <text x="636" y="576" fontSize='10px'>{sensorDict[6]} mV/V</text>
                <image x="566" y="505" width="60" height="60" href="images/horizontalFour.png" />
                <image x="537" y="475" width="60" height="60" href="images/verticalThree.png" />
                <image x="667" y="343" width="60" height="60" href="images/tc.png" />
                <text x="685" y="349" fontSize='10px'>TOT</text>
                <text x="685" y="339" fontSize='10px'>{sensorDict[7]} V</text>
                <image x="665" y="389" width="60" height="60" href="images/verticalThree.png" />
                <image x="740" y="339" width="60" height="60" href="images/pt.png" />
                <text x="755" y="339" fontSize='10px'>POTB</text>
                <text x="755" y="327" fontSize='10px'>{sensorDict[0]} psi</text>
                <image x="740" y="389" width="60" height="60" href="images/verticalThree.png" />
                <image x="917" y="339" width="60" height="60" href="images/verticalThree.png" />
                <image x="917" y="279" width="60" height="60" href="images/verticalThree.png" />
                <image x="917" y="389" width="60" height="60" href="images/verticalThree.png" />
                <image x="917" y="280" width="60" height="60" href="images/verticalThree.png" />
                <image x="1102" y="364" width="60" height="60" href="images/pt.png" />
                <text x="1123" y="424" fontSize='10px'>PCC</text>
                <text x="1123" y="434" fontSize='10px'>{sensorDict[1]} psi</text>
                <image x="1100" y="314" width="60" height="60" href="images/verticalThree.png" />
                



                
                



                
                
                
                

          
                  
              </svg>
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


        <Button position='absolute' top='20' right='0' padding='10px' margin='10px' onClick={() => onOpen(true)}>Actuation Log</Button>
        <Link href='/plots'><Button position='absolute' top='20' right='40' margin='10px'>Plots</Button></Link>
        <Drawer
        isOpen={isOpen}
        placement='right'
        onClose={() => onOpen(false)}
        finalFocusRef={btnRef}
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Actuation Log</DrawerHeader>

          <DrawerBody>
            {eventArray.length > 0 && eventArray.map((event, index) => (
              <Flex key={index} justifyContent='space-between'>
                <div>
                  <div>
                    <Text>{event.name}: {event.value.toString()}</Text>
                  </div>
                  
                </div>
                <div style={{alignContent:'right'}} >
                  <Text ml='auto'>{event.time}</Text>
                </div>
              </Flex>
            ))}
            
          </DrawerBody>

          <DrawerFooter>
            <Button colorScheme='blue' mr={3} onClick={() => onOpen(false)}>
              Close
            </Button>
            
          </DrawerFooter>
        </DrawerContent>
      </Drawer>




        
      </div>
    );
  };
  
  export default PIDDiagram;
