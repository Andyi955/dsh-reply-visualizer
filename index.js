import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

/** Stable Loader identity. */
export const name = 'reply-visualizer';

const DEFAULTS = {
  pageDir: join(os.homedir(), '.dsh-reply-visualizer', 'pages'),
  /** Abort only when nothing has arrived for this long — a stall, not a deadline. */
  stallTimeoutMs: 90_000,
  composeMaxInputChars: 14_000,
};

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

/**
 * No layout is prescribed, because the right visual depends on the reply.
 * What is prescribed is that the model must choose the representation itself.
 */
const HTML_PROMPT = [
  'You are a visual explainer. You get an assistant reply and produce ONE complete HTML document that makes its idea obvious at a glance.',
  '',
  'First decide what the idea IS, then choose a representation that fits it. Do not reuse a house style. Examples of the decision you are making:',
  '- a process or a pipeline → an animated flow with stages lighting up in order',
  '- a before/after or a trade-off → a draggable split, or two panels that move against each other',
  '- quantities → bars, a treemap, a ring, or a small canvas chart you draw yourself',
  '- a hierarchy → a tree that expands, with connectors drawing in',
  '- a sequence in time → a timeline you can scrub',
  '- relations between things → a force layout or a radial graph that settles',
  '- a mechanism → a canvas simulation: particles, springs, flow along a path',
  '- an abstract claim → one strong typographic composition with a single deliberate motion',
  '- an architecture → labelled boxes and connectors in SVG or mermaid, never a picture of boxes',
  '- code → a walkthrough that highlights lines in order',
  'These are prompts for your judgement, not a menu to pick blindly. Invent where it helps.',
  '',
  'Hard rules:',
  '- ONE file: inline <style> and <script>. No build step, no bundler, no markdown fences in your answer.',
  '- The page runs inside a sandboxed iframe: no fetch, no localStorage, no cookies. The CDN imports below are the only external requests allowed.',
  '- Libraries allowed from a CDN, and nothing else. All optional — use one only when it saves real work:',
  '  · mermaid 11 — https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs — flowcharts, sequence, state, ER, gantt',
  '  · chart.js 4 — https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js — bar, line, doughnut, radar from real numbers',
  '  · rough.js 4 — https://cdn.jsdelivr.net/npm/roughjs@4/bundled/rough.umd.js — hand-drawn wobble for shapes you position yourself',
  '  · d3 7 — https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js — scales, force layouts, anything bespoke',
  '  · three.js r160 — https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js — genuine 3D only',
  '- If a CDN import fails, the page must still be readable: fall back to plain HTML/SVG rather than leaving an empty box.',
  '- When the idea is boxes and arrows, prefer mermaid over a hand-built diagram: its labels and edges are correct by construction and cost nothing to draw.',
  '- Every word on the page must come from the reply. Never invent facts, numbers or names.',
  '- No walls of prose: at most three short paragraphs in the whole document. Everything else is labels, numbers, and structure.',
  '- Never place a bare row of words inside boxes or pills. A chip needs a label saying what it lists. Quoted speech is a quotation, not a run of UI tokens.',
  '- No photographs or generated images: draw everything. Never include an <img> tag.',
  '',
  'Choose the palette for THIS reply and declare it once in :root as custom properties. It should carry the idea: a cold technical page, a warm editorial one, a stark monochrome one, a dark instrument panel, a risograph two-ink print. Do not fall back to the same safe scheme every time. Keep body text at 4.5:1 contrast or better.',
  '- No emoji, no stock icon sets, no decorative drop shadows.',
  '',
  'Interaction is the point, not decoration. A visual learner reads by poking at things, so include at least two of these, chosen to fit the idea:',
  '- drag something and watch the consequence: a slider through a latency budget, a divider that re-lays the layout, a handle that reveals a threshold',
  '- hover or focus a node to dim everything else and read its detail',
  '- click a step or a stage to expand it while the others collapse',
  '- scrub a timeline and see the state at that instant',
  '- toggle an input or type a value and watch the diagram reconfigure',
  '- step through a sequence with play/pause and a visible position',
  'The interaction must teach something true: changing the input must change the output the way the reply says it does. Never add a control that does nothing, and label every control with what it changes.',
  'Everything interactive must also work by keyboard, and none of it may be required to understand the page — the static read has to stand on its own.',
  '',
  '- It must work at 380px wide and still look right at 1200px. One responsive layout, not two.',
  '- Respect prefers-reduced-motion: wrap every animation so it can be disabled.',
  '- Animation loops must pause when the document is hidden.',
  '',
  'Output the document only: start with <!doctype html>. No commentary before or after it.',
].join('\n');

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req, limitBytes = 400_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Strip fences and commentary; insist the result is a whole document. */
function extractHtml(text) {
  let html = String(text ?? '').trim();
  const fence = /```(?:html)?\s*([\s\S]*?)```/i.exec(html);
  if (fence !== null) html = fence[1].trim();
  const start = html.toLowerCase().indexOf('<!doctype');
  const htmlStart = start >= 0 ? start : html.toLowerCase().indexOf('<html');
  if (htmlStart < 0) throw new Error('the model did not return an HTML document');
  return html.slice(htmlStart);
}

