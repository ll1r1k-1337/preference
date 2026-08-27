/**
 * Приёмка ПРОДАКШЕН-СБОРКИ: играем полную пулю кликами по DOM внутри
 * собранного `dist/assets/*.js` — того самого файла, который уедет в браузер.
 *
 * Это не дубль `src/ui/__tests__/ui-e2e.test.ts`: тот грузит ИСХОДНИКИ через
 * vitest. Здесь проверяется артефакт ПОСЛЕ vite build — то есть что в бандл
 * попал настоящий бот (`src/bot`), а не заглушка, и что ничего не отвалилось
 * при tree-shaking и минификации.
 *
 * Тест пропускает сам себя, если `dist/` не собран: `npm run build` сначала.
 *
 * @vitest-environment happy-dom
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DIST = join(process.cwd(), 'dist');
const ASSETS = join(DIST, 'assets');
const built = existsSync(ASSETS) && readdirSync(ASSETS).some((f) => f.endsWith('.js'));

/** Строки, которые есть ТОЛЬКО в настоящем боте src/bot — заглушка их не содержит. */
const BOT_MARKERS = [
  'Пустой список',
  'Фаза PLAY без состояния розыгрыша',
  'Раздача окончена: ходов больше нет',
];

function readBundle(): string {
  const name = readdirSync(ASSETS).find((f) => f.endsWith('.js'))!;
  return readFileSync(join(ASSETS, name), 'utf8');
}

const text = (): string => document.getElementById('app')?.textContent ?? '';

const buttons = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('#app button'));

const findButton = (label: string): HTMLButtonElement | null =>
  buttons().find((b) => b.textContent?.trim() === label && !b.disabled) ?? null;

function click(label: string): boolean {
  const b = findButton(label);
  if (b === null) return false;
  b.click();
  return true;
}

function clickPlayableCard(): boolean {
  const card = document.querySelector<HTMLButtonElement>(
    '#app .hand button.card.legal:not(:disabled)',
  );
  if (card === null) return false;
  card.click();
  return true;
}

function doDiscard(): boolean {
  if (!text().includes('Выберите ровно две карты')) return false;
  const cards = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#app .hand button.card:not(:disabled)'),
  );
  if (cards.length < 2) return false;
  cards[0]!.click();
  cards[1]!.click();
  return click('Снести');
}

const inBidding = (): boolean => findButton('Пас') !== null;
let biddenThisDeal = false;

/** Один шаг человека: делаем ровно то, что предлагает интерфейс. */
function humanStep(): boolean {
  if (click('Записать и сдать дальше')) return true;
  if (click('Взять прикуп')) return true;
  if (doDiscard()) return true;
  if (clickPlayableCard()) return true;

  const bid = document.querySelector<HTMLButtonElement>('#app .bids button:not(:disabled)');
  if (bid !== null) {
    if (!inBidding()) { bid.click(); return true; }
    if (!biddenThisDeal) { biddenThisDeal = true; bid.click(); return true; }
  }
  if (click('Вист (втёмную)')) return true;
  if (click('Пас')) return true;
  return false;
}

function humanCanAct(): boolean {
  return (
    findButton('Пас') !== null ||
    findButton('Записать и сдать дальше') !== null ||
    findButton('Взять прикуп') !== null ||
    findButton('Снести') !== null ||
    findButton('Вист (втёмную)') !== null ||
    document.querySelector('#app .hand button.card.legal:not(:disabled)') !== null ||
    document.querySelector('#app .bids button:not(:disabled)') !== null
  );
}

/** Время виртуальное: иначе полная пуля упирается в паузы между ходами ботов. */
async function runBots(maxTicks = 200): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    const before = text();
    await vi.advanceTimersByTimeAsync(600);
    if (humanCanAct()) return;
    if (text() === before && i > 4) return;
  }
}

describe.skipIf(!built)('продакшен-сборка dist/', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    biddenThisDeal = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('в бандл попал настоящий бот src/bot, а не заглушка', () => {
    const bundle = readBundle();
    for (const marker of BOT_MARKERS) expect(bundle).toContain(marker);
  });

  it('собранный index.html подключает бандл и содержит выбор соперников', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(html).toMatch(/assets\/index-[\w-]+\.js/);
    expect(html).toContain('bot-level');
    expect(html).toContain('pool-target');
  });

  it('полная пуля играется кликами внутри собранного бандла', async () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    // Разметка из собранного index.html; <script> выполняем сами, ниже.
    document.body.innerHTML = html
      .replace(/[\s\S]*?<body[^>]*>/, '')
      .replace(/<\/body>[\s\S]*/, '')
      .replace(/<script[\s\S]*?<\/script>/g, '');
    localStorage.clear();

    // Короткая пуля и обычный уровень — приёмка должна быть быстрой, но полной.
    (document.getElementById('pool-target') as HTMLSelectElement).value = '4';
    (document.getElementById('bot-level') as HTMLSelectElement).value = 'normal';

    const errors: string[] = [];
    window.addEventListener('error', (e) => errors.push(String((e as ErrorEvent).message)));

    // Выполняем ПРОДАКШЕН-бандл.
    // eslint-disable-next-line no-eval
    (0, eval)(readBundle());

    expect(document.getElementById('app')?.textContent ?? '').not.toBe('');

    // Признак закрытой пули — строка итогового пересчёта §9.9.
    // ВАЖНО: искать «Итог» в тексте нельзя — подпись фазы «Итог раздачи» и
    // строка «Итого» есть на экране всегда, и условие выполняется на нулевом
    // шаге (проверено: тест проходил, не сделав ни одного клика).
    const poolClosed = (): boolean =>
      document.querySelector('#app table.sheet tr.final') !== null;

    let steps = 0;
    for (let i = 0; i < 3000; i += 1) {
      if (poolClosed()) break;
      steps += 1;
      if (!humanStep()) await runBots();
      else await vi.advanceTimersByTimeAsync(600);
    }

    expect(errors).toEqual([]);
    // Приёмка обязана быть непустой: пуля закрывается настоящими кликами.
    expect(steps).toBeGreaterThan(50);
    expect(poolClosed()).toBe(true);
    expect(text()).toContain('Пуля закрыта');
    expect(text()).toContain('Пересчёт §9.9');
    // 3 раздачи + строка «Итого» в первой таблице листа.
    const sheetRows = document.querySelectorAll('#app table.sheet tbody tr').length;
    expect(sheetRows).toBeGreaterThanOrEqual(4);
    // Итоговая роспись §9.9 — сумма ровно ноль.
    const finalCells = Array.from(
      document.querySelectorAll('#app table.sheet tr.final td:not(.label)'),
    ).map((td) => Number.parseInt(td.textContent ?? '0', 10));
    expect(finalCells).toHaveLength(3);
    expect(finalCells.reduce((a, b) => a + b, 0)).toBe(0);
  }, 120_000);
});
