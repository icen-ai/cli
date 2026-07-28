import { defineCommand } from 'citty';
import { getConfig } from '../lib/config.js';
import { setupLog, success, out, fail, info, guard } from '../lib/log.js';
import { shortId } from '../lib/registry.js';
import { readLock, removeLockEntry } from '../lib/lock.js';
import { removeSkillDirs } from '../lib/installer.js';

export default defineCommand({
  meta: { name: 'remove', description: '卸载 skill（含各平台目录同步删除）' },
  args: {
    id: { type: 'positional', description: 'skill id（短 id 或 icen- 全名）', required: true },
    sync: { type: 'boolean', description: '同时删除各平台目录中的副本（--no-sync 只删主目录）', default: true },
    yes: { type: 'boolean', alias: 'y', description: '跳过确认（保留兼容，当前不提示）', default: false },
    json: { type: 'boolean', description: '以 JSON 输出结果', default: false },
    quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
  },
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig();
    const lock = readLock(cfg);
    const q = args.id.trim();
    const name = Object.keys(lock).find((k) => k === q || k === `icen-${q}` || shortId(k) === q);
    if (!name) {
      if (args.json) out({ error: `未安装: ${args.id}` });
      fail(`「${args.id}」未安装（lock 文件中无记录）。`);
    }

    const removed = removeSkillDirs(cfg, name, { sync: args.sync });
    removeLockEntry(cfg, name);
    for (const dir of removed) info(`  已删除 ${dir}`);

    if (args.json) {
      out({ name, status: 'removed', dirs: removed });
    } else {
      success(`✓ Removed ${name}`);
    }
  }),
});
