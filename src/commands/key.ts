import { defineCommand } from 'citty';
import path from 'node:path';
import { getConfig } from '../lib/config.js';
import { setupLog, success, out, fail, guard } from '../lib/log.js';
import { validateKey, readCredentials, writeCredentials } from '../lib/auth.js';

export default defineCommand({
  meta: { name: 'key', description: '设置 API 密钥（写入 ~/.icen/credentials.json）' },
  args: {
    key: { type: 'positional', description: '安装密钥，格式 ICEN-XXXX-XXXX', required: true },
    json: { type: 'boolean', description: '以 JSON 输出结果', default: false },
    quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
  },
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig();
    const key = args.key.trim();
    if (!validateKey(key)) {
      fail(`密钥格式不合法：${key}\n正确格式：ICEN-XXXX-XXXX（X 为大写字母或数字）。`);
    }
    const creds = readCredentials(cfg);
    creds.apiKey = key;
    writeCredentials(cfg, creds);
    const file = path.join(cfg.icenHome, 'credentials.json');
    if (args.json) {
      out({ saved: true, file });
    } else {
      success(`✓ API key 已保存到 ${file}\n运行 icen whoami 验证。`);
    }
  }),
});
