import type { Config } from './config.js';

/** index.json 中单个 skill 的条目结构（与 scripts/build-index.mjs 生成的一致） */
export interface SkillEntry {
  name: string;
  name_zh: string;
  name_en: string;
  description: string;
  desc_zh: string;
  desc_en: string;
  version: string;
  tags: string[];
  keywords: string[];
  paid: boolean;
  /** 目录内容 hash（12 位 hex，注入官方申明前的原始内容），版本锚定用，非 tar.gz 字节校验和 */
  hash: string;
  /** 免费 skill 的 tar.gz 路径，如 /skills/icen-network.tar.gz */
  tarball: string;
  fileCount: number;
}

export interface SkillIndex {
  generatedAt: string;
  skills: SkillEntry[];
}

// 60 秒内存缓存：同一进程内连续命令（如 update 检查多个 skill）不重复拉索引
let cache: { url: string; at: number; data: SkillIndex } | undefined;

export async function fetchIndex(cfg: Config, opts: { fresh?: boolean } = {}): Promise<SkillIndex> {
  const url = `${cfg.baseUrl}/index.json`;
  if (!opts.fresh && cache && cache.url === url && Date.now() - cache.at < 60_000) {
    return cache.data;
  }
  const res = await fetch(url, { headers: { 'user-agent': 'icen-cli/0.1' } });
  if (!res.ok) throw new Error(`拉取索引失败：HTTP ${res.status}（${url}）`);
  const data = (await res.json()) as SkillIndex;
  if (!data || !Array.isArray(data.skills)) throw new Error(`索引格式异常（${url}）`);
  cache = { url, at: Date.now(), data };
  return data;
}

/** 短 id = 去掉 icen- 前缀（icen-network → network） */
export function shortId(name: string): string {
  return name.startsWith('icen-') ? name.slice(5) : name;
}

/** 解析用户输入：支持全名（icen-network）、短 id（network）、以及裸 name 精确匹配 */
export function resolveSkill(index: SkillIndex, input: string): SkillEntry | undefined {
  const q = input.trim();
  if (!q) return undefined;
  return (
    index.skills.find((s) => s.name === q) ||
    index.skills.find((s) => s.name === `icen-${q}`) ||
    index.skills.find((s) => shortId(s.name) === q)
  );
}

/** 下载地址：免费 skill 用索引里的 tarball 路径；付费 skill 走 /k/<key>/<name>.tar.gz（与 install.sh 一致） */
export function tarballUrl(cfg: Config, skill: SkillEntry, key?: string): string {
  if (skill.paid) return `${cfg.baseUrl}/k/${key}/${skill.name}.tar.gz`;
  return `${cfg.baseUrl}${skill.tarball}`;
}

export async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'user-agent': 'icen-cli/0.1' } });
  if (!res.ok) {
    throw new Error(`下载失败：HTTP ${res.status}（${url}）`);
  }
  return Buffer.from(await res.arrayBuffer());
}
