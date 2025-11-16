// /pages/api/upload.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { writeFile } from 'fs/promises';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { filename, svgContent, jsonContent } = req.body;

    if (!filename || !svgContent || !jsonContent) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const publicDir = path.join(process.cwd(), 'public', 'assets');
    const svgPath = path.join(publicDir, `${filename}-background.svg`);
    const jsonPath = path.join(publicDir, `${filename}-overlay.json`);

    await writeFile(svgPath, svgContent, 'utf8');
    await writeFile(jsonPath, jsonContent, 'utf8');

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Failed to save files' });
  }
}
