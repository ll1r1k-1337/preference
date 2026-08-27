/**
 * Сквозная приёмка UI: полная пуля от раздачи до итогового пересчёта
 * **через настоящий интерфейс** — клики по тем же DOM-узлам, что видит человек.
 *
 * Тест не вызывает движок напрямую: он находит кнопку/карту в отрисованном
 * дереве и кликает. Если действие недоступно в UI — сыграть его нельзя,
 * ровно как у живого игрока.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUMAN } from '../../game/session.js';

/** Стратегия человека в торговле: пасовать или заявляться. */
type Style = 'passive' | 'bidder';

/**
 * Загрузить приложение в свежий DOM.
 * `poolTarget` выставляется в шапке ДО старта — так же, как это делает человек.
 */
async function boot(poolTarget = 10): Promise<void> {
  document.body.innerHTML = `
    <header>
      <select id="pool-target"><option value="${poolTarget}" selected>${poolTarget}</option></select>
      <button type="button" id="rules-btn">Правила</button>
      <button type="button" id="new-party">Новая пуля</button>
    </header>
    <div id="app"></div>
    <dialog id="rules"><div class="rules-body"></div><button id="rules-close"></button></dialog>`;
  localStorage.clear();
  // main.ts исполняется как модуль: побочный эффект — первая отрисовка.
  // resetModules нужен, чтобы каждый тест получал свежую сессию.
  vi.resetModules();
  await import('../../main.js');
  if (document.getElementById('app') === null) throw new Error('нет #app');
}

const text = (): string => document.getElementById('app')?.textContent ?? '';

const buttons = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('#app button'));

/** Найти доступную кнопку по точному тексту. */
function findButton(label: string): HTMLButtonElement | null {
  return buttons().find((b) => b.textContent?.trim() === label && !b.disabled) ?? null;
}

function click(label: string): boolean {
  const button = findButton(label);
  if (button === null) return false;
  button.click();
  return true;
}

/** Кликнуть первую доступную (подсвеченную движком) карту руки. */
function clickPlayableCard(): boolean {
  const card = document.querySelector<HTMLButtonElement>('#app .hand button.card.legal:not(:disabled)');
  if (card === null) return false;
  card.click();
  return true;
}

/** Выбрать две карты на снос и подтвердить. */
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

/** Идёт ли сейчас торговля (в ней есть кнопка «Пас», в заказе её нет). */
const inBidding = (): boolean => findButton('Пас') !== null;

/**
 * Один шаг человека: делаем то, что предлагает интерфейс.
 * Порядок проверок = порядок фаз; ничего не «додумываем» за UI.
 */
function humanStep(style: Style): boolean {
  if (click('Записать и сдать дальше')) return true;
  if (click('Взять прикуп')) return true;
  if (doDiscard()) return true;
  if (clickPlayableCard()) return true;

  const bid = document.querySelector<HTMLButtonElement>('#app .bids button:not(:disabled)');
  if (bid !== null) {
    // В торговле «bidder» заявляет минимум один раз за раздачу и потом пасует,
    // иначе он бесконечно перебивает сам себя. В фазе окончательного заказа
    // паса нет — там кликаем всегда.
    if (!inBidding()) { bid.click(); return true; }
    if (style === 'bidder' && !biddenThisDeal) { biddenThisDeal = true; bid.click(); return true; }
  }
  if (click('Вист (втёмную)')) return true;
  if (click('Пас')) return true;
  return false;
}

let biddenThisDeal = false;

/** Есть ли сейчас на экране хоть одно доступное человеку действие? */
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

/**
 * Прокрутить ходы ботов, пока очередь не вернётся к человеку.
 * Время виртуальное (fake timers), иначе полная пуля упирается в реальные
 * паузы между ходами ботов и тест длится минуты.
 */
async function runBots(maxTicks = 200): Promise<void> {
  for (let i = 0; i < maxTicks; i += 1) {
    const before = text();
    await vi.advanceTimersByTimeAsync(600);
    if (humanCanAct()) return;
    if (text() === before && i > 4) return;
  }
}

