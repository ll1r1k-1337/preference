/**
 * Раздача: роли рук, детерминированный порядок сдачи, прикуп, ротация сдающего.
 * Источник истины: docs/rules.md §2 «Состав, раздача, роли».
 */
import type { Card } from './cards.js';
import { cardId, sortCards } from './cards.js';
import type { Seed } from './shuffle.js';
import { shuffleDeck } from './shuffle.js';

/** Игрок — место за столом 0..2, нумерация по часовой стрелке (§2.1). */
export type PlayerId = 0 | 1 | 2;

/** Все игроки в порядке возрастания идентификатора. */
export const PLAYERS: readonly PlayerId[] = Object.freeze([0, 1, 2] as PlayerId[]);

/** Старшинство руки в торговле (§2.2). */
export type HandRole = 'first' | 'second' | 'third';

/** Число карт в руке после раздачи. */
export const HAND_SIZE = 10;
/** Число карт в прикупе. */
export const WIDOW_SIZE = 2;
/** Число взяток в раздаче. */
export const TRICKS_PER_DEAL = 10;

/** Следующий игрок по часовой стрелке. */
export function playerAfter(player: PlayerId): PlayerId {
  return ((player + 1) % 3) as PlayerId;
}

/** Сдающий следующей раздачи: `dealerRotation = sliding` (§2.2). */
export function nextDealer(dealer: PlayerId): PlayerId {
  return playerAfter(dealer);
}

/** Первая рука — слева от сдающего (§2.2). Начинает торговлю и распасы. */
export function firstHand(dealer: PlayerId): PlayerId {
  return ((dealer + 1) % 3) as PlayerId;
}

/** Вторая рука (§2.2). */
export function secondHand(dealer: PlayerId): PlayerId {
  return ((dealer + 2) % 3) as PlayerId;
}

/** Третья рука — сам сдающий при трёх игроках (§2.2). */
export function thirdHand(dealer: PlayerId): PlayerId {
  return dealer;
}

/** Роль руки данного игрока при данном сдающем (§2.2). */
export function handRole(player: PlayerId, dealer: PlayerId): HandRole {
  const offset = (player - dealer + 3) % 3;
  if (offset === 1) return 'first';
  if (offset === 2) return 'second';
  return 'third';
}

/** Порядок сдачи/заявок: первая, вторая, третья рука. */
export function handOrder(dealer: PlayerId): PlayerId[] {
  return [firstHand(dealer), secondHand(dealer), thirdHand(dealer)];
}

/** Результат сдачи. */
export interface DealtCards {
  /** Руки по игрокам, по 10 карт, в канонической сортировке. */
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;
  /** Прикуп — 2 карты (карты №13 и №14 в порядке разбора). */
  readonly widow: readonly Card[];
  readonly dealer: PlayerId;
  readonly firstHand: PlayerId;
}

function assertValidDeck(deck: readonly Card[]): void {
  if (deck.length !== 32) {
    throw new Error(`Колода должна содержать 32 карты, получено ${deck.length}`);
  }
  const ids = new Set(deck.map(cardId));
  if (ids.size !== 32) {
    throw new Error('Колода содержит дубли карт');
  }
}

/**
 * Разобрать готовую (уже перемешанную) колоду по нормативному порядку сдачи (§2.3):
 * 2 круга по 2 карты → прикуп (карты 13–14) → ещё 3 круга по 2 карты.
 */
export function dealFromDeck(deck: readonly Card[], dealer: PlayerId): DealtCards {
  assertValidDeck(deck);

  const order = handOrder(dealer);
  const hands: Record<PlayerId, Card[]> = { 0: [], 1: [], 2: [] };
  const widow: Card[] = [];
  let cursor = 0;

  const take = (count: number): Card[] => {
    const chunk = deck.slice(cursor, cursor + count);
    cursor += count;
    return chunk;
  };

  const dealRound = (): void => {
    for (const player of order) {
      hands[player].push(...take(2));
    }
  };

  dealRound(); // круг 1 — карты 1..6
  dealRound(); // круг 2 — карты 7..12
  widow.push(...take(WIDOW_SIZE)); // прикуп — карты 13..14
  dealRound(); // круг 3
  dealRound(); // круг 4
  dealRound(); // круг 5

  for (const player of PLAYERS) {
    if (hands[player].length !== HAND_SIZE) {
      throw new Error(`Внутренняя ошибка сдачи: у игрока ${player} ${hands[player].length} карт`);
    }
  }

  return Object.freeze({
    hands: Object.freeze({
      0: Object.freeze(sortCards(hands[0])),
      1: Object.freeze(sortCards(hands[1])),
      2: Object.freeze(sortCards(hands[2])),
    }),
    widow: Object.freeze([...widow]),
    dealer,
    firstHand: firstHand(dealer),
  });
}

export interface DealOptions {
  readonly seed: Seed;
  readonly dealer: PlayerId;
}

/** Перемешать колоду по seed и сдать по нормативному порядку (§2.3). */
export function dealCards(options: DealOptions): DealtCards {
  return dealFromDeck(shuffleDeck(options.seed), options.dealer);
}
