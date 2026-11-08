window.__ModuleLoader__.load({
  id: 'dsh-reply-visualizer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useState } = React;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'replyVisualizer';
    /** Page tab type registered with the right Sidebar. */
    const KIND = 'reply-visualizer';
    /** Registry identity of that type; also the body's slot key. */
    const TYPE_ID = 'dsh-reply-visualizer';

    /* ------------------------------------------------------------------ *
     * Copy
     * ------------------------------------------------------------------ */

    const en = {
      'action.open': 'Explain this reply visually',
      'panel.title': 'Visual explainer',
      'panel.illustrating': 'Drawing\u2026',
      'panel.reading': 'Reading this reply',
      'job.reading': 'Reading the reply\u2026',
      'job.ready': 'Visual explanation ready',
      'job.open': 'Click to open it',
      'job.failed': 'Could not build the page',
      'job.dismiss': 'Dismiss',
      'panel.draw': 'Draw this reply',
      'panel.recent': 'Earlier explanations',
      'panel.untitled': 'Untitled',
      'panel.current': 'This reply',
      'gallery.title': 'Visual explanations',
      'gallery.empty': 'No pages yet. Press the cards icon under a long reply.',
      'gallery.back': 'All pages',
      'gallery.offline': 'Could not reach the plugin.',
      'gallery.ungrouped': 'Earlier, before chats were recorded',
      'gallery.pages': 'pages',
      'panel.prev': 'Previous',
      'panel.next': 'Next',
      'panel.empty': 'Nothing to explain yet',
      'panel.emptyHint': 'Send a long answer, then press the cards icon under it and the deck opens here.',
      'guide.title': 'Visual explainer',
      'guide.description': 'Turn a long reply into a small animated deck.',
      'card.gist': 'The idea',
      'card.table': 'Side by side',
      'card.chain': 'In order',
      'card.flow': 'The path',
      'card.tree': 'How it nests',
      'card.kv': 'The details',
      'card.metrics': 'By the numbers',
      'card.code': 'The code',
      'card.callout': 'Careful',
      'card.concept': 'Drawn',
      'card.notes': 'Also said',
      'card.points': 'Key points',
      'card.stats': 'The shape',
      'code.unknown': 'code',
      'code.lines': '{n} lines',
      'stat.words': 'words',
      'stat.sections': 'sections',
      'stat.steps': 'steps',
      'stat.code': 'blocks',
      'stat.files': 'files',
    };

    const zh = {
      'action.open': '用图示解释这条回复',
      'panel.title': '图示解释',
      'panel.illustrating': '绘制中…',
      'panel.reading': '正在读这条回复',
      'job.reading': '正在读这条回复…',
      'job.ready': '图示解释已生成',
      'job.open': '点击打开',
      'job.failed': '没能生成页面',
      'job.dismiss': '关闭',
      'panel.draw': '给这条回复画图',
      'panel.recent': '之前的图示',
      'panel.untitled': '未命名',
      'panel.current': '当前回复',
      'gallery.title': '图示解释',
      'gallery.empty': '还没有页面。在长回复下面点一下卡片图标。',
      'gallery.back': '全部页面',
      'gallery.offline': '无法连接插件。',
      'gallery.ungrouped': '较早的页面（当时还没记录会话）',
      'gallery.pages': '个页面',
      'panel.prev': '上一张',
      'panel.next': '下一张',
      'panel.empty': '还没有可解释的内容',
      'panel.emptyHint': '发一段较长的回答，再点它下面的卡片图标，幻灯片就会出现在这里。',
      'guide.title': '图示解释',
      'guide.description': '把长回复变成一段会动的幻灯片。',
      'card.gist': '核心一句话',
      'card.table': '对照',
      'card.chain': '顺序',
      'card.flow': '路径',
      'card.tree': '层级',
      'card.kv': '细节',
      'card.metrics': '数据',
      'card.code': '代码',
      'card.callout': '注意',
      'card.concept': '结构图',
      'card.notes': '另外提到',
      'card.points': '关键要点',
      'card.stats': '整体',
      'code.unknown': '代码',
      'code.lines': '{n} 行',
      'stat.words': '词',
      'stat.sections': '小节',
      'stat.steps': '步骤',
      'stat.code': '代码块',
      'stat.files': '文件',
    };

    const CARD_TITLE = {
      gist: 'card.gist',
      table: 'card.table',
      chain: 'card.chain',
      flow: 'card.flow',
      tree: 'card.tree',
      kv: 'card.kv',
      metrics: 'card.metrics',
      code: 'card.code',
      callout: 'card.callout',
      concept: 'card.concept',
      notes: 'card.notes',
      points: 'card.points',
      stats: 'card.stats',
    };

    /* ------------------------------------------------------------------ *
     * Model
     * ------------------------------------------------------------------ */

    /** A reply earns the icon only when it is long or structurally busy. */
    const QUALIFY = { chars: 480, strongChars: 700, sections: 2, bullets: 5, maxCards: 9 };
    /** Longest text kept per distilled line. */
    const CLIP = { gist: 240, cell: 110, point: 150, step: 130, note: 130, code: 58 };
    /** A flat list becomes arrowed chips while its items stay this short. */
    const FLOW_MAX = 46;

    const FENCE = /^\s*(?:```|~~~)\s*([A-Za-z0-9+#._-]*)\s*$/;
    const HEADING = /^\s{0,3}(#{1,6})\s+(.*\S)\s*$/;
    const BULLET = /^(\s*)[-*+]\s+(.*\S)\s*$/;
    const ORDERED = /^(\s*)\d{1,2}[.)]\s+(.*\S)\s*$/;
    const QUOTE = /^\s{0,3}>\s?(.*\S)?\s*$/;
    const RULE = /^\s{0,3}(?:[-*_]\s*){3,}$/;
    const TABLE_ROW = /^\s{0,3}\|(.+)\|\s*$/;
    const TABLE_SKIP = /^\s{0,3}\|?\s*:?-{2,}:?\s*\|/;
    const WARNING = /^(?:note|notice|warning|careful|caution|important|attention|heads[ -]up|beware|keep in mind)\b[::]?\s*/i;
    /** `term: value`, `term — value`, `term = value` bullets read as a spec. */
    const PAIR = /^([^:：=—–\u2014]{1,30}?)\s*[:：=—–\u2014]\s+(\S.*)$/;
    /** Filler openers carry no meaning on their own. */
    const FILLER = /^(?:yes|yeah|sure|ok|okay|got it|done|right|correct|no problem|absolutely|certainly)\b[.!]?$/i;
    const LEADING_NUMBER = /^[-+]?\d[\d.,]*\s*[%a-zA-Z×/]*/;

    /** Strip inline markdown so a distilled line reads like plain speech. */
    function stripMd(value) {
      return String(value ?? '')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    /** Cut on a word boundary and mark the cut. */
    function clip(value, max) {
      const text = String(value ?? '').trim();
      if (text.length <= max) return text;
      const cut = text.slice(0, max);
      const space = cut.lastIndexOf(' ');
      const kept = space > max * 0.55 ? cut.slice(0, space) : cut;
      return kept.replace(/[\s.,;:]+$/, '') + '\u2026';
    }

    /** Split prose into sentences without a lookbehind (older engines). */
    function sentences(value) {
      const text = String(value ?? '').replace(/\s+/g, ' ').trim();
      if (text === '') return [];
      const out = [];
      let start = 0;
      for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char !== '.' && char !== '!' && char !== '?') continue;
        const next = text[i + 1];
        if (next !== undefined && next !== ' ') continue;
        const piece = text.slice(start, i + 1).trim();
        if (piece !== '') out.push(piece);
        start = i + 1;
      }
      const tail = text.slice(start).trim();
      if (tail !== '') out.push(tail);
      return out;
    }

    /** Find file-looking tokens so a long answer shows what it touched. */
    function collectFiles(text) {
      const seen = new Set();
      const pattern = /(?:[A-Za-z]:\\[^\s"'`<>|,*]+|\.{0,2}\/[\w./\\-]+|[\w-]+\/[\w./-]+|[\w-]+\.(?:tsx?|jsx?|mjs|json|md|py|rb|go|rs|java|css|scss|html|ya?ml|toml|sh|ps1|sql|svg|png|jpg))\b/g;
      const found = [];
      let match = pattern.exec(text);
      while (match !== null) {
        const token = match[0].replace(/[.,;:)\]]+$/, '');
        if (token.length > 2 && !seen.has(token) && !/^\d+\.\d+$/.test(token)) {
          seen.add(token);
          found.push(token);
        }
        match = pattern.exec(text);
      }
      return found.slice(0, 6);
    }

    /** Does this reply deserve the icon at all? */
    function worthExplaining(text) {
      const body = String(text ?? '').trim();
      if (body.length < QUALIFY.chars) return false;
      const sections = (body.match(/^\s{0,3}#{1,6}\s+/gm) || []).length;
      const bullets = (body.match(/^\s*(?:[-*+]|\d{1,2}[.)])\s+/gm) || []).length;
      return body.length >= QUALIFY.strongChars || sections >= QUALIFY.sections || bullets >= QUALIFY.bullets;
    }

    /* ------------------------------------------------------------------ *
     * The job
     * ------------------------------------------------------------------ */


    async function postJson(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const text = await response.text();
      let data = {};
      try {
        data = text === '' ? {} : JSON.parse(text);
      } catch {
        data = {};
      }
      if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
      if (data?.ok === false) throw new Error(data?.error ?? 'request failed');
      return data;
    }

    /* ------------------------------------------------------------------ *
     * The job: plan → draw → the model writes the page
     * ------------------------------------------------------------------ */

    const JOBS = new Map();
    const jobListeners = new Set();

    function notifyJobs() {
      for (const listener of jobListeners) listener();
    }

    function setJob(id, next) {
      JOBS.set(id, next);
      notifyJobs();
    }

    /** Rough cost of each blocking stage, used for the progress readout. */
    const STAGE_PLAN = {
      reading: { from: 0, to: 99, ms: 60_000 },
    };
    const STAGE_ORDER = ['reading'];

    /** Percent and remaining seconds for a running job, eased so it never stalls. */
    function jobProgress(job, now) {
      const stage = STAGE_PLAN[job.step] ?? STAGE_PLAN.reading;
      const elapsed = Math.max(0, now - (job.stageStartedAt ?? now));
      const eased = 1 - Math.exp(-elapsed / (stage.ms * 0.65));
      const percent = Math.min(stage.to, stage.from + (stage.to - stage.from) * eased);
      const index = Math.max(0, STAGE_ORDER.indexOf(job.step));
      let remain = Math.max(0, stage.ms - elapsed);
      for (const later of STAGE_ORDER.slice(index + 1)) remain += STAGE_PLAN[later].ms;
      return { percent, etaSeconds: Math.max(1, Math.round(remain / 1000)) };
    }

    async function runJob(messageId, text, meta = {}) {
      const current = JOBS.get(messageId);
      if (current !== undefined && current.status === 'running') return;
      const startedAt = Date.now();
      setJob(messageId, { status: 'running', step: 'reading', startedAt, stageStartedAt: startedAt });
      try {
        const built = await postJson('/dsh-reply-visualizer/build', {
          id: messageId,
          text: String(text ?? '').slice(0, 14000),
          sessionId: typeof meta.sessionId === 'string' ? meta.sessionId : '',
          sessionTitle: typeof meta.sessionTitle === 'string' ? meta.sessionTitle.slice(0, 120) : '',
        });
        setJob(messageId, { status: 'done', url: built.url, version: 0, finishedAt: Date.now() });
      } catch (error) {
        const message = String(error?.message ?? error);
        postJson('/dsh-reply-visualizer/diag', {
          stage: JOBS.get(messageId)?.step ?? 'unknown',
          error: message,
          messageId,
        }).catch(() => {});
        setJob(messageId, { status: 'error', error: message, finishedAt: Date.now() });
      }
    }

    function dismissJob(messageId) {
      JOBS.delete(messageId);
      notifyJobs();
    }


    /* ------------------------------------------------------------------ *
     * Reading replies out of the Chat snapshot
     * ------------------------------------------------------------------ */

    /** Prose of one settled assistant node, or '' for anything else. */
    function textOfNode(node) {
      if (node === null || node === undefined || node.kind !== 'assistant-step') return '';
      const data = node.data;
      if (data === undefined || data.finalNode === undefined) return '';
      const parts = [];
      for (const block of data.blocks ?? []) {
        if (block.kind === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
          parts.push(block.text);
        }
      }
      return parts.join('\n\n');
    }

    /**
     * Text of the reply the deck should explain: the message the icon was
     * pressed on, or the newest reply long enough to be worth breaking down.
     */
    function readMessageText(snapshot, messageId) {
      const nodes = snapshot?.nodes?.values?.();
      if (!nodes) return '';
      const list = Array.isArray(nodes) ? nodes : Array.from(nodes);
      if (messageId !== '') {
        for (const node of list) {
          if (node?.data?.finalNode?.messageId !== messageId) continue;
          return textOfNode(node);
        }
        return '';
      }
      for (let index = list.length - 1; index >= 0; index -= 1) {
        const text = textOfNode(list[index]);
        if (text !== '' && worthExplaining(text)) return text;
      }
      return '';
    }

    /* ------------------------------------------------------------------ *
     * Glyphs
     * ------------------------------------------------------------------ */

    function CardsGlyph({ size = 15 }) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        'aria-hidden': true,
        focusable: false,
      }, [
        h('rect', {
          key: 'back',
          x: 1.9, y: 3.1, width: 8.4, height: 6, rx: 1.6,
          stroke: 'currentColor', strokeWidth: 1.3, opacity: 0.55,
        }),
        h('rect', {
          key: 'front',
          x: 4.3, y: 8.1, width: 8.4, height: 6, rx: 1.6,
          stroke: 'currentColor', strokeWidth: 1.3,
        }),
        h('path', {
          key: 'spark',
          d: 'M13 2.3 L13.62 3.68 L15 4.3 L13.62 4.92 L13 6.3 L12.38 4.92 L11 4.3 L12.38 3.68 Z',
          fill: 'currentColor',
        }),
      ]);
    }

    function JobToaster(props) {
      const { openJob, t } = props;
      const [, setTick] = useState(0);
      useEffect(() => {
        const listener = () => setTick((value) => value + 1);
        jobListeners.add(listener);
        return () => {
          jobListeners.delete(listener);
        };
      }, []);

      const jobs = [...JOBS.entries()].map(([id, job]) => ({ id, ...job }));
      const running = jobs.some((job) => job.status === 'running');
      const finished = jobs.some((job) => job.status === 'done' || job.status === 'error');

      // Finished toasts retire on their own; the × is there for the rest.
      useEffect(() => {
        if (!finished) return undefined;
        const timer = setInterval(() => {
          const stamp = Date.now();
          for (const [key, job] of [...JOBS.entries()]) {
            const ended = Number(job.finishedAt) || 0;
            if ((job.status === 'done' || job.status === 'error') && ended > 0 && stamp - ended > 25_000) {
              dismissJob(key);
            }
          }
        }, 2000);
        return () => {
          clearInterval(timer);
        };
      }, [finished]);

      // Tick only while something is running, so idle panes cost nothing.
      useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => setTick((value) => value + 1), 500);
        return () => {
          clearInterval(timer);
        };
      }, [running]);

      if (jobs.length === 0) return null;
      const now = Date.now();

      return h('div', { className: 'rv-toasts' }, jobs.slice(0, 3).map((job) => {
        const busy = job.status === 'running';
        const progress = busy ? jobProgress(job, now) : null;
        const title = job.status === 'done'
          ? t('job.ready')
          : job.status === 'error'
            ? t('job.failed')
            : t(`job.${job.step ?? 'reading'}`);
        const sub = job.status === 'done'
          ? t('job.open')
          : job.status === 'error'
            ? String(job.error ?? '')
            : String(job.note ?? job.plan?.title ?? '');

        return h('div', {
          key: job.id,
          className: 'rv-toast',
          'data-status': job.status,
          title: sub,
        }, [
          h('button', {
            key: 'main',
            type: 'button',
            className: 'rv-toast-main',
            onClick: () => {
              if (job.status === 'done') {
                openJob(job.id);
                dismissJob(job.id);
              } else if (job.status === 'error') {
                dismissJob(job.id);
              }
            },
          }, [
            h('span', { key: 'dot', className: 'rv-toast-dot' }),
            h('span', { key: 'body', className: 'rv-toast-body' }, [
              h('span', { key: 'row', className: 'rv-toast-row' }, [
                h('span', { key: 'title', className: 'rv-toast-title' }, title),
                progress === null
                  ? null
                  : h('span', { key: 'meta', className: 'rv-toast-meta' }, `${Math.round(progress.percent)}% · ~${progress.etaSeconds}s`),
              ]),
              sub === '' ? null : h('span', { key: 'sub', className: 'rv-toast-sub' }, clip(sub, 64)),
              progress === null
                ? null
                : h('span', { key: 'bar', className: 'rv-toast-bar' }, h('span', {
                  key: 'fill',
                  className: 'rv-toast-fill',
                  style: { width: `${progress.percent}%` },
                })),
            ]),
          ]),
          h('button', {
            key: 'close',
            type: 'button',
            className: 'rv-toast-close',
            title: t('job.dismiss'),
            'aria-label': t('job.dismiss'),
            onClick: () => dismissJob(job.id),
          }, '\u00d7'),
        ]);
      }));
    }

    /* ------------------------------------------------------------------ *
     * Action
     * ------------------------------------------------------------------ */

    function ExplainerAction(props) {
      const { messageId, useChat, useSessions, sessionId, open, t } = props;
      const readable = typeof useChat === 'function';
      const text = readable
        ? useChat((snapshot) => readMessageText(snapshot, messageId))
        : '';
      const sessionTitle = typeof useSessions === 'function' && typeof sessionId === 'string'
        ? useSessions((state) => state?.byId?.[sessionId]?.title ?? '')
        : '';
      if (typeof text !== 'string' || !worthExplaining(text)) return null;
      const label = typeof t === 'function' ? t('action.open') : 'Explain this reply visually';
      return h('button', {
        type: 'button',
        className: 'rv-action',
        title: label,
        'aria-label': label,
        onClick: () => {
          if (typeof open === 'function') open(messageId, text, { sessionId, sessionTitle });
        },
      }, h(CardsGlyph, null));
    }

    /* ------------------------------------------------------------------ *
     * Left sidebar: the gallery of every page ever built
     * ------------------------------------------------------------------ */

    function GalleryIcon({ size = 20, active = false }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 64 64', fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      }, [
        h('rect', {
          key: 'back',
          x: 8, y: 12, width: 34, height: 24, rx: 5,
          stroke: 'currentColor', strokeWidth: 4, opacity: active ? 0.6 : 0.4,
        }),
        h('rect', {
          key: 'front',
          x: 20, y: 26, width: 36, height: 26, rx: 5,
          fill: active ? 'currentColor' : 'none',
          stroke: 'currentColor', strokeWidth: 4,
        }),
        h('path', {
          key: 'spark',
          d: 'M52 8 L54.4 14.6 L61 17 L54.4 19.4 L52 26 L49.6 19.4 L43 17 L49.6 14.6 Z',
          fill: 'currentColor',
        }),
      ]);
    }

    function GalleryPanel(props) {
      const { t } = props;
      const [pages, setPages] = useState([]);
      const [status, setStatus] = useState('loading');
      const [sessionId, setSessionId] = useState(null);
      const [openId, setOpenId] = useState(null);

      useEffect(() => {
        let alive = true;
        fetch('/dsh-reply-visualizer/index')
          .then((response) => response.json())
          .then((data) => {
            if (!alive) return;
            setPages(Array.isArray(data?.pages) ? data.pages : []);
            setStatus('ready');
          })
          .catch(() => {
            if (alive) setStatus('error');
          });
        return () => {
          alive = false;
        };
      }, []);

      // One group per chat. Pages built before chats were recorded fall into "".
      const groups = useMemo(() => {
        const map = new Map();
        for (const page of pages) {
          const key = typeof page.sessionId === 'string' && page.sessionId !== '' ? page.sessionId : '';
          if (!map.has(key)) map.set(key, { id: key, title: '', ts: 0, pages: [] });
          const group = map.get(key);
          group.pages.push(page);
          group.ts = Math.max(group.ts, Number(page.ts) || 0);
          if (group.title === '' && typeof page.sessionTitle === 'string' && page.sessionTitle.trim() !== '') {
            group.title = page.sessionTitle.trim();
          }
        }
        return [...map.values()]
          .map((group) => ({
            ...group,
            title: group.title === '' ? t('gallery.ungrouped') : group.title,
            pages: group.pages.sort((left, right) => (Number(right.ts) || 0) - (Number(left.ts) || 0)),
          }))
          .sort((left, right) => right.ts - left.ts);
      }, [pages, t]);

      const bar = (left, title, count) => h('header', { className: 'rv-gallery-bar' }, [
        left === null ? null : left,
        h('span', { key: 'title', className: 'rv-gallery-title' }, title),
        h('span', { key: 'count', className: 'rv-gallery-count' }, String(count)),
      ]);
      const back = (label, onClick) => h('button', {
        key: 'back',
        type: 'button',
        className: 'rv-ghost-button',
        onClick,
      }, label);

      // One page.
      if (openId !== null) {
        const open = pages.find((page) => page.id === openId);
        return h('div', { className: 'rv-viewer' }, [
          bar(back(t('gallery.back'), () => setOpenId(null)), String(open?.title ?? ''), ''),
          h('iframe', {
            key: openId,
            className: 'rv-viewer-frame',
            src: `/dsh-reply-visualizer/page/${openId}`,
            sandbox: 'allow-scripts',
            title: String(open?.title ?? ''),
          }),
        ]);
      }

      // One chat's pages.
      if (sessionId !== null) {
        const group = groups.find((entry) => entry.id === sessionId);
        return h('div', { className: 'rv-gallery' }, [
          bar(back(t('gallery.back'), () => setSessionId(null)), String(group?.title ?? ''), group?.pages.length ?? 0),
          h('div', { key: 'grid', className: 'rv-gallery-grid' }, (group?.pages ?? []).map((page) => h('button', {
            key: page.id,
            type: 'button',
            className: 'rv-gallery-card',
            onClick: () => setOpenId(page.id),
          }, [
            h('span', { key: 'title', className: 'rv-gallery-card-title' }, String(page.title ?? '') || t('panel.untitled')),
            h('span', { key: 'date', className: 'rv-gallery-card-date' }, new Date(Number(page.ts) || Date.now()).toLocaleDateString()),
          ]))),
        ]);
      }

      // Every chat.
      return h('div', { className: 'rv-gallery' }, [
        bar(null, t('gallery.title'), groups.length),
        status === 'error'
          ? h('div', { key: 'error', className: 'rv-gallery-empty' }, t('gallery.offline'))
          : null,
        status === 'ready' && groups.length === 0
          ? h('div', { key: 'none', className: 'rv-gallery-empty' }, t('gallery.empty'))
          : null,
        h('div', { key: 'list', className: 'rv-gallery-list' }, groups.map((group) => h('button', {
          key: group.id === '' ? 'ungrouped' : group.id,
          type: 'button',
          className: 'rv-gallery-card rv-gallery-session',
          onClick: () => setSessionId(group.id),
        }, [
          h('span', { key: 'title', className: 'rv-gallery-card-title' }, group.title),
          h('span', {
            key: 'meta',
            className: 'rv-gallery-card-date',
          }, `${group.pages.length} ${t('gallery.pages')} \u00b7 ${new Date(group.ts || Date.now()).toLocaleDateString()}`),
        ]))),
      ]);
    }


    /* ------------------------------------------------------------------ *
     * The pane
     * ------------------------------------------------------------------ */

    function ExplainerPanel(props) {
      const { useChat, useTabInfo, t } = props;
      const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
      const params = info?.tab?.navigation?.params;
      const messageId = typeof params?.messageId === 'string' ? params.messageId : '';
      const text = typeof useChat === 'function'
        ? useChat((snapshot) => readMessageText(snapshot, messageId))
        : '';

      const [pages, setPages] = useState([]);
      const [openId, setOpenId] = useState(null);
      const [, setTick] = useState(0);

      const job = JOBS.get(messageId);
      const jobState = job?.status ?? 'idle';
      const jobVersion = job?.version ?? 0;

      useEffect(() => {
        const listener = () => setTick((value) => value + 1);
        jobListeners.add(listener);
        return () => {
          jobListeners.delete(listener);
        };
      }, []);

      // The index is the durable answer to "which pages exist"; refetch it
      // whenever a job moves, so a finished page appears without a reload.
      useEffect(() => {
        let alive = true;
        fetch('/dsh-reply-visualizer/index')
          .then((response) => response.json())
          .then((data) => {
            if (alive && Array.isArray(data?.pages)) setPages(data.pages);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [jobState, jobVersion]);

      const showId = openId ?? messageId;
      const live = JOBS.get(showId);
      const known = (live !== undefined && live.status === 'done')
        || pages.some((page) => page.id === showId);

      if (known) {
        return h('div', { className: 'rv-page' }, h('iframe', {
          key: `frame-${showId}-${live?.version ?? 0}`,
          className: 'rv-frame',
          src: `/dsh-reply-visualizer/page/${showId}`,
          title: t('panel.title'),
          sandbox: 'allow-scripts',
        }));
      }

      const recent = pages.filter((page) => page.id !== showId);
      const canDraw = typeof text === 'string' && text !== '' && jobState !== 'running';

      return h('div', { className: 'rv-pane' }, [
        h('header', { key: 'head', className: 'rv-header' }, [
          h('div', { key: 'titlebar', className: 'rv-titlebar' }, [
            h('span', { key: 'title', className: 'rv-panel-title' }, t('panel.title')),
            openId === null ? null : h('button', {
              key: 'back',
              type: 'button',
              className: 'rv-tab',
              onClick: () => setOpenId(null),
            }, t('panel.current')),
          ]),
        ]),
        h('div', { key: 'empty', className: 'rv-empty' }, [
          h('span', { key: 'icon', className: 'rv-empty-icon' }, h(CardsGlyph, { size: 30 })),
          h('div', { key: 'title', className: 'rv-empty-title' }, t('panel.empty')),
          h('div', { key: 'hint', className: 'rv-empty-hint' }, t('panel.emptyHint')),
          canDraw ? h('button', {
            key: 'draw',
            type: 'button',
            className: 'rv-ghost-button rv-draw',
            onClick: () => {
              void runJob(messageId, text);
            },
          }, t('panel.draw')) : null,
        ]),
        recent.length === 0 ? null : h('div', { key: 'recent', className: 'rv-recent' }, [
          h('div', { key: 'label', className: 'rv-recent-label' }, t('panel.recent')),
          ...recent.slice(0, 20).map((page) => h('button', {
            key: page.id,
            type: 'button',
            className: 'rv-recent-item',
            onClick: () => setOpenId(page.id),
          }, [
            h('span', { key: 'title', className: 'rv-recent-title' }, String(page.title ?? '') || t('panel.untitled')),
            h('span', { key: 'date', className: 'rv-recent-date' }, new Date(Number(page.ts) || Date.now()).toLocaleDateString()),
          ])),
        ]),
      ]);
    }

    /* ------------------------------------------------------------------ *
     * Styles
     * ------------------------------------------------------------------ */

    const CSS = [
      '.rv-action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));border-radius:8px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:6px;display:inline-flex;transition:background-color .14s,color .14s,transform .14s}',
      '.rv-draw{margin-top:10px}',
      '.rv-ghost-button{border:1px solid var(--dsw-alias-border-l1);background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:3px 10px;border-radius:7px;cursor:pointer;transition:background-color .14s,color .14s}',
      '.rv-ghost-button:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.rv-recent{display:flex;flex-direction:column;gap:2px;padding:10px 14px 16px;border-top:1px solid var(--dsw-alias-border-l1);max-height:46%;overflow-y:auto}',
      '.rv-recent-label{margin-bottom:6px;font-size:10.5px;line-height:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.rv-recent-item{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:6px 8px;border:none;border-radius:7px;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer;transition:background-color .14s}',
      '.rv-recent-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.rv-recent-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.rv-recent-date{flex:none;font-size:10.5px;line-height:14px;color:var(--dsw-alias-label-secondary)}',
      '.rv-gallery{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}',
      '.rv-gallery-bar{display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.rv-gallery-title{flex:1;min-width:0;font-size:13px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.rv-gallery-count{flex:none;font-size:11px;line-height:14px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.rv-gallery-empty{padding:26px 20px;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary)}',
      '.rv-gallery-grid{flex:1 1 auto;min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:16px 20px 24px;align-content:start}',
      '.rv-gallery-card{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .14s,transform .14s}',
      '.rv-gallery-card:hover{border-color:var(--dsw-alias-brand-primary);transform:translateY(-1px)}',
      '.rv-gallery-card-title{font-size:13px;line-height:19px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.rv-gallery-card-date{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}',
      '.rv-gallery-list{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:16px 20px 24px}',
      '.rv-gallery-session{flex-direction:column;gap:3px}',
      '.rv-viewer{display:flex;flex-direction:column;height:100%;min-height:0}',
      '.rv-viewer-frame{flex:1 1 auto;width:100%;border:0;background:#f6f1e8}',
      '.rv-page{position:relative;flex:1 1 auto;min-height:0;display:flex;background:#f6f1e8}',
      '.rv-frame{flex:1 1 auto;width:100%;height:100%;border:0;display:block;background:#f6f1e8}',
      '.rv-toasts{position:fixed;right:20px;bottom:22px;top:auto;z-index:80;display:flex;flex-direction:column;gap:8px;pointer-events:auto}',
      '.rv-toast{display:flex;align-items:stretch;max-width:340px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 30px rgb(0 0 0 / .18);overflow:hidden;animation:rv-toast-in .3s cubic-bezier(.2,.8,.2,1) both;transition:transform .14s,border-color .14s}',
      '.rv-toast:hover{transform:translateY(-1px)}',
      '.rv-toast-main{display:flex;align-items:center;gap:9px;flex:1 1 auto;min-width:0;padding:9px 4px 9px 12px;border:none;background:0 0;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.rv-toast-close{flex:none;padding:0 10px;border:none;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:15px;line-height:1;cursor:pointer;transition:background-color .14s,color .14s}',
      '.rv-toast-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.rv-toast[data-status="done"]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,var(--dsw-alias-border-l1))}',
      '.rv-toast[data-status="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,var(--dsw-alias-border-l1))}',
      '.rv-toast-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);animation:rv-think 1.4s ease-in-out infinite}',
      '.rv-toast[data-status="done"] .rv-toast-dot{background:var(--dsw-alias-state-success-primary);animation:none}',
      '.rv-toast[data-status="error"] .rv-toast-dot{background:var(--dsw-alias-state-error-primary);animation:none}',
      '.rv-toast-body{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '.rv-toast-row{display:flex;align-items:baseline;gap:8px;justify-content:space-between}',
      '.rv-toast-title{font-size:12px;line-height:17px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.rv-toast-meta{flex:none;font-size:10.5px;line-height:14px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.rv-toast-bar{display:block;height:3px;margin-top:5px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.rv-toast-fill{display:block;height:100%;border-radius:2px;background:linear-gradient(90deg,var(--rv-a),var(--rv-b));transition:width .5s linear}',
      '.rv-toast-sub{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '@keyframes rv-toast-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}',
      '.rv-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);transform:translateY(-1px)}',
      '.rv-action:active{transform:translateY(0)}',
      '.rv-action:focus-visible{outline:2px solid var(--rv-a);outline-offset:1px}',
      '.rv-pane{--rv-a:#7dd3fc;--rv-b:#a78bfa;--rv-c:#f472b6;position:relative;box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;flex:1 1 auto;overflow:hidden;isolation:isolate}',
      '.rv-header{position:relative;z-index:2;display:flex;align-items:center;gap:10px;padding:11px 14px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-base) 82%,transparent);backdrop-filter:blur(8px)}',
      '.rv-titlebar{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1}',
      '.rv-panel-title{flex:none;font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '@keyframes rv-think{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}',
      '.rv-tab{border:1px solid var(--dsw-alias-border-l1);background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:17px;padding:2px 9px;border-radius:7px;cursor:pointer;transition:background-color .14s,color .14s}',
      '.rv-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.rv-empty{position:relative;z-index:1;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px 20px;text-align:center}',
      '.rv-empty-icon{color:var(--rv-a);opacity:.9;animation:rv-float 3.6s ease-in-out infinite}',
      '.rv-empty-title{font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.rv-empty-hint{max-width:240px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '@keyframes rv-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
      '@media (prefers-reduced-motion:reduce){.rv-toast,.rv-toast-dot,.rv-empty-icon{animation:none!important}}',
    ].join('\n');

    const STYLE_ID = 'dsh-reply-visualizer/client.css';

    /* ------------------------------------------------------------------ *
     * Client plugin body
     * ------------------------------------------------------------------ */

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, 'en', en), 'reply-visualizer: en dictionary');
      ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'reply-visualizer: zh dictionary');

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {};
        const existing = document.querySelector(`style[data-reply-visualizer="${STYLE_ID}"]`);
        const tag = existing ?? document.createElement('style');
        tag.dataset.replyVisualizer = STYLE_ID;
        tag.textContent = CSS;
        if (existing === null) document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'reply-visualizer: styles');

      const translate = (key) => {
        try {
          const value = ctx.locale.bind(NS)(key);
          if (typeof value === 'string' && value !== '' && value !== key) return value;
        } catch {
          /* fall back to the English dictionary */
        }
        return en[key] ?? key;
      };

      const tabs = ctx.get('sidebarRightTabs');
      const sidebar = ctx.get('sidebarRight');

      const openExplainer = (messageId) => {
        if (!sidebar || typeof sidebar.openTab !== 'function') return;
        try {
          sidebar.openTab(KIND, { params: { messageId } });
        } catch (failure) {
          console.error('reply-visualizer: cannot open the right Sidebar tab', failure);
        }
      };

      if (tabs && typeof tabs.register === 'function') {
        ctx.effect(() => tabs.register({
          id: TYPE_ID,
          kind: KIND,
          keepMounted: true,
          // One tab per explanation: a second open must not navigate the tab
          // already on screen, which is what made switching feel broken.
          multiple: true,
          title: () => translate('panel.title'),
          guide: [{
            id: 'reply-visualizer',
            order: 45,
            title: () => translate('guide.title'),
            description: () => translate('guide.description'),
          }],
        }), 'reply-visualizer: tab type');

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TYPE_ID,
          locale: NS,
        }, ExplainerPanel)), 'reply-visualizer: tab body');
      }

      ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'reply-visualizer',
        order: 20,
        locale: NS,
        inject: () => ({ open: runJob }),
      }, ExplainerAction));

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'reply-visualizer-toast',
        order: 50,
        locale: NS,
        inject: () => ({ openJob: openExplainer }),
      }, JobToaster));

      // A left-sidebar icon and its full page: the gallery of everything built.
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'reply-visualizer',
        order: 45,
        label: () => translate('gallery.title'),
      }, GalleryIcon));

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'reply-visualizer',
        locale: NS,
      }, GalleryPanel));
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
      apply,
    };
  },
});
