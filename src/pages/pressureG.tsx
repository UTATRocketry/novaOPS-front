import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import {useState, useEffect} from 'react'


// api imports
import { getRandomNumber } from "./api/basicData";

export default function PressureGraph() {
    
    const [data, setData] = useState([{name: 1, uv: 40, pv: 20, qv: 20}, {name: 2, uv: 20, pv: 10, qv: 0}, {name: 3, uv: 10, pv: 20, qv: 20}])

    useEffect(() => {

        const getRandom = () => {
            const random_one = getRandomNumber();
            const random_two = getRandomNumber();
            const random_three = getRandomNumber();
            const length = data.length;
            const new_dict = {name: length + 1, uv: random_one, pv: random_two, qv: random_three};
            setData(prevArray => [...prevArray, new_dict])

        }

        const delay = 1000; //delay to actually read the values in real time
        const timeoutId = setTimeout(getRandom, delay);
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