/**
 * Контракты: шкала торговли, стоимость игры, вистовые обязательства.
 * Источник истины: docs/rules.md §3.2, §4.3, §5.3, §9.2, приложение А.1.
 */
import type { BidSuit, Suit } from './cards.js';
import { NO_TRUMP, SUITS, isSuit, suitOrder } from './cards.js';

/** Уровни игры на взятки. */
export const LEVELS = [6, 7, 8, 9, 10] as const;
export type Level = (typeof LEVELS)[number];

/** Идентификатор контракта: `6S`…`10NT` либо `MIZER` (приложение А.1). */
export type ContractId =
  | `${Level}${Suit}`
  | `${Level}${typeof NO_TRUMP}`
  | 'MIZER';

/** Контракт — игра на взятки либо мизер. */
export type Contract =
  | { readonly kind: 'tricks'; readonly level: Level; readonly suit: BidSuit }
  | { readonly kind: 'mizer' };

/** Мизер как значение. */
export const MIZER: Contract = Object.freeze({ kind: 'mizer' as const });

const BID_SUITS: readonly BidSuit[] = [...SUITS, NO_TRUMP];

function isLevel(value: number): value is Level {
  return (LEVELS as readonly number[]).includes(value);
}

function isBidSuit(value: string): value is BidSuit {
  return isSuit(value) || value === NO_TRUMP;
}

/** Конструктор контракта на взятки. Бросает на некорректном уровне/масти. */
export function makeContract(level: Level, suit: BidSuit): Contract {
  if (!isLevel(level)) {
    throw new Error(`Некорректный контракт: уровень ${level} вне 6..10`);
  }
  if (!isBidSuit(suit)) {
    throw new Error(`Некорректный контракт: масть ${JSON.stringify(suit)}`);
  }
  return Object.freeze({ kind: 'tricks' as const, level, suit });
}

/** Мизер? */
export function isMizer(contract: Contract): boolean {
  return contract.kind === 'mizer';
}

/** Уровень контракта; `null` для мизера. */
export function contractLevel(contract: Contract): Level | null {
  return contract.kind === 'tricks' ? contract.level : null;
}

/**
 * Козырная масть контракта; `null` для бескозырных и для мизера (§7.2).
 * Именно это значение подаётся в `legalMoves`/`trickWinner`.
 */
export function contractTrump(contract: Contract): Suit | null {
  if (contract.kind !== 'tricks') return null;
  return contract.suit === NO_TRUMP ? null : contract.suit;
}

/** Идентификатор контракта (приложение А.1). */
export function contractId(contract: Contract): ContractId {
  if (contract.kind === 'mizer') return 'MIZER';
  return `${contract.level}${contract.suit}` as ContractId;
}

/** Разбор идентификатора контракта. */
export function parseContract(id: string): Contract {
  if (id === 'MIZER') return MIZER;
  const match = /^(6|7|8|9|10)(S|C|D|H|NT)$/.exec(id);
  if (!match) {
    throw new Error(`Некорректный контракт: ${JSON.stringify(id)}`);
  }
  const level = Number(match[1]) as Level;
  const suit = match[2] as BidSuit;
  return makeContract(level, suit);
}

/**
 * Позиция контракта на шкале старшинства 1..26 (§3.2):
 *   bidOrder(level, suitOrder) = (level - 6) * 5 + suitOrder + 1   для 6..8
 *   bidOrder(MIZER)            = 16
 *   bidOrder(level, suitOrder) = (level - 6) * 5 + suitOrder + 2   для 9..10
 */
export function bidOrder(contract: Contract): number {
  if (contract.kind === 'mizer') return 16;
  const base = (contract.level - 6) * 5 + suitOrder(contract.suit) + 1;
  return contract.level >= 9 ? base + 1 : base;
}

/** Все 26 контрактов в порядке возрастания `bidOrder`. */
export const ALL_CONTRACTS: readonly Contract[] = Object.freeze(
  [
    ...LEVELS.flatMap((level) => BID_SUITS.map((suit) => makeContract(level, suit))),
    MIZER,
  ].sort((a, b) => bidOrder(a) - bidOrder(b)),
);

/** Сравнение контрактов по шкале: <0, 0, >0. */
export function compareContracts(a: Contract, b: Contract): number {
  return bidOrder(a) - bidOrder(b);
}

/** `candidate` строго старше `current`? (§3.3 — правило повышения) */
export function isHigherContract(candidate: Contract, current: Contract): boolean {
  return compareContracts(candidate, current) > 0;
}

/** `candidate` допустим как окончательный заказ поверх выигравшей заявки `won` (§4.3)? */
export function isAllowedFinalContract(candidate: Contract, won: Contract): boolean {
  // Мизер кабальный: выигравший мизером играет мизер, иначе мизер заказать нельзя (§4.3, TS-11).
  if (isMizer(won) !== isMizer(candidate)) return false;
  return compareContracts(candidate, won) >= 0;
}

const GAME_PRICE: Readonly<Record<Level, number>> = Object.freeze({
  6: 2,
  7: 4,
  8: 6,
  9: 8,
  10: 10,
});

/** Стоимость игры — база расчёта пули, горы и вистов (§9.2). */
export function gamePrice(contract: Contract): number {
  if (contract.kind === 'mizer') return 10;
  return GAME_PRICE[contract.level];
}

export interface WhistObligation {
  /** Обязательство всей обороны, взяток. */
  readonly total: number;
  /** Обязательство каждого при двух вистующих. */
  readonly perDefenderWhenTwo: number;
}

const OBLIGATION: Readonly<Record<Level, WhistObligation>> = Object.freeze({
  6: { total: 4, perDefenderWhenTwo: 2 },
  7: { total: 2, perDefenderWhenTwo: 1 },
  8: { total: 1, perDefenderWhenTwo: 1 },
  9: { total: 1, perDefenderWhenTwo: 1 },
  10: { total: 0, perDefenderWhenTwo: 0 },
});

/** Вистовые обязательства обороны (§5.3). На мизере и десятерной — ноль. */
export function whistObligation(contract: Contract): WhistObligation {
  if (contract.kind === 'mizer') return { total: 0, perDefenderWhenTwo: 0 };
  return OBLIGATION[contract.level];
}
