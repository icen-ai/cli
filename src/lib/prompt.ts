import readline from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Config } from './config.js';
import { PLATFORM_ROOTS } from './platforms.js';

/** 平台根目录 → 友好显示名 */
export const PLATFORM_LABELS: Record<string, string> = {
  '.claude': 'Claude Code',
  '.kimi-code': 'Kimi Code',
  '.cursor': 'Cursor',
  '.codex': 'Codex',
  '.trae': 'Trae',
  '.trae-cn': 'Trae CN',
  '.traecli': 'Trae CLI',
  '.qoder': 'Qoder',
  '.qoderwork': 'Qoder Work',
  '.codebuddy': 'CodeBuddy',
  '.workbuddy': 'WorkBuddy',
};

export interface Target {
  path: string;
  label: string;
  /** 交互式选择时默认勾选 */
  defaultOn: boolean;
}

/** 项目级 skills 目录：当前工作目录下的 .agents/skills */
export function projectSkillsDir(): string {
  return path.join(process.cwd(), '.agents', 'skills');
}

/** 把绝对路径缩短显示（~ 替换 home，/ 统一正斜杠） */
function tidyPath(p: string): string {
  const home = os.homedir();
  if (p === home || p.startsWith(home + path.sep)) {
    return '~/' + path.relative(home, p).split(path.sep).join('/');
  }
  // 项目级用 ./ 前缀
  const cwd = process.cwd();
  if (p === cwd || p.startsWith(cwd + path.sep)) {
    return './' + path.relative(cwd, p).split(path.sep).join('/');
  }
  return p.split(path.sep).join('/');
}

/**
 * 构建候选安装目标列表：
 * 1. 用户级 ~/.agents/skills（默认勾选）
 * 2. 各平台 ~/.<root>/skills（检测到才列出，默认不勾选）
 * 3. 项目级 ./.agents/skills（save=true 时默认勾选）
 */
export function buildTargets(cfg: Config, opts: { save?: boolean } = {}): Target[] {
  const targets: Target[] = [];

  // 用户级
  targets.push({ path: cfg.skillsDir, label: '用户级', defaultOn: true });

  // 平台目录
  const home = os.homedir();
  for (const root of PLATFORM_ROOTS) {
    const rootPath = path.join(home, root);
    try {
      if (fs.statSync(rootPath).isDirectory()) {
        targets.push({
          path: path.join(rootPath, 'skills'),
          label: PLATFORM_LABELS[root] || root,
          defaultOn: false,
        });
      }
    } catch {
      // 根目录不存在，跳过
    }
  }

  // 项目级
  targets.push({
    path: projectSkillsDir(),
    label: '项目级',
    defaultOn: opts.save === true,
  });

  return targets;
}

/**
 * 选择安装目标目录。
 *
 * - `all=true`：用户级 + 所有检测到的平台目录（+ 项目级如果 save）
 * - `yes=true` 或非 TTY：跳过交互，用默认勾选项
 * - 否则：交互式编号多选
 */
export async function selectTargets(
  cfg: Config,
  opts: { save?: boolean; yes?: boolean; all?: boolean } = {},
): Promise<string[]> {
  const targets = buildTargets(cfg, { save: opts.save });

  // --all：用户级 + 所有检测到的平台（不含项目级，除非 -s）
  if (opts.all) {
    return targets
      .filter((t) => t.label !== '项目级' || opts.save)
      .map((t) => t.path);
  }

  const defaults = targets.filter((t) => t.defaultOn).map((t) => t.path);

  // -y 或非 TTY：跳过交互
  if (opts.yes || !process.stdout.isTTY) {
    return defaults;
  }

  // 交互式选择
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  process.stdout.write('\n选择安装目标（逗号或空格分隔编号，回车=默认 ✓ 项）：\n');
  const maxPath = Math.max(...targets.map((t) => tidyPath(t.path).length));
  targets.forEach((t, i) => {
    const mark = t.defaultOn ? '✓' : ' ';
    const tp = tidyPath(t.path).padEnd(maxPath);
    process.stdout.write(`  [${i + 1}] ${mark} ${tp}  (${t.label})\n`);
  });

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();
      const input = answer.trim();
      if (!input) {
        resolve(defaults);
        return;
      }
      const indices = input
        .split(/[\s,]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= targets.length);
      if (indices.length === 0) {
        resolve(defaults);
        return;
      }
      resolve([...new Set(indices)].map((i) => targets[i - 1].path));
    });
  });
}
