// components/Background.tsx
import React from 'react';

const Background: React.FC = () => (
    <svg
        id="pid-background"
        viewBox="0 0 1329 1014"
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
        <image href="/assets/ui-diagram-background.svg" x="0" y="0" width="1329" height="1014" />
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