/** The page names itself; the gallery just reads it back. */
function titleOf(html, fallback = 'A reply, drawn') {
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
  const heading = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html)?.[1];
  const raw = (title ?? heading ?? '').replace(/\s+/g, ' ').trim();
  return raw === '' ? fallback : raw.slice(0, 80);
}

/** Last resort when a page cannot be served. */
function fallbackPage(title, text) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
body{margin:0;padding:32px;background:#f6f1e8;color:#171310;font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1{font:400 34px/1.1 Georgia,serif;letter-spacing:-.02em;margin:0 0 16px}
p{max-width:62ch;color:#342c24}p:first-of-type{font-size:18px}
</style></head><body><h1>${esc(title)}</h1>
${String(text ?? '').split(/\n{2,}/).slice(0, 6).map((para) => `<p>${esc(para)}</p>`).join('\n')}
</body></html>`;
}

/**
 * Visual explainer Host half.
 *
 * The model reads the reply and writes the page; this plugin only supplies the
 * plumbing: one model call, a file on disk, an index, and the routes the
 * browser half talks to.
 *
 * @param ctx plugin context
 * @param config optional overrides
 */
export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...config };

  /* --- the exact provider/model the agent last used --- */
  let lastRoute = null;
  ctx.on('agent/request', async (_payload, next) => {
    const resolved = await next();
    if (resolved && typeof resolved.provider === 'string' && typeof resolved.model === 'string') {
      lastRoute = { provider: resolved.provider, model: resolved.model };
    }
    return resolved;
  });

  function resolveRoute() {
    if (lastRoute !== null) return lastRoute;
    const service = ctx.get('agentDefaultModel');
    const selection = service !== undefined && typeof service.currentSelection === 'function'
      ? service.currentSelection()
      : undefined;
    if (selection === null || typeof selection !== 'object') return null;
    const pick = (...keys) => {
      for (const key of keys) {
        const value = selection[key];
        if (typeof value === 'string' && value !== '') return value;
      }
      return null;
    };
    const provider = pick('provider', 'providerId');
    const model = pick('model', 'modelId');
    return provider !== null && model !== null ? { provider, model } : null;
  }

  /**
   * One auxiliary model call.
   *
   * No output cap and no wall-clock deadline: a page of HTML legitimately takes
   * minutes. What is bounded is a *stall* — silence for stallTimeoutMs.
   */
  async function ask(system, text) {
    const llm = ctx.get('llm');
    if (!llm || typeof llm.prepareCall !== 'function') throw new Error('no model service in this profile');
    const route = resolveRoute();
    if (route === null) throw new Error('no model route yet: send one message first');
    const input = String(text ?? '').slice(0, cfg.composeMaxInputChars);
    if (input.trim() === '') throw new Error('nothing to explain');

    const controller = new AbortController();
    let lastChunkAt = Date.now();
    let stalled = false;
    const watchdog = setInterval(() => {
      if (Date.now() - lastChunkAt > cfg.stallTimeoutMs) {
        stalled = true;
        controller.abort();
      }
    }, 2000);

    try {
      const call = await llm.prepareCall(
        { provider: route.provider, model: route.model, temperature: 0.5 },
        controller.signal,
      );

      let out = '';
      let failure = null;
      let truncated = false;
      for await (const chunk of call.stream({
        ...call.config,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: input }] }],
        signal: controller.signal,
      })) {
        lastChunkAt = Date.now();
        if (chunk.type === 'text-delta') out += chunk.text;
        else if (chunk.type === 'finish') {
          if (chunk.reason.kind === 'max-tokens') truncated = true;
          if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') failure = chunk.reason.failure;
        }
      }
      if (stalled) throw new Error(`the model went quiet for ${Math.round(cfg.stallTimeoutMs / 1000)}s`);
      if (failure !== null) throw new Error(failure?.message ?? 'model request failed');
      if (truncated) throw new Error('the model stopped before it finished its answer');
      return out;
    } finally {
      clearInterval(watchdog);
    }
  }

  /* --- pages on disk --- */
  async function savePage(id, html) {
    await mkdir(cfg.pageDir, { recursive: true });
    const file = join(cfg.pageDir, `${id}.html`);
    await writeFile(file, html, 'utf8');
    return file;
  }

  async function readIndex() {
    try {
      const raw = await readFile(join(cfg.pageDir, 'index.json'), 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.pages) ? parsed.pages : [];
    } catch {
      return [];
    }
  }

  async function pushIndex(entry) {
    const pages = (await readIndex()).filter((page) => page.id !== entry.id);
    pages.unshift(entry);
    await mkdir(cfg.pageDir, { recursive: true });
    await writeFile(
      join(cfg.pageDir, 'index.json'),
      JSON.stringify({ version: 3, pages: pages.slice(0, 120) }, null, 2),
      'utf8',
    );
  }

  /** Every failure lands in a file: the app keeps no host log of its own. */
  async function record(entry) {
    try {
      await mkdir(cfg.pageDir, { recursive: true });
      await appendFile(join(cfg.pageDir, 'log.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, 'utf8');
    } catch {
      /* logging must never break the request it describes */
    }
  }

  ctx.inject(['webServer'], (scoped) => {
    const server = scoped.get('webServer');
    if (!server) return;

    async function handle(req, res) {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const route = url.pathname.replace(/^\/dsh-reply-visualizer/, '').replace(/\/+$/, '') || '/';
      try {
        if (req.method === 'GET' && route === '/index') {
          json(res, 200, { ok: true, pages: await readIndex() });
          return;
        }

        if (req.method === 'POST' && route === '/diag') {
          await record({ route: '/diag', ...((await readJsonBody(req)) ?? {}) });
          json(res, 200, { ok: true });
          return;
        }

        if (req.method === 'POST' && route === '/build') {
          const body = await readJsonBody(req);
          const text = String(body?.text ?? '');
          const html = extractHtml(await ask(HTML_PROMPT, text));
          const id = String(body?.id ?? Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
          const title = titleOf(html);
          const bytes = Buffer.byteLength(html);

          await savePage(id, html);
          await pushIndex({
            id,
            title,
            ts: Date.now(),
            bytes,
            sessionId: String(body?.sessionId ?? '').slice(0, 64),
            sessionTitle: String(body?.sessionTitle ?? '').slice(0, 120),
          });
          await record({ route: '/build', ok: true, id, bytes, title });
          json(res, 200, { ok: true, url: `/dsh-reply-visualizer/page/${id}`, bytes });
          return;
        }

        if (req.method === 'GET' && route.startsWith('/page/')) {
          const id = route.slice('/page/'.length).replace(/[^a-zA-Z0-9_-]/g, '');
          try {
            const html = await readFile(join(cfg.pageDir, `${id}.html`), 'utf8');
            const buffer = Buffer.from(html);
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'content-length': buffer.length,
              'cache-control': 'no-store',
            });
            res.end(buffer);
          } catch {
            const html = fallbackPage('Nothing here yet', 'That page was never built, or it has been cleaned up.');
            const buffer = Buffer.from(html);
            res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'content-length': buffer.length });
            res.end(buffer);
          }
          return;
        }

        json(res, 404, { ok: false, error: `unknown route ${route}` });
      } catch (error) {
        const message = String(error?.message ?? error);
        await record({ route, ok: false, error: message });
        console.error(`[reply-visualizer] ${route} failed: ${message}`);
        json(res, 500, { ok: false, error: message });
      }
    }

    scoped.effect(() => server.register({ kind: 'prefix', path: '/dsh-reply-visualizer', handler: handle }));
  });
}

/** Exported for tests. */
export { extractHtml, titleOf, fallbackPage };
