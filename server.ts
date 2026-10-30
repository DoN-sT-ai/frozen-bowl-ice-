import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './server/apiApp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the actual dist directory containing index.html
// When running inside a packaged Electron app, DIST_DIR is set by main.cjs
let distDir = process.env.DIST_DIR || path.resolve(__dirname, 'dist');
if (!fs.existsSync(path.resolve(distDir, 'index.html')) && fs.existsSync(path.resolve(__dirname, 'index.html'))) {
  distDir = __dirname;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9876;
const HOST = process.env.HOST || '127.0.0.1';

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  return new Promise<number>((resolve, reject) => {
    const tryListen = (attemptPort: number) => {
      const server = app.listen(attemptPort, HOST, () => {
        console.log(`Server listening at http://${HOST}:${attemptPort} (Protected: localhost only)`);
        resolve(attemptPort);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`⚠️ Port ${attemptPort} is already in use by another application. Trying port ${attemptPort + 1}...`);
          tryListen(attemptPort + 1);
        } else {
          reject(err);
        }
      });
    };

    tryListen(PORT);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});

export default app;
export { app };
