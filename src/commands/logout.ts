import { defineCommand } from 'citty';
import { getConfig } from '../lib/config.js';
import { setupLog, success, guard } from '../lib/log.js';
import { writeCredentials } from '../lib/auth.js';

export default defineCommand({
  meta: { name: 'logout', description: '清除本地凭证' },
  args: {
    quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
    registry: { type: 'string', description: '临时指定 registry 地址' },
  },
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig({ registry: args.registry });
    writeCredentials(cfg, {});
    success('✓ 已清除本地凭证');
  }),
});
