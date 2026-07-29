import { defineCommand } from 'citty';
import { getConfig } from '../lib/config.js';
import { setupLog, info, warn, out, fail, guard } from '../lib/log.js';
import { fetchIndex, resolveSkill, shortId } from '../lib/registry.js';
import { readLock } from '../lib/lock.js';
import { detectTargetDirs } from '../lib/platforms.js';
import { performInstall, type AddFlags } from './add.js';

export default defineCommand({
  meta: { name: 'update', description: '检查并更新指定或全部已安装 skill' },
  args: {
    id: { type: 'positional', description: 'skill id（缺省更新全部）', required: false },
    yes: { type: 'boolean', alias: 'y', description: '跳过确认提示', default: false },
    sync: { type: 'boolean', description: '同步到检测到的平台目录（--no-sync 只装主目录）', default: true },
    json: { type: 'boolean', description: '以 JSON 输出结果', default: false },
    quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
    registry: { type: 'string', description: '临时指定 registry 地址（默认 https://skill.icen.ai）' },
    key: { type: 'string', description: '临时指定 API key（付费 skill 用）' },
  },
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig({ registry: args.registry });
    const lock = readLock(cfg);
    const index = await fetchIndex(cfg, { fresh: true });

    let names: string[];
    if (args.id) {
      const q = args.id.trim();
      const found = Object.keys(lock).find((k) => k === q || k === `icen-${q}` || shortId(k) === q);
      if (!found) {
        if (args.json) out({ error: `未安装: ${args.id}` });
        fail(`「${args.id}」未安装，无法更新。用 icen skill add ${args.id} 安装。`);
      }
      names = [found];
    } else {
      names = Object.keys(lock);
      if (names.length === 0) {
        info('尚未安装任何 skill，无需更新。');
        if (args.json) out({ updated: [], upToDate: [], skipped: [] });
        return;
      }
    }

    const results = { updated: [] as string[], upToDate: [] as string[], skipped: [] as string[] };
    // update 统一用检测到的平台目录（旧 --sync 行为），算一次复用
    const dirs = detectTargetDirs(cfg, { sync: args.sync });
    for (const name of names) {
      const skill = resolveSkill(index, name);
      if (!skill) {
        warn(`索引中已不存在「${name}」，跳过。`);
        results.skipped.push(name);
        continue;
      }
      const oldHash = lock[name];
      if (oldHash === skill.hash) {
        info(`${name} 已是最新版（hash: ${skill.hash}）。`);
        results.upToDate.push(name);
        continue;
      }
      await performInstall(cfg, skill, { ...args, dirs } as AddFlags, oldHash);
      results.updated.push(name);
    }

    if (args.json) out(results);
    else if (results.updated.length > 0) info(`\n已更新 ${results.updated.length} 个：${results.updated.join(', ')}`);
    else info('\n全部已是最新。');
  }),
});