/** Играть, пока не выполнится условие или не кончится бюджет шагов. */
async function playUntil(done: () => boolean, style: Style, budget = 3000): Promise<void> {
  let dealsSeen = 0;
  for (let i = 0; i < budget; i += 1) {
    if (done()) return;
    // Сброс флага заявки при переходе к новой раздаче.
    const rows = document.querySelectorAll('#app table.sheet tbody tr').length;
    if (rows !== dealsSeen) { dealsSeen = rows; biddenThisDeal = false; }
    if (!humanStep(style)) await runBots();
    else await vi.advanceTimersByTimeAsync(600);
  }
}

describe('UI: полная пуля через интерфейс', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    localStorage.clear();
    biddenThisDeal = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('стол, торговля и лист записи отрисованы с самого начала', async () => {
    await boot();
    expect(text()).toContain('Стол');
    expect(text()).toContain('Лист записи');
    expect(text()).toContain('История ходов');
    expect(text()).toContain('Ваши карты');
    expect(text()).toContain('Вы');
    expect(text()).toContain('Бот А');
    expect(text()).toContain('Бот Б');
  });

  it('человеку раздано 10 карт', async () => {
    await boot();
    expect(document.querySelectorAll('#app .hand button.card').length).toBe(10);
  });

  it('в UI подсвечены только легальные ходы, остальные карты заблокированы', async () => {
    await boot();
    await playUntil(
      () =>
        document.querySelectorAll('#app .hand button.card.legal:not(:disabled)').length > 0 &&
        document.querySelectorAll('#app .hand button.card:disabled').length > 0,
      'passive',
      400,
    );
    expect(document.querySelectorAll('#app .hand button.card.legal:not(:disabled)').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('#app .hand button.card:disabled').length).toBeGreaterThan(0);
  }, 60000);

  it('человек проходит торговлю, прикуп и снос через интерфейс', async () => {
    await boot();
    // Играем «заявляющимся» стилем, пока не увидим экран сноса.
    await playUntil(() => text().includes('Выберите ровно две карты'), 'bidder', 900);
    expect(text()).toContain('Выберите ровно две карты');
    // Прикуп показан двумя картами, в руке 12 карт до сноса.
    expect(document.querySelectorAll('#app .hand button.card').length).toBe(12);
  }, 90000);

  it('полная пуля играется до итогового пересчёта без обращения к консоли', async () => {
    // Короткая пуля (4) — тот же путь правил, но за разумное число раздач.
    await boot(4);
    await playUntil(() => text().includes('итоговый пересчёт'), 'bidder', 6000);

    const final = text();
    expect(final).toContain('Пуля закрыта');
    expect(final).toContain('Пересчёт §9.9');

    // Итоговые числа берём прямо из DOM и проверяем нулевую сумму (§9.9).
    const row = document.querySelector('#app table.sheet tr.final');
    expect(row).not.toBeNull();
    const values = Array.from(row!.querySelectorAll('td'))
      .slice(1)
      .map((td) => Number.parseInt(td.textContent?.replace('+', '') ?? '0', 10));
    expect(values).toHaveLength(3);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(values.reduce((a, b) => a + b, 0)).toBe(0);

    // Раздач сыграно минимум 3 (требование приёмки).
    const rows = document.querySelectorAll('#app table.sheet tbody tr').length;
    expect(rows).toBeGreaterThanOrEqual(4); // 3 раздачи + строка «Итого»
  }, 180000);

  it('партия сохраняется в localStorage', async () => {
    await boot(4);
    await playUntil(() => localStorage.getItem('preference.party.v1') !== null, 'passive', 900);

    const saved = localStorage.getItem('preference.party.v1');
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!) as { deals: unknown[]; board: unknown; poolTarget: number };
    expect(Array.isArray(parsed.deals)).toBe(true);
    expect(parsed.deals.length).toBeGreaterThan(0);
    expect(parsed.board).toBeDefined();
    // Величина пули из шапки попала в партию (§9.8).
    expect(parsed.poolTarget).toBe(4);
  }, 90000);

  it('место человека — 0', () => {
    expect(HUMAN).toBe(0);
  });
});
