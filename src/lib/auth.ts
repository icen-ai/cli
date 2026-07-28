import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';

export const KEY_PATTERN = /^ICEN-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export interface Credentials {
  apiKey?: string;
}

export function validateKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function credPath(cfg: Config): string {
  return path.join(cfg.icenHome, 'credentials.json');
}

export function readCredentials(cfg: Config): Credentials {
  try {
    const raw = fs.readFileSync(credPath(cfg), 'utf8');
    const data = JSON.parse(raw) as Credentials;
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    return {};
  }
}

/** 写入 credentials.json，权限 0600（仅 owner 可读） */
export function writeCredentials(cfg: Config, creds: Credentials): void {
  fs.mkdirSync(cfg.icenHome, { recursive: true });
  fs.writeFileSync(credPath(cfg), JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 });
}

export type KeySource = 'flag' | 'env' | 'credentials';

export interface ResolvedKey {
  key: string;
  source: KeySource;
}

/** 凭证优先级：--key flag > 环境变量 ICEN_KEY > credentials.json */
export function resolveKey(cfg: Config, flagKey?: string): ResolvedKey | undefined {
  if (flagKey) return { key: flagKey, source: 'flag' };
  if (cfg.envKey) return { key: cfg.envKey, source: 'env' };
  const creds = readCredentials(cfg);
  if (creds.apiKey) return { key: creds.apiKey, source: 'credentials' };
  return undefined;
}
