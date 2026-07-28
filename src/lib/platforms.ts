import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Config } from './config.js';

/**
 * 平台根目录列表——必须与 skill 仓库 web/public/install.sh / install.ps1 完全一致。
 * 改这里必须同步改 install.sh / install.ps1，反之亦然。
 */
export const PLATFORM_ROOTS = [
  '.claude',
  '.kimi-code',
  '.cursor',
  '.codex',
  '.trae',
  '.trae-cn',
  '.traecli',
  '.qoder',
  '.qoderwork',
  '.codebuddy',
  '.workbuddy',
];

/**
 * 目标目录探测：主 skills 目录必装；其余平台根目录存在时铺到其 skills/ 子目录。
 * sync=false（--no-sync）时只返回主目录。
 */
export function detectTargetDirs(cfg: Config, opts: { sync?: boolean } = {}): string[] {
  const dirs = [cfg.skillsDir];
  if (opts.sync !== false) {
    const home = os.homedir();
    for (const root of PLATFORM_ROOTS) {
      const rootPath = path.join(home, root);
      try {
        if (fs.statSync(rootPath).isDirectory()) dirs.push(path.join(rootPath, 'skills'));
      } catch {
        // 根目录不存在，跳过
      }
    }
  }
  return dirs;
}
