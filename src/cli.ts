import { defineCommand, runMain } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import add from './commands/add.js';
import remove from './commands/remove.js';
import list from './commands/list.js';
import update from './commands/update.js';
import search from './commands/search.js';
import key from './commands/key.js';
import whoami from './commands/whoami.js';

const main = defineCommand({
  meta: {
    name: 'icen',
    version: pkg.version,
    description: 'icen.ai skill CLI — 从 skill.icen.ai 安装和管理 AI agent skills',
  },
  subCommands: {
    add,
    remove,
    list,
    update,
    search,
    key,
    whoami,
  },
});

runMain(main);
