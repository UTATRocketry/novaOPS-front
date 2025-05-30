async function parseDrawio(svgFile, xmlFile) {
    const svgText = await svgFile.text();
    const xmlText = await xmlFile.text();
  
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  
    const uiComponents = [];
    const cellMap = new Map();
    xmlDoc.querySelectorAll('object[UIType]').forEach(obj => {
      const id = obj.getAttribute('id');
      const label = obj.getAttribute('label');
      const UIType = obj.getAttribute('UIType');
      const geo = obj.querySelector('mxGeometry');
      if (!geo) return;
  
      const x = parseFloat(geo.getAttribute('x') || 0);
      const y = parseFloat(geo.getAttribute('y') || 0);
      const w = parseFloat(geo.getAttribute('width') || 0);
      const h = parseFloat(geo.getAttribute('height') || 0);
      cellMap.set(id, true);
      uiComponents.push({ id, label, UIType, x, y, width: w, height: h });
    });
  
    // Remove UI elements from SVG
    const cleanedSvg = svgDoc.cloneNode(true);
    cleanedSvg.querySelectorAll('[data-cell-id]').forEach(el => {
      const id = el.getAttribute('data-cell-id');
      if (cellMap.has(id)) el.remove();
    });
  
    // Output JSON and cleaned SVG
    const serializer = new XMLSerializer();
    const backgroundSvg = serializer.serializeToString(cleanedSvg);
    const json = JSON.stringify(uiComponents, null, 2);
  
    downloadFile('ui-diagram-background.svg', backgroundSvg, 'image/svg+xml');
    downloadFile('ui-diagram.json', json, 'application/json');
  }
  
  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }