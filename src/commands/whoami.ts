import { defineCommand } from 'citty';
import { getConfig } from '../lib/config.js';
import { setupLog, print, warn, out, guard } from '../lib/log.js';
import { resolveKey } from '../lib/auth.js';

const VALIDATE_URL = 'https://auth.icen.ai/api/oauth/validate';

function maskKey(key: string): string {
  // ICEN-A1B2-C3D4 → ICEN-A1B2-****
  const parts = key.split('-');
  return parts.length === 3 ? `${parts[0]}-${parts[1]}-****` : '****';
}

const SOURCE_LABEL = { flag: '--key 参数', env: 'ICEN_KEY 环境变量', credentials: 'credentials.json' } as const;

export default defineCommand({
  meta: { name: 'whoami', description: '显示当前凭证状态与账号信息' },
  args: {
    json: { type: 'boolean', description: '以 JSON 输出结果', default: false },
    quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
    registry: { type: 'string', description: '临时指定 registry 地址（默认 https://skill.icen.ai）' },
    key: { type: 'string', description: '临时指定 API key' },
  },
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig({ registry: args.registry });
    const rk = resolveKey(cfg, args.key);
    if (!rk) {
      if (args.json) {
        out({ authenticated: false, registry: cfg.baseUrl });
      } else {
        print('未配置凭证。');
        print('  icen key ICEN-XXXX-XXXX   设置安装密钥（在 https://skill.icen.ai/account 获取）');
      }
      return;
    }

    if (!args.json) {
      print(`凭证：${maskKey(rk.key)}（来源：${SOURCE_LABEL[rk.source]}）`);
      print(`Registry：${cfg.baseUrl}`);
    }

    // 在线验证；失败时降级提示，不影响本地凭证使用
    let account: unknown;
    try {
      const res = await fetch(VALIDATE_URL, {
        headers: { authorization: `ApiKey ${rk.key}`, 'user-agent': 'icen-cli/0.1' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      account = await res.json();
    } catch (e) {
      if (args.json) {
        out({ authenticated: true, key: maskKey(rk.key), source: rk.source, registry: cfg.baseUrl, validated: false });
      } else {
        warn(`无法在线验证凭证（${e instanceof Error ? e.message : e}）。`);
        warn('可能是验证服务暂不可用或密钥无效；安装付费 skill 时会以服务端校验为准。');
      }
      return;
    }

    if (args.json) {
      out({ authenticated: true, key: maskKey(rk.key), source: rk.source, registry: cfg.baseUrl, validated: true, account });
    } else {
      const acc = account as Record<string, unknown>;
      print(`账号：${acc.username || '?'}（${acc.email || '?'}）`);
      if (acc.displayName) print(`昵称：${acc.displayName}`);
      print(`ID：${acc.userId || '?'}`);
    }
  }),
});
