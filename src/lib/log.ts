import fs from 'node:fs';
import kleur from 'kleur';

let jsonMode = false;
let quietMode = false;

/** 全局输出模式设置；--json 时人类可读输出全部静默，只保留 out() 的 JSON 与错误 */
export function setupLog(opts: { json?: boolean; quiet?: boolean; noColor?: boolean }): void {
  jsonMode = !!opts.json;
  quietMode = !!opts.quiet;
  if (jsonMode || opts.noColor || process.env.NO_COLOR !== undefined) kleur.enabled = false;
}

export function isJson(): boolean {
  return jsonMode;
}

/** 普通进度信息 */
export function info(msg: string): void {
  if (!jsonMode && !quietMode) console.log(msg);
}

/** 成功信息（绿色） */
export function success(msg: string): void {
  if (!jsonMode && !quietMode) console.log(kleur.green(msg));
}

/** 警告（黄色，走 stderr，不污染 --json 的 stdout） */
export function warn(msg: string): void {
  if (!jsonMode && !quietMode) console.error(kleur.yellow(msg));
}

/** 错误（红色，走 stderr，--json 下也要报） */
export function error(msg: string): void {
  console.error(kleur.red(msg));
}

/** 人类可读的普通输出（list/search 的非 json 结果），quiet 下也显示 */
export function print(msg: string): void {
  if (!jsonMode) console.log(msg);
}

/** JSON 结果输出（--json 模式下的唯一 stdout 内容） */
export function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * 内部退出信号。Windows 上 process.exit() 与 undici(fetch) 未关闭的 socket 句柄
 * 冲突会触发 libuv 断言（async.c UV_HANDLE_CLOSING）导致进程 abort、退出码丢失，
 * 因此 fail() 不调 process.exit，而是设 exitCode 后抛 ExitError，由 guard() 吞掉，
 * 让进程在事件循环 drain 后自然退出。
 */
class ExitError extends Error {
  constructor() {
    super('');
    this.name = 'ExitError';
  }
}

/** 打印错误（同步写 stderr 防管道丢失），设置 exit code 1 并中止当前命令 */
export function fail(msg: string): never {
  fs.writeSync(2, kleur.red(`✗ ${msg}\n`));
  process.exitCode = 1;
  throw new ExitError();
}

/** 包装 citty 命令的 run：吞掉 fail() 的 ExitError，未预期错误统一友好报错 */
export function guard<A>(fn: (ctx: A) => Promise<void>): (ctx: A) => Promise<void> {
  return async (ctx: A): Promise<void> => {
    try {
      await fn(ctx);
    } catch (e) {
      if (e instanceof ExitError) return;
      fs.writeSync(2, kleur.red(`✗ ${e instanceof Error ? e.message : String(e)}\n`));
      process.exitCode = 1;
    }
  };
}
