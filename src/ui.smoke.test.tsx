/**
 * Интеграционный смоук-тест UI: приложение монтируется в jsdom, матч
 * запускается кликом по кнопке и первые ходы должны реально произойти
 * на локальном движке (без сети и без API-ключей).
 *
 * Запуск: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('лобби монтируется и матч стартует на локальном движке', async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'http://localhost:3000/?ai=local', pretendToBeVisual: true }
  );

  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  Object.defineProperty(g, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id: any) => clearTimeout(id);
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // В jsdom нет AudioContext — звук должен молча отключаться.
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};

  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const App = (await import('../src/App')).default;

  const root = createRoot(document.getElementById('root')!);
  await React.act(async () => {
    root.render(React.createElement(App));
  });

  const lobbyText = document.body.textContent || '';
  assert.match(lobbyText, /БИТВА ИИ В МАФИЮ/, 'лобби должно отрисоваться');

  const startButton = Array.from(document.querySelectorAll('button')).find((b) =>
    /ЗАПУСТИТЬ БИТВУ ИИ|ВОЙТИ В ИГРУ/.test(b.textContent || '')
  );
  assert.ok(startButton, 'кнопка старта матча должна существовать');

  await React.act(async () => {
    startButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });

  // Даём симуляции прокрутить Ночь 1 (локальный движок отвечает мгновенно).
  await React.act(async () => {
    await sleep(4000);
  });

  const gameText = document.body.textContent || '';
  assert.doesNotMatch(gameText, /БИТВА ИИ В МАФИЮ/, 'после старта должен открыться игровой экран');
  assert.match(gameText, /Ночь|День|Голосование|Спецсводка/i, 'фазы партии должны отображаться');

  // Признак того, что боты действительно «думают»: в ленте есть реплики игроков.
  const bubbles = document.querySelectorAll('main .group');
  assert.ok(bubbles.length > 0, 'в ленте должны появиться сообщения');

  await React.act(async () => {
    root.unmount();
  });
  dom.window.close();
});
