/**
 * Карты, ранги, масти и каноническая колода.
 * Источник истины: docs/rules.md §1 «Колода, карты, старшинство».
 */

/** Ранги от младшего к старшему (§1.2). */
export const RANKS = ['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

/** Масти в порядке возрастания силы в торговле (§1.3). */
export const SUITS = ['S', 'C', 'D', 'H'] as const;
export type Suit = (typeof SUITS)[number];

/** Псевдо-масть «без козыря» — только для торговли (§1.3). */
export const NO_TRUMP = 'NT' as const;
export type NoTrump = typeof NO_TRUMP;

/** Масть контракта: одна из четырёх мастей либо «без козыря». */
export type BidSuit = Suit | NoTrump;

/** Идентификатор карты вида `<Rank><Suit>`, например `AS`, `TH`, `7C` (§1.4). */
export type CardId = `${Rank}${Suit}`;

/** Карта — неизменяемая пара «ранг + масть». */
export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

const RANK_ORDER: Readonly<Record<Rank, number>> = Object.freeze({
  '7': 0,
  '8': 1,
  '9': 2,
  T: 3,
  J: 4,
  Q: 5,
  K: 6,
  A: 7,
});

const SUIT_ORDER: Readonly<Record<BidSuit, number>> = Object.freeze({
  S: 0,
  C: 1,
  D: 2,
  H: 3,
  NT: 4,
});

/** Сила ранга: 7 → 0 … A → 7 (§1.2). Едина для всех типов игр. */
export function rankOrder(rank: Rank): number {
  return RANK_ORDER[rank];
}

/** Сила масти в торговле: S → 0, C → 1, D → 2, H → 3, NT → 4 (§1.3). */
export function suitOrder(suit: BidSuit): number {
  return SUIT_ORDER[suit];
}

/** Проверка, что строка — валидный ранг. */
export function isRank(value: string): value is Rank {
  return (RANKS as readonly string[]).includes(value);
}

/** Проверка, что строка — валидная масть (без `NT`). */
export function isSuit(value: string): value is Suit {
  return (SUITS as readonly string[]).includes(value);
}

/** Конструктор карты. */
export function makeCard(rank: Rank, suit: Suit): Card {
  return Object.freeze({ rank, suit });
}

/** Идентификатор карты (§1.4). */
export function cardId(card: Card): CardId {
  return `${card.rank}${card.suit}`;
}

/** Идентификаторы списка карт — удобно для сравнений в тестах и сериализации. */
export function cardIds(cards: readonly Card[]): CardId[] {
  return cards.map(cardId);
}

/** Разбор идентификатора карты. Бросает при любом отклонении от формата `<Rank><Suit>`. */
export function parseCard(id: string): Card {
  if (id.length !== 2) {
    throw new Error(`Некорректный CardId: ${JSON.stringify(id)} (ожидается формат <Rank><Suit>)`);
  }
  const rank = id[0] as string;
  const suit = id[1] as string;
  if (!isRank(rank) || !isSuit(suit)) {
    throw new Error(`Некорректный CardId: ${JSON.stringify(id)} (ожидается формат <Rank><Suit>)`);
  }
  return makeCard(rank, suit);
}

/** Разбор списка идентификаторов. */
export function parseCards(ids: readonly string[]): Card[] {
  return ids.map(parseCard);
}

/**
 * Канонический порядок колоды: по `suitOrder`, затем по `rankOrder` (§1.4).
 * Нормативен — от него зависит воспроизводимость seed-перемешивания.
 */
export function compareCards(a: Card, b: Card): number {
  const bySuit = suitOrder(a.suit) - suitOrder(b.suit);
  return bySuit !== 0 ? bySuit : rankOrder(a.rank) - rankOrder(b.rank);
}

/** Копия списка карт в каноническом порядке (вход не мутируется). */
export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort(compareCards);
}

/** Равенство карт по значению. */
export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** Новая колода из 32 карт в каноническом порядке (§1.1, §1.4). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}
