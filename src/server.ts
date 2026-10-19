import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.CODER_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || process.env.DEPLOY_RUN_PORT || '5000', 10);
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const start = Date.now();
    const requestId = Math.random().toString(36).slice(2, 10);
    const pathname = parse(req.url || '/', false).pathname || '/';
    try {
      const parsedUrl = parse(req.url!, true);
      res.on('finish', () => {
        if (LOG_LEVEL === 'silent') return;
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId,
            method: req.method,
            pathname,
            status: res.statusCode,
            durationMs: Date.now() - start,
          }),
        );
      });
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          requestId,
          method: req.method,
          pathname,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        }),
      );
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.CODER_PROJECT_ENV
      }`,
    );
  });
});
