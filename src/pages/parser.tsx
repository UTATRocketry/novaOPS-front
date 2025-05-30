// parser.tsx
import {useState} from "react";
import { UIComponent } from './components/types';

const Parser: React.FC = () => {
    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [xmlFile, setXmlFile] = useState<File | null>(null);

    const handleUpload = async () => {
        if (!svgFile || !xmlFile) {
            alert('Please select both an SVG and XML file.');
            return;
        }

        await parseAndGenerateFiles(svgFile, xmlFile);

        alert('Diagram files downloaded. Move them to /public/assets/ to view the new diagram.');
    };


    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">No diagram loaded</h2>
            <p className="text-gray-600">Upload a new P&amp;ID SVG and draw.io XML to start.</p>

            <label className="block">
                <span className="text-gray-700">Upload SVG File</span>
                <input
                    type="file"
                    accept=".svg"
                    onChange={e => setSvgFile(e.target.files?.[0] || null)}
                    className="block w-full mt-1"
                />
            </label>

            <label className="block">
                <span className="text-gray-700">Upload XML File</span>
                <input
                    type="file"
                    accept=".xml"
                    onChange={e => setXmlFile(e.target.files?.[0] || null)}
                    className="block w-full mt-1"
                />
            </label>

            <button
                onClick={handleUpload}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
                Upload & Load Diagram
            </button>
        </div>
    );

};
export default Parser;

export async function parseAndGenerateFiles(svgFile: File, xmlFile: File): Promise<void> {
    const svgText = await svgFile.text();
    const xmlText = await xmlFile.text();

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    const uiComponents: UIComponent[] = [];
    const cellMap = new Map<string, boolean>();

    xmlDoc.querySelectorAll('object[UIType]').forEach(obj => {
        const id = obj.getAttribute('id')!;
        const label = obj.getAttribute('label')!;
        const UIType = obj.getAttribute('UIType')!;
        const geo = obj.querySelector('mxGeometry');
        if (!geo) return;

        const x = parseFloat(geo.getAttribute('x') || '0');
        const y = parseFloat(geo.getAttribute('y') || '0');
        const w = parseFloat(geo.getAttribute('width') || '0');
        const h = parseFloat(geo.getAttribute('height') || '0');

        cellMap.set(id, true);
        uiComponents.push({ id, label, UIType, x, y, width: w, height: h });
    });

    // Strip interactive elements
    const cleanedSvg = svgDoc.cloneNode(true) as Document;
    cleanedSvg.querySelectorAll('[data-cell-id]').forEach(el => {
        const id = el.getAttribute('data-cell-id');
        if (id && cellMap.has(id)) el.remove();
    });

    const serializer = new XMLSerializer();
    const backgroundSvg = serializer.serializeToString(cleanedSvg);
    const json = JSON.stringify(uiComponents, null, 2);

    downloadFile('ui-diagram-background.svg', backgroundSvg, 'image/svg+xml');
    downloadFile('ui-diagram.json', json, 'application/json');
}

function downloadFile(name: string, content: BlobPart, type: string) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
