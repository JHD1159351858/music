import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

// 双条件判定 dev：任一表明生产即视为生产，避免单点依赖漏注入时退化成 dev 模式
const dev =
  process.env.CODER_PROJECT_ENV !== 'PROD' &&
  process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// dev 内存探针：dev 固定开启
// native = rss - heapTotal - external 即 Turbopack 原生内存，它不受 --max-old-space-size 约束
// 输出走 stdout，由 dev.sh 收进 app.log 并镜像 [mem] 行到 dev.log；unref() 不阻止进程退出。
if (dev) {
  const toMB = (bytes: number) => Math.round(bytes / 1024 / 1024);
  setInterval(() => {
    const m = process.memoryUsage();
    console.log(
      `[mem] rss=${toMB(m.rss)}MB heapTotal=${toMB(m.heapTotal)}MB heapUsed=${toMB(
        m.heapUsed,
      )}MB external=${toMB(m.external)}MB native=${toMB(m.rss - m.heapTotal - m.external)}MB`,
    );
  }, 120_000).unref();
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
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
