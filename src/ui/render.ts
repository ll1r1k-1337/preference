/**
 * Отрисовка: чистые функции `состояние -> HTMLElement`.
 *
 * Правил здесь нет: что можно нажать, решают `legalBids`, `legalContracts`
 * и `legalMoves` из состояния движка; что показать в пульке — `buildSheet`.
 */
import type { Card, CardId, PlayerId } from '../core/index.js';
import { contractLabel, type Sheet } from '../game/party.js';
import { HUMAN, type Session } from '../game/session.js';

const SUIT_GLYPH: Readonly<Record<string, string>> = Object.freeze({ S: '♠', C: '♣', D: '♦', H: '♥' });
const RED_SUITS = new Set(['D', 'H']);

export const cardId = (card: Card): CardId => `${card.rank}${card.suit}` as CardId;

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

/** Карта рубашкой вверх или лицом. */
export function cardEl(card: Card | null, extra = ''): HTMLElement {
  if (card === null) return el('div', { class: `card back ${extra}`.trim() });
  const cls = `card ${RED_SUITS.has(card.suit) ? 'red' : ''} ${extra}`.trim();
  return el('div', { class: cls }, el('span', {}, card.rank), el('span', { class: 'suit' }, SUIT_GLYPH[card.suit] ?? card.suit));
}

/** Кликабельная карта руки. */
function cardButton(card: Card, opts: { legal: boolean; selected: boolean; onClick: () => void }): HTMLElement {
  const cls = [
    'card',
    RED_SUITS.has(card.suit) ? 'red' : '',
    opts.legal ? 'legal' : '',
    opts.selected ? 'selected' : '',
  ].filter(Boolean).join(' ');
  const button = el('button', { class: cls, type: 'button', 'data-card': cardId(card) },
    el('span', {}, card.rank),
    el('span', { class: 'suit' }, SUIT_GLYPH[card.suit] ?? card.suit));
  button.disabled = !opts.legal;
  button.addEventListener('click', opts.onClick);
  return button;
}

// ------------------------------------------------------------------- стол

const PHASE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  DEAL: 'Сдача',
  BIDDING: 'Торговля',
  PASSOUT: 'Распасы',
  WIDOW_PICKUP: 'Прикуп',
  DISCARD: 'Снос',
  FINAL_CONTRACT: 'Окончательный заказ',
  WHIST_DECLARATION: 'Вист',
  PLAY: 'Розыгрыш',
  RESULT: 'Итог раздачи',
});

