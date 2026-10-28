/**
 * Хранилище API-ключей, которые пользователь вводит сам.
 *
 * Ключ Yukino больше НЕ хранится в коде и НЕ передаётся из серверного окружения:
 * его вставляет пользователь в интерфейсе (лобби → «API-ключ Yukino»).
 * Лежит он только в localStorage браузера — на сервере не сохраняется.
 */

const STORAGE_KEY = 'yukino_api_key';
const CHANGE_EVENT = 'yukino-key-changed';

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Приватный режим / запрет cookies — работаем без сохранения.
    return null;
  }
}

/** Текущий ключ Yukino (пустая строка, если не задан). */
export function getYukinoKey(): string {
  const storage = safeStorage();
  if (!storage) return '';
  try {
    return (storage.getItem(STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function hasYukinoKey(): boolean {
  return getYukinoKey().length > 0;
}

/** Сохраняет ключ. Пустая строка — то же самое, что удалить. */
export function setYukinoKey(rawKey: string): void {
  const storage = safeStorage();
  const key = (rawKey || '').trim();
  try {
    if (!key) {
      storage?.removeItem(STORAGE_KEY);
    } else {
      storage?.setItem(STORAGE_KEY, key);
    }
  } catch {
    // Игнорируем ошибки квоты/приватного режима — ключ просто не переживёт перезагрузку.
  }
  notifyChange();
}

export function clearYukinoKey(): void {
  setYukinoKey('');
}

/** Короткое безопасное представление ключа для UI: «sk-…c3ab». */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return `${key.slice(0, 3)}…`;
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}

function notifyChange(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* no-op */
  }
}

/** Подписка на изменение ключа (например, чтобы обновить бейдж в шапке). */
export function onYukinoKeyChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
