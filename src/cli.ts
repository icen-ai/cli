import { defineCommand, runMain } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import skill from './commands/skill.js';
import login from './commands/login.js';
import logout from './commands/logout.js';
import whoami from './commands/whoami.js';
import key from './commands/key.js';

const main = defineCommand({
  meta: {
    name: 'icen',
    version: pkg.version,
    description: 'icen.ai CLI — skill 管理与生态工具',
  },
  subCommands: {
    skill,
    login,
    logout,
    whoami,
    key,
  },
});

runMain(main);
