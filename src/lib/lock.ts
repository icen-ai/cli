import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';

/**
 * .icen-lock.json —— 与 install.sh / install.ps1 完全兼容的扁平格式：
 *   { "icen-network": "6058a24f85cc", ... }
 * 即 { 完整 skill 名: 内容 hash }，2 空格缩进 JSON，损坏/缺失时按空处理。
 * 格式若变必须同步修改 install.sh / install.ps1。
 */
export type Lock = Record<string, string>;

export function lockPath(cfg: Config): string {
  return path.join(cfg.skillsDir, '.icen-lock.json');
}

export function readLock(cfg: Config): Lock {
  try {
    const data = JSON.parse(fs.readFileSync(lockPath(cfg), 'utf8'));
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) return data as Lock;
  } catch {
    // 文件不存在或损坏 → 按空 lock 处理（与 install.sh 行为一致）
  }
  return {};
}

export function writeLock(cfg: Config, lock: Lock): void {
  fs.mkdirSync(cfg.skillsDir, { recursive: true });
  fs.writeFileSync(lockPath(cfg), JSON.stringify(lock, null, 2));
}

export function setLockEntry(cfg: Config, name: string, hash: string): void {
  const lock = readLock(cfg);
  lock[name] = hash;
  writeLock(cfg, lock);
}

export function removeLockEntry(cfg: Config, name: string): void {
  const lock = readLock(cfg);
  if (name in lock) {
    delete lock[name];
    writeLock(cfg, lock);
  }
}
