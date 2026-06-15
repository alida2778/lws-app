import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_DIR = path.resolve(__dirname, '../New folder/1 - งานคดี');
const OUTPUT_FILE = path.resolve(__dirname, '../src/services/initialMatters.ts');

function getFilesMetadata(caseDir, subFolderName, category) {
  const subDirPath = path.join(caseDir, subFolderName);
  if (!fs.existsSync(subDirPath)) return [];
  
  try {
    const items = fs.readdirSync(subDirPath);
    const files = [];
    for (const item of items) {
      const fullPath = path.join(subDirPath, item);
      const stats = fs.statSync(fullPath);
      if (stats.isFile()) {
        files.push({
          name: item,
          path: `${subFolderName}/${item}`,
          category,
          size: stats.size,
          lastModified: stats.mtime.toISOString()
        });
      }
    }
    return files;
  } catch (error) {
    console.error(`Error reading directory ${subFolderName} in ${caseDir}:`, error);
    return [];
  }
}

function scanCasesRecursively(dir) {
  const matters = [];
  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return matters;
  }

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      const metaPath = path.join(fullPath, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        try {
          const rawMeta = fs.readFileSync(metaPath, 'utf8');
          const meta = JSON.parse(rawMeta);
          
          // Scan subfolders to rebuild actual file lists (Self-Healing)
          const adminFiles = getFilesMetadata(fullPath, '01_Admin_การเงิน', 'AdminFinance');
          const courtFiles = getFilesMetadata(fullPath, '02_สำนวนคดี_ศาล', 'CourtDrafts');
          const rawFiles = getFilesMetadata(fullPath, '03_Holding_Pool_หลักฐานดิบ', 'RawEvidence');
          
          const actualFiles = [...adminFiles, ...courtFiles, ...rawFiles];
          
          // Merge / Update files in metadata
          meta.files = actualFiles;
          
          // Write updated metadata back to case folder (Self-Healing)
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
          
          matters.push(meta);
          console.log(`Scanned case: ${meta.matterId} - ${meta.clientName}`);
        } catch (e) {
          console.error(`Error parsing metadata.json at ${metaPath}:`, e);
        }
      } else {
        // Recurse into subfolders (e.g. 2567---, 2568, 2569)
        const nestedMatters = scanCasesRecursively(fullPath);
        matters.push(...nestedMatters);
      }
    }
  }
  return matters;
}

export function runScanner() {
  console.log(`Starting scan of workspace directory: ${WORKSPACE_DIR}`);
  const matters = scanCasesRecursively(WORKSPACE_DIR);
  
  // Sort matters by ID or default ordering
  matters.sort((a, b) => a.matterId.localeCompare(b.matterId));

  // Generate initialMatters.ts content
  const content = `import type { Matter } from '../types';

export const INITIAL_MATTERS: Matter[] = ${JSON.stringify(matters, null, 2)};
`;

  fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
  console.log(`Successfully compiled ${matters.length} matters into ${OUTPUT_FILE}`);
}

// If run directly
if (process.argv[1] === __filename || process.argv[1]?.endsWith('scan-cases.js')) {
  runScanner();
}
