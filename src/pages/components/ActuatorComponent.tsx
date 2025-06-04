import * as React from 'react'
import { ActuatorSvgProps } from './types';

//fontSize="xs"
export function ActuatorSvg({name, x, y, width, height, onPowerClick, powerState, fontSize = 12, fillColor = "#e6e6e6", textColor = "#333333", strokeColor = "#666666"  }: ActuatorSvgProps) {
    return (
        <g onClick={onPowerClick} style={{ cursor: 'pointer' }}>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={powerState ? '#D5E8D4' : '#F8CECC'}
                stroke={strokeColor}
            />
            <text
                x={x + width / 2}
                y={y + height / 2}
                fill={textColor}
                fontSize={fontSize}
                fontFamily="Helvetica"
                textAnchor="middle"
                dominantBaseline="middle"
            >
                {name}
            </text>
        </g>
    );
}
export function SolenoidSvg({name, x, y, width, height, onOpenClick, openState, fontSize = 12, fillColor = "#e6e6e6", textColor = "#333333", strokeColor = "#666666"  }: ActuatorSvgProps) {
    return (
        <g>
            <text x={x + 60/2} y={y + 20/2}  fill={textColor} fontSize={fontSize}
                  fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                {name}
            </text>
            <g onClick={onOpenClick} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y+20} width={60} height={20}
                      fill={openState ? '#D5E8D4' : '#F8CECC'}
                      stroke={openState ? '#82B366' : '#B85450'}
                />
                <text x={x + 60/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                    {openState ? "open" : "closed"}
                </text>
            </g>
        </g>


    );
}
export function ServoSvg({name, x, y, width, height, onOpenClick, onPowerClick, openState, powerState, fontSize = 12, fillColor = "#e6e6e6", textColor = "#333333", strokeColor = "#666666"  }: ActuatorSvgProps) {
    return (
        <g>
            <text x={x + 100/2} y={y + 20/2}  fill={textColor} fontSize={fontSize}
                  fontFamily="Arial" textAnchor="middle" dominantBaseline="middle">
                {name}
            </text>
            <g onClick={onOpenClick} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y+20} width={50} height={20}
                      fill={openState ? '#D5E8D4' : '#F8CECC'}
                      stroke={openState ? '#82B366' : '#B85450'}
                />
                <text x={x + 50/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Arial" textAnchor="middle" dominantBaseline="middle">
                    {openState ? "open" : "closed"}
                </text>
            </g>
            <g onClick={onPowerClick} style={{ cursor: 'pointer' }}>
                <rect x={x+50} y={y+20} width={50} height={20}
                      fill={powerState ? '#E6E6E6' : '#BBBBBB'}
                      stroke={powerState ? '#666666' : '#666666'}
                />
                <text x={x + 50 + 50/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                    {powerState ? "enabled" : "disabled"}
                </text>
            </g>
        </g>


    );
}

export function PoweredSvg({name, x, y, width, height, onPowerClick, powerState, fontSize = 12, fillColor = "#e6e6e6", textColor = "#333333", strokeColor = "#666666"  }: ActuatorSvgProps) {
    return (
        <g>
            <text x={x + 60/2} y={y + 20/2}  fill={textColor} fontSize={fontSize}
                  fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                {name}
            </text>
            <g onClick={onPowerClick} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y+20} width={60} height={20}
                      fill={powerState ? '#E6E6E6' : '#BBBBBB'}
                      stroke={powerState ? '#666666' : '#666666'}
                />
                <text x={x + 60/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                    {powerState ? "enabled" : "disabled"}
                </text>
            </g>
        </g>


    );
}
export function GpioSvg({name, x, y, width, height, onArmedClick, armedState, fontSize = 12, fillColor = "#e6e6e6", textColor = "#333333", strokeColor = "#666666"  }: ActuatorSvgProps) {
    return (
        <g>
            <text x={x + 60/2} y={y + 20/2}  fill={textColor} fontSize={fontSize}
                  fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                {name}
            </text>
            <g onClick={onArmedClick} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y+20} width={60} height={20}
                      fill={armedState ? '#D5E8D4' : '#F8CECC'}
                      stroke={armedState ? '#82B366' : '#B85450'}
                />
                <text x={x + 60/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                    {armedState ? "armed" : "disarmed"}
                </text>
            </g>
        </g>


    );
}
export function PoweredGpioSvg({name, x, y, width, height, onArmedClick, onPowerClick, armedState, powerState, fontSize = 12, fillColor = "#e6e6e6", textColor = "#333333", strokeColor = "#666666"  }: ActuatorSvgProps) {
    return (
        <g>
            <text x={x + 120/2} y={y + 20/2}  fill={textColor} fontSize={fontSize}
                  fontFamily="Arial" textAnchor="middle" dominantBaseline="middle">
                {name}
            </text>
            <g onClick={onArmedClick} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y+20} width={60} height={20}
                      fill={armedState ? '#D5E8D4' : '#F8CECC'}
                      stroke={armedState ? '#82B366' : '#B85450'}
                />
                <text x={x + 60/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Arial" textAnchor="middle" dominantBaseline="middle">
                    {armedState ? "armed" : "disarmed"}
                </text>
            </g>
            <g onClick={onPowerClick} style={{ cursor: 'pointer' }}>
                <rect x={x+60} y={y+20} width={60} height={20}
                      fill={powerState ? '#E6E6E6' : '#BBBBBB'}
                      stroke={powerState ? '#666666' : '#666666'}
                />
                <text x={x + 60 + 60/2} y={y + 20 + 20/2} fill={textColor} fontSize={fontSize}
                      fontFamily="Helvetica" textAnchor="middle" dominantBaseline="middle">
                    {powerState ? "enabled" : "disabled"}
                </text>
            </g>
        </g>


    );
}
/*
<svg xmlns="http://www.w3.org/2000/svg">
  <g>
    <rect x={xBox} y={yBox} width={boxWidth} height={boxHeight} fill={fillColor} stroke={strokeColor}></rect>
    <text fill={textColor} fontSize={12} fontFamily={"Helvetica"}>{name}</text>
  </g>
</svg>
17px
overflow-x hidden
overflow-y hidden
transform-origin 0px 0px
width 39px
x 290.5px
y 208.5px
x={x} y= width="60" height="30"
x={x} y={y} width={width} height={height}

type ActuatorComponentProps = {
  label: string;
  color?: string;
};


*/

/*
          <g transform="translate(-0.5 -0.5)">
            <foreignObject overflow="visible" text-align="left" pointer-events="none"  x={x} y={y} width="100%"
                             height="100%" requiredFeatures="http://www.w3.org/TR/SVG11/feature#Extensibility">
                <div xmlns="http://www.w3.org/1999/xhtml"
                     display="flex"
                     align-items="center"
                     justify-content="center"
                     width ="1px"
                     height="1px"
                     padding-top={paddingTop}
                     margin-left={marginLeft}>
                  <div box-sizing="border-box" font-size="0" text-align="center" color="#333333">
                    <div
                        display="inline-block"
                        font-size={12} color={textColor}
                        line-height="1.2"
                        pointer-events="all"
                        white-space="nowrap">
                      <text className="actuator-name">{name}</text>
                    </div>
                  </div>
                </div>
            </foreignObject>
            */