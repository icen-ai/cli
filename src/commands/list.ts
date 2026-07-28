import { defineCommand } from 'citty';
import { getConfig } from '../lib/config.js';
import { setupLog, print, out, guard } from '../lib/log.js';
import { readLock, lockPath } from '../lib/lock.js';

export default defineCommand({
  meta: { name: 'list', description: '列出已安装的 skill（读 lock 文件）' },
  args: {
    json: { type: 'boolean', description: '以 JSON 输出结果', default: false },
    quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
  },
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig();
    const lock = readLock(cfg);
    const entries = Object.entries(lock).map(([name, hash]) => ({ name, hash }));
    if (args.json) {
      out({ lockFile: lockPath(cfg), skills: entries });
      return;
    }
    if (entries.length === 0) {
      print('尚未安装任何 skill。用 icen add <id> 安装。');
      return;
    }
    print(`已安装 ${entries.length} 个 skill（${lockPath(cfg)}）：`);
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      print(`  ${e.name.padEnd(24)}${e.hash}`);
    }
  }),
});
