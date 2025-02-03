import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export default function handler(req, res) {
  if (req.method === 'POST') {
    const { sensorDict } = req.body;

    try {
      const yamlData = yaml.dump(sensorDict);
      const filePath = path.join(process.cwd(), 'sensorData.yaml');
      fs.writeFileSync(filePath, yamlData, 'utf8');
      res.status(200).json({ message: 'YAML file created successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to create YAML file', error });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}