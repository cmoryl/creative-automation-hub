import fs from 'fs';
import path from 'path';

export interface TemplateManifest {
  template_name: string;
  engine: string;
  document_format: string;
  source_template: string;
  editable_objects: Record<string, { type: string; required: boolean }>;
}

export interface TemplateRecord {
  id: string;
  name: string;
  engine: string;
  manifestPath: string;
  templatePath: string;
  templateExists: boolean;
  manifest: TemplateManifest | null;
  healthScore: number;
  healthDetails: string[];
  requiredObjects: string[];
}

export function scanTemplates(enginesRoot: string): TemplateRecord[] {
  const records: TemplateRecord[] = [];
  if (!fs.existsSync(enginesRoot)) return records;

  for (const engine of fs.readdirSync(enginesRoot)) {
    const refsDir = path.join(enginesRoot, engine, 'references');
    const templatesDir = path.join(enginesRoot, engine, 'templates');
    if (!fs.existsSync(refsDir)) continue;

    for (const file of fs.readdirSync(refsDir)) {
      if (!file.endsWith('.manifest.json')) continue;

      const manifestPath = path.join(refsDir, file);
      let manifest: TemplateManifest | null = null;
      const healthDetails: string[] = [];
      let healthScore = 0;

      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as TemplateManifest;
        healthDetails.push('Manifest readable');
        healthScore += 30;
      } catch {
        healthDetails.push('Manifest unreadable');
      }

      const templateFileName = file.replace('.manifest.json', '.ai');
      const templatePath = path.join(templatesDir, templateFileName);
      const templateExists = fs.existsSync(templatePath);

      if (templateExists) {
        healthDetails.push('Template file present');
        healthScore += 40;
      } else {
        healthDetails.push('Template file missing');
      }

      const requiredObjects = manifest
        ? Object.entries(manifest.editable_objects)
            .filter(([, v]) => v.required)
            .map(([k]) => k)
        : [];

      if (requiredObjects.length > 0) {
        healthDetails.push(`${requiredObjects.length} required objects defined`);
        healthScore += 30;
      }

      records.push({
        id: file.replace('.manifest.json', ''),
        name: manifest?.template_name ?? file.replace('.manifest.json', ''),
        engine,
        manifestPath,
        templatePath,
        templateExists,
        manifest,
        healthScore,
        healthDetails,
        requiredObjects
      });
    }
  }
  return records;
}
