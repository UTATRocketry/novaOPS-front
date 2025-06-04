// parser.tsx
import {useState} from "react";
import React from 'react';
import {
    Text,
    Button, 
    Input, 
    Heading,
} from "@chakra-ui/react";
import { UIComponent } from './components/types';

interface ParserProps {
    onClose?: (diagramFilename: string) => void;
    diagramAvailable?: boolean;
}

const Parser: React.FC = ({onClose, diagramAvailable}: ParserProps) => {
    const [svgFile, setSvgFile] = useState<File | null>(null);
    const [xmlFile, setXmlFile] = useState<File | null>(null);

    const handleUpload = async () => {
        if (!svgFile || !xmlFile) {
            alert('Please select both an SVG and XML file.');
            return;
        }
        let diagramFilename = 'ui-diagram';
        // check if the original filenames are the same other than the extension
        if (svgFile.name.replace(/\.svg$/, '') === xmlFile.name.replace(/\.xml$/, '')) {
            // set diagramFilename to the original filename without extension
            diagramFilename = svgFile.name.replace(/\.svg$/, '');

        }
        // Ensure the diagramFilename is safe for use in filenames
        // const safeDiagramFilename = diagramFilename.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()

        await parseAndGenerateFiles(svgFile, xmlFile, diagramFilename);
        //alert(`Diagram files set to ${diagramFilename || 'ui-diagram'}.svg and ${diagramFilename || 'ui-diagram'}.json`);
        //alert('Diagram files downloaded. Move them to /public/assets/ to view the new diagram.');
        if (onClose) {
            await onClose(diagramFilename);
        }
    };


    return (
        <div style={{position: 'relative', width: '100%', textAlign: 'center'}}>
            {!diagramAvailable && (
                <Text color="red.500" mb={4}>
                    No diagram loaded. Please upload a draw.io P&ID SVG and draw.io XML.
                </Text>
            )}
            { diagramAvailable && (
                <Text mb={2}>Upload a new draw.io P&ID SVG and draw.io XML to start.</Text>
            )}
            <Input
                type="file"
                accept=".svg"
                onChange={e => setSvgFile(e.target.files?.[0] || null)}
                mb={4}
                placeholder="Upload SVG File"
            />
            <Input
                type="file"
                accept=".xml"
                onChange={e => setXmlFile(e.target.files?.[0] || null)}
                mb={4}
                placeholder="Upload XML File"
            />
            <Button
                colorScheme="blue"
                onClick={handleUpload}
                isDisabled={!svgFile || !xmlFile}
            >
                Upload & Load Diagram
            </Button>
            <Text mt={4} fontSize='sm' color='gray.500'>
                After uploading, the new diagram files will be downloaded. Move them to <code>/public/assets/</code> to view the new diagram.
            </Text>
            
        </div>
    );

};
export default Parser;

function stripHtml(html: string): string {
  if (typeof window !== 'undefined' && 'DOMParser' in window) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  } else {
    // fallback if DOMParser not available (e.g., SSR)
    return html.replace(/<\/?[^>]+(>|$)/g, '');
  }
}


export async function parseAndGenerateFiles(svgFile: File, xmlFile: File, diagramFilename: string ): Promise<void> {
    const svgText = await svgFile.text();
    const xmlText = await xmlFile.text();

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    const uiComponents: UIComponent[] = [];
    const cellMap = new Map<string, boolean>();

    xmlDoc.querySelectorAll('object[UIType]').forEach(obj => {
        const id = obj.getAttribute('id')!;
        // let rawLabel = obj.getAttribute('label') || '';
        const label = stripHtml(obj.getAttribute('label')!);
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
    const backgroundSVG = serializer.serializeToString(cleanedSvg);
    const overlayJSON = JSON.stringify(uiComponents, null, 2);
    
    const svgFilename = `${diagramFilename}-background.svg`;
    const jsonFilename = `${diagramFilename}-overlay.json`;


    // Save to server instead of downloading
    const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            filename: diagramFilename,
            svgContent: backgroundSVG,
            jsonContent: overlayJSON,
        }),
    });

    if (!res.ok) {
        throw new Error('Failed to upload files to server');
    }

    //downloadFile(svgFilename, backgroundSVG, 'image/svg+xml');
    //downloadFile(jsonFilename, overlayJSON, 'application/json');
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

/*
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
*/


