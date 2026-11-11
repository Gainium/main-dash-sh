/**
 * The backtester reads "no `window`" as Node and loads `fs` for its file
 * mode. A Web Worker has no `window` either, so give it one before the engine
 * module is evaluated. Imported first by the worker; nothing else uses it.
 */
const g = globalThis as unknown as { window?: unknown };
if (typeof g.window === 'undefined') g.window = globalThis;

export {};
