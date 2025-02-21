import { Chart } from 'react-google-charts';
import {useState, useEffect} from 'react'
import { DataPoint } from './api/backend';
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
import { AspectRatio } from '@chakra-ui/react';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
  );

export interface DataPoint {
  time: number;
  value: number;
}
export interface DataSeries {
  name: string;
  data: DataPoint[];
  color: string;
}

export const LineChart = ({ title, data, plotDifference = false }: { title: string, data: DataSeries[], plotDifference: boolean }) => {
  const [plotData, setPlotData] = useState<{ labels: string[], datasets: { label: string, data: (number | null)[], fill: boolean, borderColor: string, tension: number }[] }>({labels: [], datasets: []});

  if (data.length === 0) {
    return <div>No data</div>;
  }

  if (plotDifference && data.length !== 2) {
    return <div>Plotting difference requires exactly two data series</div>;
  }

  const options = {
    responsive: true,
    spanGaps: true,
    animation: false,
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
        title: {
          display: true,
          text: 'Time (s)',
        },
      },
      y: {
        // min: 0,
        title: {
          display: true,
          text: 'Sensor Value',
        },
      },
    },
  };

  const formatData = (data: DataSeries[]) => {
    const currentTime = Date.now() / 1000;
    const labels = Array.from(new Set(data.flatMap(series => series.data.map(point => ((point.time - currentTime)).toString())))).sort((a, b) => Number(a) - Number(b));

    let datasets;
    if (plotDifference) {
      const dataMap1 = new Map(data[0].data.map(point => [(point.time - currentTime), point.value]));
      const dataMap2 = new Map(data[1].data.map(point => [(point.time - currentTime), point.value]));
      const seriesData = labels.map(label => dataMap1.get(Number(label)) - dataMap2.get(Number(label)));
      datasets = [{
        label: `${data[0].name} - ${data[1].name}`,
        data: seriesData,
        fill: false,
        borderColor: data[0].color,
        tension: 0.1
      }];
    } else {
        datasets = data.map(series => {
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
    }

    return {
      labels,
      datasets
    };
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setPlotData(formatData(data));
    }, 10);

    return () => clearInterval(interval);
  }, [data]);

  return (
    <Line className="graphs__component" data={plotData} options={options} height="200px" />
  );
};