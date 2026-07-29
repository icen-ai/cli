import { defineCommand } from 'citty';
import add from './add.js';
import remove from './remove.js';
import list from './list.js';
import update from './update.js';
import search from './search.js';

/**
 * `icen skill` 命名空间——所有 skill 管理操作收在此处，
 * 顶层 icen 留给未来的其他 icen.ai 产品。
 */
export default defineCommand({
  meta: {
    name: 'skill',
    description: '管理 AI agent skills（安装 / 卸载 / 列表 / 更新 / 搜索）',
  },
  subCommands: {
    add,
    remove,
    list,
    update,
    search,
  },
});
