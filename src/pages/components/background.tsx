// components/Background.tsx
import React from 'react';

interface BackgroundProps {
  diagramFilename: string;
  width: number;
  height: number;
}
const Background: React.FC = ({diagramFilename, width, height}: BackgroundProps) => (
    <svg
        id="pid-background"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 0,
        }}
    >
        <image href={`/assets/${diagramFilename}-background.svg`} x="0" y="0" width={width} height={height} />
    </svg>
);
export default Background;
/*
const Background: React.FC = () => (
  <object
    id="pid-background"
    type="image/svg+xml"
    data="/assets/ui-diagram-background.svg"
    style={{
      width: '1329',
      height: '1014',
      position: 'absolute',
      top: 0,
      left: 0,
      zIndex: 0,
    }}
  />
);

export default Background;
*/