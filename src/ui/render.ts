/**
 * Отрисовка: чистые функции `состояние -> HTMLElement`.
 *
 * Что показать в пульке — `buildSheet`. Игровой логики нет.
 */
import { type Sheet } from '../game/party.js';
import type { Session } from '../game/session.js';

/** Короткий тег: `el('div', { class: 'x' }, 'текст', child)`. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) {
    if (child === null || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

// ------------------------------------------------------------- лист записи

const cell = (value: number): HTMLElement =>
  el('td', { class: value === 0 ? 'zero' : '' }, value === 0 ? '·' : String(value));

/**
 * Классическая расчерченная пулька: пуля, гора и висты между игроками.
 * Все числа берутся из `Sheet` — UI ничего не пересчитывает.
 */
export function renderSheet(sheet: Sheet): HTMLElement {
  const seats = [0, 1, 2] as const;
  const head = el('tr', {}, el('th', {}, 'Раздача'));
  for (const s of seats) head.append(el('th', { colspan: '2' }, sheet.names[s] ?? `И${s}`));
  const sub = el('tr', {}, el('th', {}, ''));
  for (const _ of seats) sub.append(el('th', {}, 'пуля'), el('th', {}, 'гора'));

  const body = el('tbody');
  for (const row of sheet.rows) {
    const tr = el('tr', {}, el('td', { class: 'label' }, `${row.index}. ${row.label}`));
    for (const s of seats) {
      tr.append(cell(row.pool[s] ?? 0), cell(row.mountain[s] ?? 0));
    }
    body.append(tr);
  }

  const totals = el('tr', { class: 'totals' }, el('td', { class: 'label' }, 'Итого'));
  for (const s of seats) {
    totals.append(cell(sheet.totals.pool[s] ?? 0), cell(sheet.totals.mountain[s] ?? 0));
  }
  body.append(totals);

  const table = el('table', { class: 'sheet' }, el('thead', {}, head, sub), body);

  // Висты — отдельная таблица «кто на кого записал».
  const vHead = el('tr', {}, el('th', {}, 'Висты'));
  for (const s of seats) vHead.append(el('th', {}, `на ${sheet.names[s] ?? s}`));
  const vBody = el('tbody');
  for (const a of seats) {
    const tr = el('tr', {}, el('td', { class: 'label' }, sheet.names[a] ?? `И${a}`));
    for (const b of seats) {
      tr.append(a === b ? el('td', { class: 'zero' }, '×') : cell(sheet.totals.vists[a]?.[b] ?? 0));
    }
    vBody.append(tr);
  }
  const balance = el('tr', { class: 'totals' }, el('td', { class: 'label' }, 'Сальдо'));
  for (const s of seats) balance.append(cell(sheet.totals.vistBalance[s] ?? 0));
  vBody.append(balance);
  const vistTable = el('table', { class: 'sheet' }, el('thead', {}, vHead), vBody);

  const panel = el('section', { class: 'panel' },
    el('h2', {}, `Лист записи (пуля до ${sheet.poolTarget})`),
    el('div', { class: 'sheet-wrap' }, table),
    el('div', { class: 'sheet-wrap' }, vistTable));

  if (sheet.final !== null) {
    const fHead = el('tr', {}, el('th', {}, 'Итог, вистов'));
    for (const s of seats) fHead.append(el('th', {}, sheet.names[s] ?? `И${s}`));
    const fRow = el('tr', { class: 'final' }, el('td', { class: 'label' }, 'Пересчёт §9.9'));
    for (const s of seats) {
      const v = sheet.final[s] ?? 0;
      fRow.append(el('td', {}, v > 0 ? `+${v}` : String(v)));
    }
    panel.append(el('h2', {}, 'Пуля закрыта — итоговый пересчёт'),
      el('div', { class: 'sheet-wrap' }, el('table', { class: 'sheet' }, el('thead', {}, fHead), el('tbody', {}, fRow))));
  }
  return panel;
}

/** Информация о текущей раздаче (кто сдаёт). */
export function renderStatus(session: Session): HTMLElement {
  const panel = el('section', { class: 'panel' });
  const dealer = session.party.names[session.party.dealer] ?? `Игрок ${session.party.dealer}`;
  const dealNum = session.party.deals.length + 1;
  panel.append(
    el('h2', {}, 'Партия'),
    el('p', { class: 'hint' }, `Раздача №${dealNum}. Сдаёт: ${dealer}.`),
    el('p', { class: 'hint' }, `Пуля до ${session.party.poolTarget}. Записано раздач: ${session.party.deals.length}.`),
  );
  if (session.closed) {
    panel.append(el('p', { class: 'hint' }, 'Пуля закрыта — см. итоговый пересчёт.'));
  }
  return panel;
}
