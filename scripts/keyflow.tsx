/**
 * Проверка сценария «ключ Yukino вставляется в интерфейсе».
 * Запуск: node --import tsx scripts/keyflow.tsx
 */
import { JSDOM } from 'jsdom';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
});
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.localStorage = dom.window.localStorage;
g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 16);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const keys = await import('../src/services/keys');
const App = (await import('../src/App')).default;

/* 1. Модуль хранения ключа */
keys.setYukinoKey('  sk-yuk-TESTKEY-123456  ');
check('ключ сохраняется и обрезается от пробелов', keys.getYukinoKey() === 'sk-yuk-TESTKEY-123456');
check('hasYukinoKey() = true', keys.hasYukinoKey());
check('маска не раскрывает ключ целиком', keys.maskKey(keys.getYukinoKey()).includes('…'));
keys.clearYukinoKey();
check('ключ удаляется', keys.getYukinoKey() === '' && !keys.hasYukinoKey());

/* 2. Лобби содержит панель ввода ключа */
const root = createRoot(document.getElementById('root')!);
await React.act(async () => root.render(React.createElement(App)));

const lobbyText = document.body.textContent || '';
check('в лобби есть раздел «API-ключ Yukino»', /API-ключ Yukino/.test(lobbyText));

const keyInput = Array.from(document.querySelectorAll('input')).find((i) =>
  /Ключ|ключ/.test(i.placeholder || '')
);
check('есть поле для вставки ключа', !!keyInput);
check('поле скрывает ключ (type=password)', keyInput?.getAttribute('type') === 'password');

/* 3. Старт партии без ключа → пауза понятным текстом */
const startBtn = Array.from(document.querySelectorAll('button')).find((b) =>
  /ЗАПУСТИТЬ БИТВУ ИИ|ВОЙТИ В ИГРУ/.test(b.textContent || '')
);
check('кнопка старта найдена', !!startBtn);
await React.act(async () => {
  startBtn!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
});

await React.act(async () => {
  await sleep(2500);
});

const pausedText = document.body.textContent || '';
check('партия предупреждает об отсутствии ключа', /Ключ Yukino не задан/.test(pausedText));
check('показан баннер «Нужен ключ Yukino»', /Нужен ключ Yukino/.test(pausedText));

const quickInput = Array.from(document.querySelectorAll('input')).find((i) =>
  /Вставьте ключ/.test(i.placeholder || '')
);
check('в паузе есть поле быстрой вставки ключа', !!quickInput);

await React.act(async () => root.unmount());
dom.window.close();

console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('OK')).length}/${results.length} проверок пройдено`);
