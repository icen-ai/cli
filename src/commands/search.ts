import { defineCommand } from 'citty';
import { getConfig } from '../lib/config.js';
import { setupLog, print, out, guard } from '../lib/log.js';
import { fetchIndex, shortId, type SkillEntry } from '../lib/registry.js';

function matches(skill: SkillEntry, q: string): boolean {
  const haystack = [
    skill.name,
    shortId(skill.name),
    skill.name_zh,
    skill.name_en,
    skill.description,
    skill.desc_zh,
    skill.desc_en,
    ...(skill.tags || []),
    ...(skill.keywords || []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}

export default defineCommand({
  meta: { name: 'search', description: '在 registry 的双语名称 / tags / keywords 中搜索' },
  args: {
    query: { type: 'positional', description: '搜索关键词', required: true },
    json: { type: 'boolean', description: '以 JSON 输出结果', default: false },
    quiet: { type: 'boolean', alias: 'q', description: '静默模式', default: false },
    registry: { type: 'string', description: '临时指定 registry 地址（默认 https://skill.icen.ai）' },
  },
  run: guard(async ({ args }) => {
    setupLog(args);
    const cfg = getConfig({ registry: args.registry });
    const index = await fetchIndex(cfg);
    const q = args.query.trim().toLowerCase();
    const hits = index.skills.filter((s) => matches(s, q));
    if (args.json) {
      out({
        query: args.query,
        results: hits.map((s) => ({
          name: s.name,
          version: s.version,
          hash: s.hash,
          paid: s.paid,
          description: s.desc_zh || s.desc_en || s.description,
        })),
      });
      return;
    }
    if (hits.length === 0) {
      print(`没有匹配「${args.query}」的 skill。`);
      return;
    }
    print(`匹配「${args.query}」的 skill（${hits.length} 个）：`);
    for (const s of hits) {
      const tag = s.paid ? ' [付费]' : '';
      const desc = s.desc_zh || s.desc_en || s.description;
      print(`  ${s.name.padEnd(24)}${tag} ${desc}`);
    }
  }),
});
