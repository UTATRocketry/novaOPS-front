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
        const response = await axios.get(`http://localhost:8000/entry`, {
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


export const fetchTestWS = async () => {
    var result;
    try {
        const response = await axios.get(`http://localhost:8000/front`, { 
            method: 'GET',
            headers: {
                "Content-Type": "application/json"
            }
        })
        result = await response;
        return result['data'];
    } catch (err) {
        console.log("Message not Fetched")
        return {};
    }
}

export const sendDataCommand = async (data) => {
    
    try {
        const response = await axios.post(`http://localhost:8000/command`, data, {
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
            ],
            actuators: []
        }
    }
}
