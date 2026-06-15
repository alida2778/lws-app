import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
// @ts-ignore
import { runScanner } from './scripts/scan-cases.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function findMetadataPath(dir: string, matterId: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const metaPath = path.join(fullPath, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        try {
          const raw = fs.readFileSync(metaPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed.matterId === matterId) {
            return metaPath;
          }
        } catch (e) {
          // ignore parsing errors
        }
      } else {
        const result: string | null = findMetadataPath(fullPath, matterId);
        if (result) return result;
      }
    }
  }
  return null;
}

// https://vite.dev/config/
export default defineConfig({
  base: '/lws-app/',
  plugins: [
    react(),
    {
      name: 'lws-local-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/scan' && req.method === 'GET') {
            try {
              runScanner();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }
          
          if (req.url === '/api/save-metadata' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const matter = JSON.parse(body);
                const dir = path.resolve(__dirname, './New folder/1 - งานคดี');
                const metaPath = findMetadataPath(dir, matter.matterId);
                
                if (!metaPath) {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `metadata.json for case ${matter.matterId} not found` }));
                  return;
                }
                
                // Write updated metadata back to local disk
                fs.writeFileSync(metaPath, JSON.stringify(matter, null, 2), 'utf8');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
          
          if (req.url === '/api/rename-file' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const { matterId, oldPath, newPath } = JSON.parse(body);
                const dir = path.resolve(__dirname, './New folder/1 - งานคดี');
                const metaPath = findMetadataPath(dir, matterId);
                if (!metaPath) {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `metadata.json for case ${matterId} not found` }));
                  return;
                }
                const caseDir = path.dirname(metaPath);
                const absoluteOldPath = path.join(caseDir, oldPath);
                const absoluteNewPath = path.join(caseDir, newPath);
                
                if (fs.existsSync(absoluteOldPath)) {
                  fs.renameSync(absoluteOldPath, absoluteNewPath);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true }));
                } else {
                  res.writeHead(404, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `File not found at: ${oldPath}` }));
                }
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
          next();
        });
      }
    }
  ],
})
