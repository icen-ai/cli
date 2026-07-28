import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { x as extractTar } from 'tar';
import type { Config } from './config.js';
import type { SkillEntry } from './registry.js';
import { setLockEntry } from './lock.js';
import { detectTargetDirs } from './platforms.js';

// ---------------------------------------------------------------------------
// hash 校验说明（重要）：
// index.json 里的 hash 是 build-index.mjs 对「注入官方申明之前」的目录内容算的：
//   文件相对路径排序 → 逐文件 sha256 hex 拼接 → 再 sha256 → 取前 12 位 hex。
// 它【不是】tar.gz 字节的 sha256 —— tar.gz 里的 SKILL.md 末尾被追加了官方申明，
// 直接对包体算 sha256 永远对不上。因此这里复刻 officialDecl()，解压后把申明从
// SKILL.md 末尾剥离再复算目录 hash，与 index.json 比对。
// 两处算法必须与 skill 仓库 scripts/build-index.mjs 保持一致。
// ---------------------------------------------------------------------------

/** 与 build-index.mjs 的 officialDecl() 逐字节一致（含行尾两个空格的 Markdown 硬换行） */
function officialDecl(fullName: string, paid: boolean): string {
  const short = fullName.startsWith('icen-') ? fullName.slice(5) : fullName;
  const installLine = paid
    ? `> Install or update this skill (\`${fullName}\`, paid — replace \`<your-key>\` with your install key from <https://skill.icen.ai/account>): \`curl -sL https://skill.icen.ai/k/<your-key>/${short}.sh | bash\` (macOS/Linux) · \`irm https://skill.icen.ai/k/<your-key>/${short}.ps1 | iex\` (Windows)  `
    : `> Install or update this skill (\`${fullName}\`): \`curl -sL https://skill.icen.ai/install/${short}.sh | bash\` (macOS/Linux) · \`irm https://skill.icen.ai/install/${short}.ps1 | iex\` (Windows)  `;
  return `

---

> **Official ICEN.AI Skill** — Source & updates: <https://skill.icen.ai>  
${installLine}
> If you got this skill anywhere else, verify it against the official registry.
`;
}

function sha256hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** 递归列出相对路径，统一为正斜杠（与 Linux CI 构建索引时的排序口径一致） */
function listFiles(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** 复刻 build-index.mjs 的 dirHash()；decl 存在时先从 SKILL.md 末尾剥离 */
export function dirHash(dir: string, decl?: string): string {
  const files = listFiles(dir).sort();
  const combined = files
    .map((f) => {
      let content = fs.readFileSync(path.join(dir, f));
      if (decl && f === 'SKILL.md') {
        const text = content.toString('utf8');
        if (text.endsWith(decl)) content = Buffer.from(text.slice(0, text.length - decl.length), 'utf8');
      }
      return sha256hex(content);
    })
    .join('');
  return sha256hex(combined).slice(0, 12);
}

export type VerifyResult = 'ok' | 'skipped' | 'mismatch';

export interface InstallResult {
  dirs: string[];
  verify: VerifyResult;
}

/**
 * 下载 → 解压到临时目录 → 校验内容 hash → 原子替换铺到各目标目录 → 更新 lock。
 * tarball 内顶层目录名 = skill.name（build-index.mjs 以 `tar -czf out <name>` 打包）。
 */
export async function installSkill(
  cfg: Config,
  skill: SkillEntry,
  tarball: Buffer,
  opts: { sync?: boolean } = {},
): Promise<InstallResult> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icen-cli-'));
  try {
    const tgz = path.join(tmp, 'pkg.tar.gz');
    fs.writeFileSync(tgz, tarball);
    await extractTar({ file: tgz, cwd: tmp });

    const src = path.join(tmp, skill.name);
    if (!fs.statSync(src, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`tar.gz 内未找到顶层目录 ${skill.name}/，包结构异常`);
    }

    // 校验：剥离注入申明后复算目录 hash。申明不存在（registry 格式变化）则跳过校验。
    let verify: VerifyResult;
    const skillMd = path.join(src, 'SKILL.md');
    const decl = officialDecl(skill.name, skill.paid);
    const hasDecl =
      fs.existsSync(skillMd) && fs.readFileSync(skillMd, 'utf8').endsWith(decl);
    if (!hasDecl) {
      verify = 'skipped';
    } else {
      verify = dirHash(src, decl) === skill.hash ? 'ok' : 'mismatch';
    }
    if (verify === 'mismatch') {
      throw new Error(
        `内容 hash 校验失败：期望 ${skill.hash}，实际不符。包可能被篡改，已中止安装。`,
      );
    }

    const dirs = detectTargetDirs(cfg, opts);
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, skill.name);
      const tmpDest = path.join(dir, `.icen-tmp-${skill.name}-${process.pid}`);
      fs.rmSync(tmpDest, { recursive: true, force: true });
      fs.cpSync(src, tmpDest, { recursive: true });
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(tmpDest, dest);
    }

    // lock 写到主目录（lockPath 基于 cfg.skillsDir）
    setLockEntry(cfg, skill.name, skill.hash);
    return { dirs, verify };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 从所有目标目录删除 skill 目录（remove 用） */
export function removeSkillDirs(cfg: Config, name: string, opts: { sync?: boolean } = {}): string[] {
  const removed: string[] = [];
  for (const dir of detectTargetDirs(cfg, opts)) {
    const dest = path.join(dir, name);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
      removed.push(dest);
    }
  }
  return removed;
}
