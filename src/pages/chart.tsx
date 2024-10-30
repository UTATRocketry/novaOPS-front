import { Chart } from 'react-google-charts';
import {useState, useEffect} from 'react'

export const LineChart = ({ title, data }: { title: string, data: any[] }) => {
    const options = {
        title,
        curveType: "function",
        legend: { position: "none" },
        hAxis: {
            gridlines: { count: 10 },
        },
        vAxis: {
            viewWindow: {
                min: 0,
                max: 60,
            },
        },
    };
    if (data.length === 0) {
        return <div>No data</div>;
    }
    return (
        <Chart
            chartType="LineChart"
            width="600px"
            height="400px"
            data={data}
            options={options}
        />
    );
};