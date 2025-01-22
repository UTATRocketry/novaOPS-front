import { Chart } from 'react-google-charts';
import {useState, useEffect} from 'react'
import { DataSeries } from './pressureG';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
  } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
  );

export const LineChart = ({ title, data }: { title: string, data: DataSeries[] }) => {
    const [plotData, setPlotData] = useState<{ labels: string[], datasets: { label: string, data: (number | null)[], fill: boolean, borderColor: string, tension: number }[] }>({labels: [], datasets: []});

    if (data.length === 0) {
        return <div>No data</div>;
    }

    const options = {
        responsive: true,
        spanGaps: true,
        plugins: {
          legend: {
            position: 'top' as const,
          },
          title: {
            display: true,
            text: title,
          },
        },
        scales: {
          x: {
            min: -5,
            max: 0,
            type: 'linear',
            position: 'bottom',
          },
        },
      };

    const formatData = (data: DataSeries[]) => {
        console.log(data);
        const currentTime = Math.round(Date.now() / 1000);
        console.log(currentTime);
        const labels = Array.from(new Set(data.flatMap(series => series.data.map(point => ((point.time - currentTime)).toString())))).sort((a, b) => Number(a) - Number(b));

        const datasets = data.map(series => {
            const dataMap = new Map(series.data.map(point => [(point.time - currentTime), point.value]));
            const seriesData = labels.map(label => dataMap.get(Number(label)) ?? null);
            return {
                label: series.name,
                data: seriesData,
                fill: false,
                borderColor: series.color,
                tension: 0.1
            };
        });

        return {
            labels,
            datasets
        };
    }

    useEffect(() => {
        setPlotData(formatData(data));
    }, [data]);

    return (
        <Line className="graphs__component" data={plotData} options={options} />
    );
};