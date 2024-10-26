import axios from 'axios'



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
        const response = await axios.get(`http://localhost:8000/ws_front`, { 
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