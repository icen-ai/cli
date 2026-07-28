import os from 'node:os';
import path from 'node:path';

export interface Config {
  /** registry 地址（无尾部斜杠），默认 https://skill.icen.ai */
  baseUrl: string;
  /** 凭证/配置目录，默认 ~/.icen（ICEN_HOME 覆盖，测试用） */
  icenHome: string;
  /** 主 skills 目录（lock 文件所在），默认 ~/.agents/skills（ICEN_SKILLS_DIR 覆盖，测试用） */
  skillsDir: string;
  /** 环境变量 ICEN_KEY */
  envKey?: string;
}

export function getConfig(flags: { registry?: string } = {}): Config {
  const home = os.homedir();
  const baseUrl = (flags.registry || process.env.ICEN_BASE_URL || 'https://skill.icen.ai').replace(/\/+$/, '');
  const icenHome = process.env.ICEN_HOME || path.join(home, '.icen');
  const skillsDir = process.env.ICEN_SKILLS_DIR || path.join(home, '.agents', 'skills');
  return { baseUrl, icenHome, skillsDir, envKey: process.env.ICEN_KEY };
}
