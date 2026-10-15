import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import summarizeHandler from './api/summarize.js';
import transcriptHandler from './api/transcript.js';

dotenv.config();

function devApiPlugin() {
  return {
    name: 'dev-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');

        if (url.pathname === '/api/summarize') {
          let rawBody = '';
          req.on('data', (chunk) => { rawBody += chunk; });
          req.on('end', async () => {
            try {
              req.body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              req.body = {};
            }
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
            res.json = (data) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            };
            try {
              await summarizeHandler(req, res);
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Server error' }));
            }
          });
          return;
        }

        if (url.pathname === '/api/transcript') {
          req.query = Object.fromEntries(url.searchParams.entries());
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          };
          try {
            await transcriptHandler(req, res);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Server error' }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApiPlugin()],
});