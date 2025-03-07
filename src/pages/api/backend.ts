import axios from 'axios'
import { getRandomNumber } from './basicData';
import { get } from 'http';


export interface Sensor {
    name: string;
    value: number;
}

export interface Actuator {
    name: string;
    value: number;
}

export interface Data {
    data: {
        sensors: Sensor[];
        actuators: Actuator[];
    }
}

export const fetchTestMessage = async () => {
     
    var result;

    try {
        const response = await axios.get(`http://raspberrypi.local/entry`, {
            method: 'GET',
            headers: {
                "Content-Type": "application/json"
            }
        })
        result = await response
        
        console.log(result)

    } catch (err) {
        console.log("Message not Fetched")
        
    }

    return result


    
}


export const fetchTestWS = async (): Promise<Data> => {
    var result;
    try {
        const response = await axios.get(`http://raspberrypi.local:8000/front`, { 
            method: 'GET',
            headers: {
                "Content-Type": "application/json"
            }
        })
        result = await response;
        return result;
    } catch (err) {
        console.log("Message not Fetched")
        return {};
    }
}

export const sendDataCommand = async (data) => {
    
    try {
        const response = await axios.post(`http://raspberrypi.local/command`, data, {
            method:'POST',
            headers: {
                "Content-Type": "application/json"
            },
        })
        const result = await response;
        console.log("Status was updated")
        return result;
    } catch (err) {
        console.log("Status was not updated")
        return {};
    }
}


export const fetchRandomData = async (): Promise<Data> => {
    return {
        data: {
            sensors: [
                { name: 'MOT', value: getRandomNumber() },
                { name: 'PGSO', value: getRandomNumber() },
                { name: 'TGSO-G', value: getRandomNumber() },
                { name: 'MFT', value: getRandomNumber() },
                { name: 'PCC', value: getRandomNumber() },
                { name: 'PFM', value: getRandomNumber() },
            ],
            actuators: []
        }
    }
}
