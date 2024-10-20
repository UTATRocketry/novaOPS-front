import { useState } from "react";

const PIDDiagram = () => {
    const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
  
    const handleComponentClick = (componentName: string) => {
      setSelectedComponent(componentName);
      setDialogOpen(true);
    };
  
    // Common styles
    const valveStyle = "cursor-pointer hover:stroke-blue-500 transition-colors";
    const textStyle = "text-xs fill-current";
    const lineStyle = "stroke-current stroke-6" ;
    const instrumentStyle = "fill-none stroke-current cursor-pointer hover:stroke-blue-500 transition-colors";
  
    // Reusable components
    const Valve = ({ x, y, name, type = "gate" }: { x: number, y: number, name: string, type?: "gate" | "butterfly" }) => (
      <g transform={`translate(${x}, ${y})`} onClick={() => handleComponentClick(name)} className={valveStyle}>
        {type === "gate" ? (
          <path d="M -10 0 H 10 M 0 -10 V 10" strokeWidth="2" />
        ) : (
          <circle r="15" color='red' fill="none" strokeWidth="2" />
        )}
        <text x="-15" y="25" className={textStyle}>{name}</text>
      </g>
    );
  
    const Instrument = ({ x, y, name, label }: { x: number, y: number, name: string, label: string }) => (
      <g transform={`translate(${x}, ${y})`} onClick={() => handleComponentClick(name)} className={instrumentStyle}>
        <circle r="15" />
        <text x="-7" y="5" className={textStyle}>{label}</text>
        <text x="-15" y="35" className={textStyle}>{name}</text>
      </g>
    );
  
    const Tank = ({ x, y, name, color = "blue" }: { x: number, y: number, name: string, color?: string }) => (
      <g onClick={() => handleComponentClick(name)} className="cursor-pointer">
        <rect x={x} y={y} width="60" height="80" className={`fill-${color}-200 stroke-current`} />
        <text x={x + 10} y={y + 45} className={textStyle}>{name}</text>
      </g>
    );
  
    return (
      <div className="w-full h-full p-4">
        <svg viewBox="0 0 1200 600" className="w-full h-full">
          {/* Tanks */}
          <Tank x={20} y={50} name="GPT1" />
          
          <Tank x={20} y={250} name="GPT2" />
          <Tank x={500} y={50} name="FT" color="red" />
          <Tank x={500} y={250} name="OT" color="green" />
  
          {/* Main horizontal lines */}
          <line d="M 80 90 H 1100" className={lineStyle} />
          <line d="M 80 290 H 1100" className={lineStyle} />
  
          {/* Vertical connections */}
          <path d="M 300 90 V 290" className={lineStyle} />
          <path d="M 700 90 V 290" className={lineStyle} />
  
          {/* Valves */}
          <Valve x={150} y={90} name="RFTP" />
          <Valve x={250} y={90} name="BVFTP" type="butterfly" />
          <Valve x={150} y={290} name="ROTP" />
          <Valve x={250} y={290} name="BVOTP" type="butterfly" />
          <Valve x={600} y={90} name="BVFTB-M" type="butterfly" />
          <Valve x={800} y={90} name="MFV" type="butterfly" />
          <Valve x={900} y={190} name="MOV" type="butterfly" />
  
          {/* Instruments */}
          <Instrument x={100} y={150} name="PGN-G" label="PG" />
          <Instrument x={200} y={150} name="PFTP-G" label="PG" />
          <Instrument x={100} y={350} name="POTPH-G" label="PG" />
          <Instrument x={200} y={350} name="POTPL-G" label="PG" />
          <Instrument x={400} y={150} name="PFT" label="PT" />
          <Instrument x={400} y={350} name="POTT" label="PT" />
          <Instrument x={1000} y={90} name="TFM" label="TC" />
          <Instrument x={1060} y={90} name="PFM" label="PT" />
          <Instrument x={800} y={350} name="TOT" label="TC" />
          <Instrument x={860} y={350} name="POTB" label="PT" />
  
          {/* Venturi */}
          <g transform={`translate(900, 90)`} onClick={() => handleComponentClick("VENTURI")} className={valveStyle}>
            <path d="M -20 -10 L 0 0 L -20 10" fill="none" strokeWidth="2" />
            <path d="M 20 -10 L 0 0 L 20 10" fill="none" strokeWidth="2" />
            <text x="-25" y="25" className={textStyle}>VENTURI</text>
          </g>
  
          {/* Relief valves */}
          <g transform="translate(350, 40)" onClick={() => handleComponentClick("RVFT")} className={valveStyle}>
            <path d="M 0 0 L 10 -15 L 20 0" fill="none" strokeWidth="2" />
            <text x="-5" y="15" className={textStyle}>RVFT</text>
          </g>
          <g transform="translate(350, 240)" onClick={() => handleComponentClick("RVOT")} className={valveStyle}>
            <path d="M 0 0 L 10 -15 L 20 0" fill="none" strokeWidth="2" />
            <text x="-5" y="15" className={textStyle}>RVOT</text>
          </g>
  
          {/* Safety valves */}
          <g transform="translate(300, 40)" onClick={() => handleComponentClick("SVFTV")} className={valveStyle}>
            <path d="M -10 -10 L 10 10 M -10 10 L 10 -10" strokeWidth="2" />
            <text x="-15" y="25" className={textStyle}>SVFTV</text>
          </g>
          <g transform="translate(300, 240)" onClick={() => handleComponentClick("SVOTV")} className={valveStyle}>
            <path d="M -10 -10 L 10 10 M -10 10 L 10 -10" strokeWidth="2" />
            <text x="-15" y="25" className={textStyle}>SVOTV</text>
          </g>
  
          {/* MFT Load Cell */}
          <g transform={`translate(500, 20)`} onClick={() => handleComponentClick("MFT")} className={instrumentStyle}>
            <circle r="15" />
            <text x="-7" y="5" className={textStyle}>LC</text>
            <text x="-15" y="-20" className={textStyle}>MFT</text>
          </g>
  
          {/* Injector */}
          <rect x="1100" y="50" width="60" height="100" className="fill-gray-200 stroke-current cursor-pointer"
                onClick={() => handleComponentClick("Injector")} />
          <text x="1105" y="100" className={textStyle}>Injector</text>
  
          {/* Pressure annotations */}
          <text x="85" y="70" className={textStyle}>0.25" @ 2000-2600 psig</text>
          <text x="85" y="270" className={textStyle}>0.25" @ 2000-2600 psig</text>
          <text x="1105" y="40" className={textStyle}>360 psig</text>
          <text x="1105" y="170" className={textStyle}>300 psig</text>
  
          
        </svg>
      </div>
    );
  };
  
  export default PIDDiagram;