import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { app } from './apiApp.ts';

export interface EmbeddedServerOptions {
  distDir?: string;
  port?: number;
}

export interface EmbeddedServerInstance {
  port: number;
  close: () => Promise<void>;
}

export function startServer(options: EmbeddedServerOptions = {}): Promise<EmbeddedServerInstance> {
  const { distDir, port = 9876 } = options;

  return new Promise((resolve, reject) => {
    // Serve static files from distDir
    if (distDir && fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        const indexPath = path.resolve(distDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('index.html not found');
        }
      });
    }

    const tryListen = (attemptPort: number) => {
      const server = app.listen(attemptPort, '127.0.0.1', () => {
        const addr = server.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : attemptPort;
        console.log(`[EmbeddedServer] Active at http://127.0.0.1:${actualPort}`);
        resolve({
          port: actualPort,
          close: () => new Promise<void>((res) => server.close(() => res())),
        });
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && attemptPort === port) {
          console.warn(`[EmbeddedServer] Port ${port} busy, assigning free port...`);
          tryListen(0);
        } else {
          reject(err);
        }
      });
    };

    tryListen(port);
  });
}

export { app };
export default startServer;
