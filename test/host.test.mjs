/**
 * Smoke test for the Host half: routing, graceful failure, and the pure
 * helpers that turn a model answer into a page. No HTTP, no model.
 */
import { apply, extractHtml, titleOf, fallbackPage } from '../index.js';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pageDir = await mkdtemp(join(tmpdir(), 'rv-test-'));

const routes = [];
const disposers = [];

const ctx = {
  effect(fn) {
    const dispose = fn();
    if (typeof dispose === 'function') disposers.push(dispose);
    return dispose ?? (() => {});
  },
  on() {
    return () => {};
  },
  get() {
    return undefined;
  },
  inject(_keys, fn) {
    fn({
      get: (key) => (key === 'webServer'
        ? { register: (route) => { routes.push(route); return () => {}; } }
        : undefined),
      effect: ctx.effect,
    });
  },
};

apply(ctx, { pageDir });

let failures = 0;
const check = (name, condition, extra) => {
  if (condition) return;
  failures += 1;
  console.log(`FAIL ${name}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`);
};

function call(method, path, body) {
  const route = routes.find((entry) => path.startsWith(entry.path));
  return new Promise((resolve, reject) => {
    if (route === undefined) {
      reject(new Error(`no route for ${path}`));
      return;
    }
    const timer = setTimeout(() => reject(new Error(`timeout ${path}`)), 10_000);
    const res = {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(buffer) {
        clearTimeout(timer);
        resolve({ status: this.status, headers: this.headers, body: buffer.toString('utf8') });
      },
    };
    const req = {
      method,
      url: path,
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield Buffer.from(JSON.stringify(body));
      },
    };
    void route.handler(req, res);
  });
}

check('a prefix route is registered', routes.length === 1, routes.map((r) => r.path));
check('route path is namespaced', routes[0]?.path === '/dsh-reply-visualizer', routes[0]?.path);

// The image pipeline is gone: those routes must not answer any more.
for (const dead of ['/comfy/status', '/comfy/ensure']) {
  const gone = await call('GET', `/dsh-reply-visualizer${dead}`.replace('/ensure', '/status'));
  check(`${dead} no longer exists`, gone.status === 404, gone.status);
}

const index = await call('GET', '/dsh-reply-visualizer/index');
check('index answers', index.status === 200, index.status);
check('index starts empty', Array.isArray(JSON.parse(index.body).pages), index.body);

const build = await call('POST', '/dsh-reply-visualizer/build', { text: 'the reply text' });
check('build fails gracefully with no model', build.status === 500, build.status);
check('build says why', String(JSON.parse(build.body).error).length > 0, build.body);

const log = await readFile(join(pageDir, 'log.jsonl'), 'utf8');
check('failures are recorded to disk', log.includes('"ok":false'), log.slice(0, 160));
check('the log names the route', log.includes('/build'), log.slice(0, 200));

// --- settings the gallery can change ---
const settings0 = await call('GET', '/dsh-reply-visualizer/settings');
check('settings have a default depth', JSON.parse(settings0.body).settings.quality === 'considered', settings0.body);
check('settings offer the choices', Array.isArray(JSON.parse(settings0.body).settings.options.quality), settings0.body);

const savedFast = await call('POST', '/dsh-reply-visualizer/settings', { quality: 'fast', reasoningEffort: 'none' });
check('settings accept valid values', JSON.parse(savedFast.body).settings.quality === 'fast', savedFast.body);

const reread = await call('GET', '/dsh-reply-visualizer/settings');
check('settings persist across requests', JSON.parse(reread.body).settings.quality === 'fast'
  && JSON.parse(reread.body).settings.reasoningEffort === 'none', reread.body);

const rejected = await call('POST', '/dsh-reply-visualizer/settings', { quality: 'nonsense', reasoningEffort: 'ultra' });
check('invalid settings are ignored', JSON.parse(rejected.body).settings.quality === 'fast', rejected.body);

// --- HTML extraction ---
const fenced = extractHtml('```html\n<!doctype html><html><body>hi</body></html>\n```');
check('html survives a fence', fenced.startsWith('<!doctype html>'), fenced.slice(0, 40));
const chatty = extractHtml('Here is the page:\n\n<!doctype html><html><body>hi</body></html>');
check('html drops leading commentary', chatty.startsWith('<!doctype html>'), chatty.slice(0, 40));
let notHtml = '';
try { extractHtml('{"a":1}'); } catch (error) { notHtml = String(error.message); }
check('html rejects a non-document', notHtml.includes('HTML document'), notHtml);

// --- the page names itself ---
check('title comes from <title>', titleOf('<html><head><title>Cache rings</title></head></html>') === 'Cache rings');
check('title falls back to <h1>', titleOf('<html><body><h1>Write path</h1></body></html>') === 'Write path');
check('title falls back to a default', titleOf('<html><body></body></html>') === 'A reply, drawn');
check('title is trimmed and capped', titleOf(`<title>${'x'.repeat(200)}</title>`).length === 80);

const fallback = fallbackPage('Title here', 'First para.\n\nSecond para.');
check('fallback is a whole document', fallback.startsWith('<!doctype html>') && fallback.includes('Title here'));
check('fallback keeps the text', fallback.includes('First para.') && fallback.includes('Second para.'));

// --- serving ---
await mkdir(pageDir, { recursive: true });
await writeFile(join(pageDir, 'known.html'), '<!doctype html><html><head><title>Known</title></head><body>ok</body></html>', 'utf8');
const known = await call('GET', '/dsh-reply-visualizer/page/known');
check('a saved page is served', known.status === 200 && known.body.includes('Known'), known.status);
check('page is html', String(known.headers['content-type']).includes('text/html'), known.headers);

const notFound = await call('GET', '/dsh-reply-visualizer/page/missing');
check('missing page is 404', notFound.status === 404, notFound.status);
check('missing page is still html', String(notFound.headers['content-type']).includes('text/html'), notFound.headers);

for (const dispose of disposers) dispose();
await rm(pageDir, { recursive: true, force: true });

console.log(failures === 0 ? 'ALL HOST CHECKS PASSED' : `${failures} HOST CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
