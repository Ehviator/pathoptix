import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * PathOptix OFP Relay Plugin
 * 
 * Adds a lightweight HTTP relay endpoint to the Vite dev server that accepts
 * PDF flight plan uploads from an iOS Shortcut over WiFi. The PDF is held
 * temporarily in the server's temp directory and served to the PathOptix
 * client on demand. No files are saved to the iPad — the entire pipeline
 * operates in-memory on the client side after the transfer.
 * 
 * Endpoints:
 *   POST /api/upload-ofp      — Receive a raw PDF body from iOS Shortcut
 *   GET  /api/upload-ofp       — Download and consume the pending PDF
 *   GET  /api/upload-ofp/status — Check if a PDF is waiting
 */
function ofpRelayPlugin() {
  const pendingFilePath = path.join(os.tmpdir(), 'pathoptix_pending_ofp.pdf');
  let pendingTimestamp = null;

  // Clean up any stale file from a previous session
  try { fs.unlinkSync(pendingFilePath); } catch (e) { /* no-op */ }

  return {
    name: 'pathoptix-ofp-relay',
    configureServer(server) {

      // Global CORS handler for /api/ routes
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }
        }
        next();
      });

      // Unified /api/upload-ofp router
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];

        // ─── POST /api/upload-ofp ────────────────────────────────
        if (url === '/api/upload-ofp' && req.method === 'POST') {
          const chunks = [];
          let totalSize = 0;
          const MAX_SIZE = 50 * 1024 * 1024; // 50 MB ceiling

          req.on('data', (chunk) => {
            totalSize += chunk.length;
            if (totalSize > MAX_SIZE) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'File too large (50 MB max)' }));
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });

          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks);

              if (body.length < 64) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload too small to be a valid PDF' }));
                return;
              }

              fs.writeFileSync(pendingFilePath, body);
              pendingTimestamp = Date.now();

              const sizeKB = (body.length / 1024).toFixed(1);
              console.log(`\n  [OFP Relay] ✅  Received flight plan (${sizeKB} KB) at ${new Date().toLocaleTimeString()}`);
              console.log(`  [OFP Relay]     Waiting for PathOptix client to pick up...\n`);

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                size: body.length,
                timestamp: pendingTimestamp
              }));
            } catch (err) {
              console.error('[OFP Relay] Error saving uploaded file:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Server error saving file' }));
            }
          });

          req.on('error', (err) => {
            console.error('[OFP Relay] Upload stream error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Upload stream failed' }));
          });
          return;
        }

        // ─── GET /api/upload-ofp ─────────────────────────────────
        if (url === '/api/upload-ofp' && req.method === 'GET') {
          if (fs.existsSync(pendingFilePath)) {
            try {
              const data = fs.readFileSync(pendingFilePath);
              fs.unlinkSync(pendingFilePath);
              pendingTimestamp = null;

              const sizeKB = (data.length / 1024).toFixed(1);
              console.log(`  [OFP Relay] 📤  Delivered flight plan to client (${sizeKB} KB)\n`);

              res.writeHead(200, { 'Content-Type': 'application/pdf' });
              res.end(data);
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Error reading pending file' }));
            }
          } else {
            res.writeHead(204);
            res.end();
          }
          return;
        }

        // ─── GET /api/upload-ofp/status ──────────────────────────
        if (url === '/api/upload-ofp/status' && req.method === 'GET') {
          const pending = fs.existsSync(pendingFilePath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            pending,
            timestamp: pending ? pendingTimestamp : null
          }));
          return;
        }

        next();
      });

      // Log the relay endpoint on startup
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer.address();
        const host = addr?.address === '0.0.0.0' ? getLocalIP() : addr?.address;
        const port = addr?.port;
        console.log(`\n  ✈️  OFP Relay endpoint active:`);
        console.log(`     POST http://${host}:${port}/api/upload-ofp\n`);
      });
    }
  };
}

/** Resolve the machine's local network IP for the startup log */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

export default defineConfig({
  plugins: [react(), ofpRelayPlugin()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/awc': {
        target: 'https://aviationweather.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/awc/, '')
      }
    }
  },
  test: {
    globals: true,
    environment: 'node'
  }
});
