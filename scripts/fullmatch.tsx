import { JSDOM } from 'jsdom';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/?ai=local',
  pretendToBeVisual: true,
});
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 16);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const errors: string[] = [];
dom.window.addEventListener('error', (e: any) => errors.push(String(e.message)));
process.on('uncaughtException', (e) => errors.push(String(e)));
process.on('unhandledRejection', (e: any) => errors.push(String(e)));

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const App = (await import('../src/App')).default;

const root = createRoot(document.getElementById('root')!);
await React.act(async () => root.render(React.createElement(App)));

const clickByText = async (re: RegExp) => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => re.test(b.textContent || ''));
  if (!btn) return false;
  await React.act(async () => btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  return true;
};

await clickByText(/ЗАПУСТИТЬ БИТВУ ИИ/);
// ускорение 1x -> 2x -> 4x
await clickByText(/^1x$/);
await clickByText(/^2x$/);

const started = Date.now();
let finished = false;
while (Date.now() - started < 170000) {
  await React.act(async () => { await sleep(1000); });
  const text = document.body.textContent || '';
  if (/ПОБЕДА (МАФИИ|ГОРОДА)/.test(text)) { finished = true; break; }
}
const text = document.body.textContent || '';
const dayMatches = text.match(/День \d+/g) || [];
console.log('finished:', finished, 'elapsedSec:', ((Date.now() - started) / 1000).toFixed(1));
console.log('errors:', errors.slice(0, 5));
console.log('messages:', document.querySelectorAll('main .group').length);
console.log('day markers:', [...new Set(dayMatches)].slice(0, 12).join(', '));
const bubbles = Array.from(document.querySelectorAll('main .group')).map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim());
console.log('--- sample messages ---');
bubbles.slice(0, 14).forEach((b, i) => console.log(i, b.slice(0, 220)));
const win = text.match(/ПОБЕДА [А-Я!]+/);
console.log('winner:', win?.[0]);
await React.act(async () => root.unmount());
dom.window.close();
