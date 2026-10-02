import { defineCommand } from 'citty';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { getConfig } from '../lib/config.js';
import { setupLog, info, success, fail, guard } from '../lib/log.js';
import { writeCredentials } from '../lib/auth.js';

const AUTH_URL = 'https://auth.icen.ai/cli';
const TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟等用户在浏览器授权

/** 用 OS 默认浏览器打开 URL */
function openBrowser(url: string): void {
  const cmds =
    process.platform === 'win32'
      ? ['cmd', '/c', 'start', '""', url]
      : process.platform === 'darwin'
        ? ['open', url]
        : ['xdg-open', url];
  spawn(cmds[0], cmds.slice(1), { detached: true, stdio: 'ignore' }).unref();
}

export default defineCommand({
  meta: { name: 'login', description: '浏览器授权登录（获取 API key）' },
  args: {
    quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
    registry: { type: 'string', description: '临时指定 registry 地址' },
  },
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig({ registry: args.registry });

    // 启动本地回调服务器
    const server = http.createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('无法启动本地服务器'));
      });
    });

    const authUrl = `${AUTH_URL}?port=${port}`;
    info('正在打开浏览器授权...');
    info(`如果浏览器未自动打开，请手动访问：\n  ${authUrl}`);
    openBrowser(authUrl);

    // 等待回调：POST /key（JSON body，优先，key 不进 URL/浏览器历史）或 GET /?key=（旧授权页兼容保留）
    const key = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        server.close();
        reject(new Error('授权超时（5 分钟内未完成）'));
      }, TIMEOUT_MS);

      server.on('request', (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${port}`);

        const finish = (k: string): void => {
          clearTimeout(timer);
          server.close();
          resolve(k);
        };

        // 新版授权页回传：POST /key，key 在 JSON body 里
        if (url.pathname === '/key') {
          // CORS 只放行自家授权页与本地开发页——任意网页都知晓端口时也不允许向本机伪造投递
          const origin = req.headers.origin || '';
          const originOk =
            origin === 'https://auth.icen.ai' ||
            origin === 'https://accounts.icen.ai' ||
            /^http:\/\/localhost:\d+$/.test(origin) ||
            /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
          // https 页面跨源 POST localhost：application/json 会先触发 CORS 预检，必须放行否则 fetch 直接失败
          if (req.method === 'OPTIONS') {
            if (!originOk) { res.writeHead(403); res.end(); return; }
            res.writeHead(204, {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            });
            res.end();
            return;
          }
          if (req.method === 'POST') {
            if (!originOk) { res.writeHead(403); res.end(); return; }
            const chunks: Buffer[] = [];
            let tooBig = false;
            req.on('data', (chunk: Buffer) => {
              chunks.push(chunk);
              if (Buffer.concat(chunks).length > 4096) tooBig = true; // 上限 4KB，key 远小于此
            });
            req.on('end', () => {
              let key = '';
              try {
                if (!tooBig) {
                  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { key?: unknown };
                  if (typeof body.key === 'string' && body.key) key = body.key;
                }
              } catch {
                // body 非法 JSON / 超限 → 按无效请求处理
              }
              if (key) {
                res.writeHead(200, { 'Access-Control-Allow-Origin': origin, 'content-type': 'text/plain; charset=utf-8' });
                res.end('ok');
                finish(key);
              } else {
                res.writeHead(400, { 'Access-Control-Allow-Origin': origin });
                res.end('Bad request');
              }
            });
            return;
          }
        }

        // 旧版授权页兼容保留：GET /?key=ICEN-XXXX-XXXX（key 进 URL 会留浏览器历史，仅为降级回退）
        const k = url.searchParams.get('key');
        if (k) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:monospace;text-align:center;padding:60px"><h2>✓ 授权成功</h2><p>请回到终端查看结果，可关闭此页面。</p></body></html>');
          finish(k);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
    });

    // 保存 key
    writeCredentials(cfg, { apiKey: key });
    success('✓ 登录成功');
    success('  运行 icen whoami 查看账号信息');
  }),
});
