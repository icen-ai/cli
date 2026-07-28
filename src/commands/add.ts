import { defineCommand } from 'citty';
import readline from 'node:readline';
import { getConfig, type Config } from '../lib/config.js';
import { setupLog, info, success, warn, out, fail, guard } from '../lib/log.js';
import { resolveKey } from '../lib/auth.js';
import { fetchIndex, resolveSkill, tarballUrl, download, type SkillEntry } from '../lib/registry.js';
import { readLock } from '../lib/lock.js';
import { installSkill } from '../lib/installer.js';

export const addArgs = {
  id: { type: 'positional', description: 'skill id（短 id 如 network，或全名 icen-network）', required: true },
  yes: { type: 'boolean', alias: 'y', description: '跳过确认提示', default: false },
  sync: { type: 'boolean', description: '同步到检测到的平台目录（--no-sync 只装主目录）', default: true },
  json: { type: 'boolean', description: '以 JSON 输出结果', default: false },
  quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
  registry: { type: 'string', description: '临时指定 registry 地址（默认 https://skill.icen.ai）' },
  key: { type: 'string', description: '临时指定 API key（付费 skill 用）' },
} as const;

export interface AddFlags {
  yes?: boolean;
  sync?: boolean;
  json?: boolean;
  quiet?: boolean;
  registry?: string;
  key?: string;
}

function confirm(question: string): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolvePromise(/^[yY]$/.test(answer.trim()));
    });
  });
}

/** 付费 skill 取凭证；无凭证则报错退出（add / update 共用） */
export function requireKeyForPaid(cfg: Config, skill: SkillEntry, flagKey?: string): string | undefined {
  if (!skill.paid) return undefined;
  const rk = resolveKey(cfg, flagKey);
  if (!rk) {
    fail(
      `「${skill.name}」是付费 skill，需要安装密钥：\n` +
        `  icen key ICEN-XXXX-XXXX        设置密钥（在 ${cfg.baseUrl}/account 获取）\n` +
        `  或 ICEN_KEY=ICEN-XXXX-XXXX icen add ${skill.name}`,
    );
  }
  return rk.key;
}

/** 下载 + 校验 + 安装 + lock（add / update 共用），输出安装结果 */
export async function performInstall(
  cfg: Config,
  skill: SkillEntry,
  flags: AddFlags,
  oldHash?: string,
): Promise<void> {
  const key = requireKeyForPaid(cfg, skill, flags.key);
  const url = tarballUrl(cfg, skill, key);
  info(oldHash ? `更新 ${skill.name}（${oldHash} -> ${skill.hash}）...` : `安装 ${skill.name}（hash: ${skill.hash}）...`);

  let tarball: Buffer;
  try {
    tarball = await download(url);
  } catch (e) {
    if (skill.paid) {
      fail(`下载失败：${e instanceof Error ? e.message : e}\n付费 skill 请确认密钥有效且已开通权限（${cfg.baseUrl}/account）。`);
    }
    throw e;
  }

  const result = await installSkill(cfg, skill, tarball, { sync: flags.sync });
  for (const dir of result.dirs) info(`  -> ${dir}/${skill.name}`);
  if (result.verify === 'skipped') warn('提示：未检测到官方申明，跳过内容 hash 校验。');

  const status = oldHash ? 'updated' : 'installed';
  if (flags.json) {
    out({ name: skill.name, hash: skill.hash, version: skill.version, status, dirs: result.dirs, verified: result.verify === 'ok' });
  } else {
    success(`✓ ${oldHash ? 'Updated' : 'Installed'} ${skill.name}@${skill.version} (hash: ${skill.hash})`);
  }
}

export default defineCommand({
  meta: { name: 'add', description: '安装或更新一个 skill（幂等，hash 相同自动跳过）' },
  args: addArgs,
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig({ registry: args.registry });
    const index = await fetchIndex(cfg);
    const skill = resolveSkill(index, args.id);
    if (!skill) {
      if (args.json) out({ error: `skill 不存在: ${args.id}` });
      fail(`索引中不存在 skill「${args.id}」。用 icen search <关键词> 查找，或检查 id 拼写。`);
    }

    const lock = readLock(cfg);
    const oldHash = lock[skill.name];
    if (oldHash === skill.hash) {
      if (args.json) {
        out({ name: skill.name, hash: skill.hash, version: skill.version, status: 'up-to-date' });
      } else {
        success(`${skill.name} 已是最新版（hash: ${skill.hash}），无需操作。`);
      }
      return;
    }

    if (oldHash && !args.yes && process.stdout.isTTY && !args.json) {
      const ok = await confirm(`更新 ${skill.name}（${oldHash} -> ${skill.hash}）？[y/N] `);
      if (!ok) {
        info('已取消。');
        return;
      }
    }

    await performInstall(cfg, skill, args, oldHash);
  }),
});
