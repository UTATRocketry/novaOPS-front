import React from 'react';
import { SensorSvgProps } from './types';

export function SensorSvg({ name, value, unit, x, y, fontSize = 12, fillColor = "#e6e6e6", textColor = "#333333", strokeColor = "#666666"}: SensorSvgProps) {
    return (
        <g>
            <text x={x} y={y + 20/2}  fill={textColor} fontSize={fontSize}
                  fontFamily="Helvetica" textAnchor="left" dominantBaseline="middle">
                {name}
            </text>
            <g>
                <rect x={x} y={y+20} width={50} height={20} fill={"white"} stroke={strokeColor}/>
                <text x={x + 50/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                    {value}
                </text>
            </g>
            <g>
                <rect x={x+50} y={y+20} width={30} height={20} fill={fillColor} stroke={strokeColor}/>
                <text x={x + 50 + 30/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                    {unit}
                </text>
            </g>
        </g>
  );
}
//export default SensorSvg;