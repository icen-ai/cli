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

    // 等待回调：GET /?key=ICEN-XXXX-XXXX
    const key = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        server.close();
        reject(new Error('授权超时（5 分钟内未完成）'));
      }, TIMEOUT_MS);

      server.on('request', (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${port}`);
        const k = url.searchParams.get('key');
        if (k) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:monospace;text-align:center;padding:60px"><h2>✓ 授权成功</h2><p>请回到终端查看结果，可关闭此页面。</p></body></html>');
          clearTimeout(timer);
          server.close();
          resolve(k);
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
