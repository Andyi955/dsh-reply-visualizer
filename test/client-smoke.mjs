/**
 * Runtime smoke test for the browser half.
 *
 * Syntax checking cannot catch a deleted function that is still referenced —
 * that is exactly how the icon disappeared. This loads the real module with a
 * stubbed React and actually invokes every registered component and inject
 * factory, so a dangling reference fails here instead of blanking the slot.
 */
import { readFileSync } from 'node:fs';

let factory = null;
globalThis.window = {
  __ModuleLoader__: {
    load({ factory: loaded }) {
      factory = loaded;
    },
  },
};

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (compute) => compute(),
  useRef: (initial) => ({ current: initial }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

const requireStub = (name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require("${name}")`);
};

// Load the module text, then evaluate it with our loader shim in place.
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
new Function('window', 'require', `${source}\n`)(globalThis.window, requireStub);

if (factory === null) throw new Error('the module never registered its factory');

const plugin = factory(requireStub);
if (typeof plugin.apply !== 'function') throw new Error('the module exports no apply()');

let failures = 0;
const check = (name, condition, extra) => {
  if (condition) return;
  failures += 1;
  console.log(`FAIL ${name}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`);
};

const registrations = [];
const ctx = {
  effect(fn) {
    const dispose = fn();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  inject() {},
  get(name) {
    if (name === 'sidebarRightTabs') return { register: () => () => {} };
    if (name === 'sidebarRight') return { openTab: () => {} };
    return undefined;
  },
  slots: {
    inject(_slot, callback) {
      callback();
    },
    register(entry, Component) {
      registrations.push({ entry, Component });
      return () => {};
    },
  },
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
  },
};

plugin.apply(ctx);

check('five slots registered', registrations.length === 5, registrations.map((r) => r.entry.id ?? r.entry.key));
check('injects the sidebar services', Array.isArray(plugin.inject) && plugin.inject.includes('slots'), plugin.inject);

const t = (key) => key;
const noop = () => {};

for (const { entry, Component } of registrations) {
  check(`${entry.id ?? entry.key} has a component`, typeof Component === 'function');
  // Inject factories run at render time; a missing function throws right here.
  if (typeof entry.inject === 'function') {
    try {
      const injected = entry.inject('session-1');
      check(`${entry.id ?? entry.key} inject returns an object`, injected !== null && typeof injected === 'object');
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${entry.id ?? entry.key} inject threw :: ${error.message}`);
    }
  }
}

const action = registrations.find((r) => r.entry.id === 'reply-visualizer');
const toaster = registrations.find((r) => r.entry.id === 'reply-visualizer-toast');

const emptyChat = (selector) => selector({ nodes: { values: () => [] } });

try {
  const rendered = action.Component({ messageId: 'm1', useChat: emptyChat, open: noop, t });
  check('action renders nothing without a reply', rendered === null, rendered);
} catch (error) {
  failures += 1;
  console.log(`FAIL action crashed :: ${error.message}`);
}

try {
  const rendered = toaster.Component({ openJob: noop, t });
  check('toaster renders nothing with no jobs', rendered === null, rendered);
} catch (error) {
  failures += 1;
  console.log(`FAIL toaster crashed :: ${error.message}`);
}

const panel = registrations.find((r) => r.entry.key === 'dsh-reply-visualizer');
const galleryIcon = registrations.find((r) => r.entry.id === 'reply-visualizer' && r.entry.name === 'sidebar.panellist');
const galleryPage = registrations.find((r) => r.entry.key === 'reply-visualizer');

try {
  const rendered = galleryIcon.Component({ size: 20, active: false });
  check('gallery icon renders', rendered !== null && rendered !== undefined);
} catch (error) {
  failures += 1;
  console.log(`FAIL gallery icon crashed :: ${error.message}`);
}

try {
  const rendered = galleryPage.Component({ t });
  check('gallery page renders', rendered !== null && rendered !== undefined);
} catch (error) {
  failures += 1;
  console.log(`FAIL gallery page crashed :: ${error.message}`);
}
try {
  const rendered = panel.Component({
    useChat: () => '',
    useTabInfo: () => ({ tab: { navigation: { params: {} } } }),
    t,
  });
  check('panel renders its empty state', rendered !== null && rendered !== undefined);
} catch (error) {
  failures += 1;
  console.log(`FAIL panel crashed :: ${error.message}`);
}

try {
  const text = 'Quantum immortality is what many-worlds looks like from the inside. '.repeat(12);
  const rendered = panel.Component({
    useChat: (selector) => selector({ nodes: { values: () => [] } }),
    useTabInfo: () => ({ tab: { navigation: { params: { messageId: 'm1' } } } }),
    t,
  });
  check('panel renders with a message id but no chat text', rendered !== null && rendered !== undefined, text.length);
} catch (error) {
  failures += 1;
  console.log(`FAIL panel crashed with params :: ${error.message}`);
}

console.log(failures === 0 ? 'ALL CLIENT SMOKE CHECKS PASSED' : `${failures} CLIENT CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