/** Стол: три места, текущая взятка, козырь и счётчик взяток. */
export function renderTable(session: Session): HTMLElement {
  const deal = session.deal;
  const names = session.party.names;
  const panel = el('section', { class: 'panel' });
  if (deal === null) {
    panel.append(el('h2', {}, 'Стол'), el('p', { class: 'hint' }, 'Партия окончена — см. лист записи.'));
    return panel;
  }

  const seats = el('div', { class: 'table-top' });
  for (const seat of [1, 2, 0] as const) {
    const isActive = deal.toAct === seat || deal.play?.toPlay === seat;
    const roles: string[] = [];
    if (deal.dealer === seat) roles.push('сдаёт');
    if (deal.declarer === seat) roles.push('играет');
    if (deal.whisted[seat] === true) roles.push('вистует');
    if (deal.whisted[seat] === false) roles.push('пас');

    seats.append(el('div', { class: `seat ${isActive ? 'active' : ''}`.trim() },
      el('div', { class: 'name' }, names[seat] ?? `Игрок ${seat}`),
      el('div', { class: 'role' }, roles.join(', ')),
      el('div', { class: 'tricks' }, String(deal.play?.tricksWon[seat] ?? 0)),
      el('div', { class: 'role' }, 'взяток')));
  }

  const trick = el('div', { class: 'trick-area' });
  const plays = deal.play?.currentTrick ?? [];
  if (plays.length === 0 && deal.play?.revealedWidowCard == null) {
    trick.append(el('div', { class: 'empty' }, PHASE_TEXT[deal.phase] ?? deal.phase));
  }
  if (deal.play?.revealedWidowCard != null) {
    trick.append(el('div', { class: 'played' },
      el('div', { class: 'who' }, 'прикуп'), cardEl(deal.play.revealedWidowCard)));
  }
  for (const play of plays) {
    trick.append(el('div', { class: 'played' },
      el('div', { class: 'who' }, names[play.player] ?? `И${play.player}`), cardEl(play.card)));
  }

  const trump = deal.trumpSuit === null ? '—' : (SUIT_GLYPH[deal.trumpSuit] ?? deal.trumpSuit);
  const meta = el('div', { class: 'meta' },
    el('span', {}, 'Фаза: ', el('b', {}, PHASE_TEXT[deal.phase] ?? deal.phase)),
    el('span', {}, 'Козырь: ', el('b', {}, trump)),
    el('span', {}, 'Контракт: ', el('b', {}, deal.contract === null ? '—' : contractLabel(deal.contract))),
    el('span', {}, 'Раздача: ', el('b', {}, String(session.party.deals.length + 1))),
    el('span', {}, 'Взятка: ', el('b', {}, String((deal.play?.completedTricks.length ?? 0) + 1), '/10')));

  panel.append(el('h2', {}, 'Стол'), seats, trick, meta);

  // Раскрытые руки соперников (вист всветлую и мизер).
  for (const seat of deal.revealedHands) {
    if (seat === HUMAN) continue;
    const hand = deal.hands[seat] ?? [];
    panel.append(el('h2', {}, `Открытые карты: ${names[seat] ?? seat}`),
      el('div', { class: 'hand' }, ...hand.map((c) => cardEl(c))));
  }
  return panel;
}

/** Рука человека. В фазе снос карты выбираются, в розыгрыше — ходят. */
export function renderHand(
  session: Session,
  selected: readonly CardId[],
  onCard: (id: CardId) => void,
): HTMLElement {
  const deal = session.deal;
  const panel = el('section', { class: 'panel' }, el('h2', {}, 'Ваши карты'));
  if (deal === null) return panel;

  const hand = deal.hands[HUMAN] ?? [];
  const discardPhase = deal.phase === 'DISCARD' && deal.toAct === HUMAN;
  const playPhase = deal.phase === 'PLAY' && deal.toAct === HUMAN;
  const legal = new Set<string>(deal.legalMoves);

  // При висте всветлую человек ходит и картами напарника — рисуем ту руку,
  // чьи карты сейчас на столе (play.toPlay), а не всегда свою.
  const owner: PlayerId = playPhase ? (deal.play?.toPlay ?? HUMAN) : HUMAN;
  const shown = owner === HUMAN ? hand : (deal.hands[owner] ?? []);
  if (owner !== HUMAN) {
    panel.append(el('p', { class: 'hint' }, `Вы ходите за: ${session.party.names[owner] ?? owner}`));
  }

  const cards = el('div', { class: 'hand' });
  for (const card of shown) {
    const id = cardId(card);
    const isLegal = discardPhase ? true : playPhase ? legal.has(id) : false;
    cards.append(cardButton(card, {
      legal: isLegal,
      selected: selected.includes(id),
      onClick: () => onCard(id),
    }));
  }
  panel.append(cards);

  if (owner !== HUMAN) {
    panel.append(el('h2', {}, 'Ваша рука'), el('div', { class: 'hand' }, ...hand.map((c) => cardEl(c))));
  }
  return panel;
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

/** История ходов; последние записи внизу. */
export function renderLog(session: Session): HTMLElement {
  const box = el('div', { class: 'log' });
  let lastDeal = -1;
  for (const entry of session.log.slice(-160)) {
    if (entry.deal !== lastDeal) {
      box.append(el('div', { class: 'deal-mark' }, `— Раздача ${entry.deal} —`));
      lastDeal = entry.deal;
    }
    box.append(el('div', {}, entry.text));
  }
  if (session.log.length === 0) box.append(el('div', {}, 'Ходов пока нет.'));
  return el('section', { class: 'panel' }, el('h2', {}, 'История ходов'), box);
}
