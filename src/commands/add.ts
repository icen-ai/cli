import { defineCommand } from 'citty';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, type Config } from '../lib/config.js';
import { setupLog, info, success, warn, out, fail, guard } from '../lib/log.js';
import { resolveKey } from '../lib/auth.js';
import { fetchIndex, resolveSkill, tarballUrl, download, type SkillEntry } from '../lib/registry.js';
import { readLock } from '../lib/lock.js';
import { installSkill, installSkillFromUrl } from '../lib/installer.js';
import { detectTargetDirs } from '../lib/platforms.js';
import { selectTargets } from '../lib/prompt.js';

export const addArgs = {
  id: { type: 'positional', description: 'skill id（如 network）或 tar.gz URL（https://...）', required: true },
  yes: { type: 'boolean', alias: 'y', description: '跳过交互，默认装用户级 ~/.agents/skills', default: false },
  save: { type: 'boolean', alias: 's', description: '同时安装到项目级 ./.agents/skills', default: false },
  all: { type: 'boolean', description: '安装到所有检测到的平台目录', default: false },
  json: { type: 'boolean', description: '以 JSON 输出结果', default: false },
  quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
  registry: { type: 'string', description: '临时指定 registry 地址（默认 https://skill.icen.ai）' },
  key: { type: 'string', description: '临时指定 API key（付费 skill 用）' },
} as const;

export interface AddFlags {
  yes?: boolean;
  save?: boolean;
  all?: boolean;
  json?: boolean;
  quiet?: boolean;
  registry?: string;
  key?: string;
  /** update 旧兼容：sync=false 时只装主目录 */
  sync?: boolean;
  /** 已算好的目标目录（add 交互式选择后传入；缺省时 performInstall 内部 fallback detectTargetDirs） */
  dirs?: string[];
}

/** 付费 skill 取凭证；无凭证则报错退出（add / update 共用） */
export function requireKeyForPaid(cfg: Config, skill: SkillEntry, flagKey?: string): string | undefined {
  if (!skill.paid) return undefined;
  const rk = resolveKey(cfg, flagKey);
  if (!rk) {
    fail(
      `「${skill.name}」是付费 skill，需要安装密钥：\n` +
        `  icen key ICEN-XXXX-XXXX        设置密钥（在 ${cfg.baseUrl}/account 获取）\n` +
        `  或 ICEN_KEY=ICEN-XXXX-XXXX icen skill add ${skill.name}`,
    );
  }
  return rk.key;
}

/** URL 安装：直接下载 tar.gz，解压安装，不做 registry hash 校验（第三方源无索引） */
async function installFromUrl(cfg: Config, url: string, flags: AddFlags): Promise<void> {
  info(`从 ${url} 下载...`);
  const tarball = await download(url);
  const dirs = await selectTargets(cfg, { save: flags.save, yes: flags.yes, all: flags.all });
  const result = await installSkillFromUrl(cfg, tarball, { dirs });
  for (const dir of result.dirs) info(`  -> ${dir}/${result.name}`);
  warn('提示：第三方源安装，跳过内容 hash 校验。');

  if (flags.json) {
    out({ name: result.name, status: 'installed', dirs: result.dirs, verified: false });
  } else {
    success(`✓ Installed ${result.name} from ${url}`);
  }
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

  // dirs 优先用 flags.dirs（add 已交互式选择好），缺省时 fallback 旧逻辑（update 兼容）
  const dirs = flags.dirs || detectTargetDirs(cfg, { sync: flags.sync });
  const result = await installSkill(cfg, skill, tarball, { dirs });
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

    // URL 安装：icen skill add <url> —— 直接下载 tar.gz，不走 registry 索引
    if (/^https?:\/\//i.test(args.id)) {
      await installFromUrl(cfg, args.id, args);
      return;
    }

    const index = await fetchIndex(cfg);
    const skill = resolveSkill(index, args.id);
    if (!skill) {
      if (args.json) out({ error: `skill 不存在: ${args.id}` });
      fail(`索引中不存在 skill「${args.id}」。用 icen skill search <关键词> 查找，或检查 id 拼写。`);
    }

    const lock = readLock(cfg);
    const oldHash = lock[skill.name];

    // 交互式选择安装目标（-y 跳过，默认装用户级 ~/.agents/skills）
    const dirs = await selectTargets(cfg, { save: args.save, yes: args.yes, all: args.all });

    if (oldHash === skill.hash) {
      // hash 相同：仍需检查目标目录是否都有（-s 项目级可能缺失）
      const allPresent = dirs.every((d) => fs.existsSync(path.join(d, skill.name)));
      if (allPresent) {
        if (args.json) {
          out({ name: skill.name, hash: skill.hash, version: skill.version, status: 'up-to-date' });
        } else {
          success(`${skill.name} 已是最新版（hash: ${skill.hash}），无需操作。`);
        }
        return;
      }
      // 有目标目录缺失（如项目级），继续铺过去
      await performInstall(cfg, skill, { ...args, dirs }, oldHash);
      return;
    }

    await performInstall(cfg, skill, { ...args, dirs }, oldHash);
  }),
});
