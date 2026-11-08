/** Cross-check className literals in client.js against the CSS block it ships. */
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const cssStart = source.indexOf('const CSS = [');
const cssEnd = source.indexOf("].join('\\n');", cssStart);
if (cssStart < 0 || cssEnd < 0) throw new Error('CSS block not found');

const css = source.slice(cssStart, cssEnd);
const js = source.slice(0, cssStart) + source.slice(cssEnd);

const fromJs = new Set([...js.matchAll(/rv-[a-z0-9-]+/g)].map((m) => m[0]));
const fromCss = new Set([...css.matchAll(/\.(rv-[a-z0-9-]+)/g)].map((m) => m[1]));

const ignore = new Set(['rv-a', 'rv-b', 'rv-c', 'rv-visualizer', 'rv-pane', 'rv-dot', 'rv-rail']);
const missing = [...fromJs].filter((token) => !fromCss.has(token) && !ignore.has(token));
const unused = [...fromCss].filter((token) => !fromJs.has(token));

console.log(`class tokens: js=${fromJs.size} css=${fromCss.size}`);
console.log('referenced but unstyled:', missing.length > 0 ? missing.join(', ') : 'none');
console.log('styled but unreferenced:', unused.length > 0 ? unused.join(', ') : 'none');
process.exit(missing.length === 0 ? 0 : 1);
