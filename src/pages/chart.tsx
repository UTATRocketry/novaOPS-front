import { Chart } from 'react-google-charts';
import {useState, useEffect} from 'react'
import { DataSeries } from './pressureG';

export const LineChart = ({ title, data }: { title: string, data: DataSeries[] }) => {
    const [plotData, setPlotData] = useState<(string | number | null)[][]>([]);

    const options = {
        title,
        curveType: "none",
        // legend: { position: "none" },
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

    const formatData = (data: DataSeries[]) => {
        const headers = ['time', ...data.map(series => series.name)];
        const rows: (number | string | null)[][] = [];

        const allDataPoints = data.flatMap(series => series.data);
        const uniqueTimes = Array.from(new Set(allDataPoints.map(point => point.time))).sort((a, b) => a - b);
        const currentTime = Math.round(Date.now() / 1000);

        uniqueTimes.forEach(time => {
            const row: (number | string | null)[] = [(time - currentTime)/1000];
            data.forEach(series => {
                const dataPoint = series.data.find(point => point.time === time);
                row.push(dataPoint ? dataPoint.value : null);
            });
            rows.push(row);
        });
        return [headers, ...rows];
    }

    useEffect(() => {
        console.log(data);
        setPlotData(formatData(data));
        console.log(plotData);
    }, [data]);

    return (
        <Chart
            chartType="LineChart"
            width="600px"
            height="400px"
            data={plotData}
            options={options}
        />
    );
};