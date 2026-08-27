/**
 * Снос двух карт после прикупа (§4.2) с учётом выбранного козыря.
 * На мизере смысл обратный: сносим самые опасные карты (§7 п.3).
 *
 * Бот выбирает пару карт из собственной руки — легальность сноса
 * (ровно две разные карты из руки) проверяет движок.
 */
import type { Card, CardId, Suit } from '../core/index.js';
import { cardId, contractTrump, isMizer, parseContract, rankOrder, SUITS } from '../core/index.js';
import { evaluateSuit } from './evaluate.js';

export interface DiscardInput {
  /** Рука после взятия прикупа — 12 карт. */
  readonly hand: readonly Card[];
  /** Контракт, который игрок собирается заказать. */
  readonly contract: string;
}

/** Карты руки по мастям. */
function bySuitOf(hand: readonly Card[]): Readonly<Record<Suit, readonly Card[]>> {
  const groups: Record<Suit, Card[]> = { S: [], C: [], D: [], H: [] };
  for (const card of hand) groups[card.suit].push(card);
  return groups;
}

/**
 * Ценность карты для игры на взятки: чем выше, тем меньше хочется её сносить.
 *
 * Козырь неприкосновенен — им подрезают. Стопперы (карты, дающие масти верную
 * или полуверную взятку) сохраняются. Мелочь длинной масти ценнее мелочи
 * короткой: снос короткой масти целиком открывает ренонс.
 */
function keepValue(card: Card, groups: Readonly<Record<Suit, readonly Card[]>>, trump: Suit | null): number {
  if (trump !== null && card.suit === trump) return 1000;

  const suitCards = groups[card.suit];
  const strength = evaluateSuit(suitCards);
  const stoppers = strength.sure + strength.half;
  // Стопперы — это старшие карты масти: они и держат взятки.
  const rankPosition = suitCards.filter((c) => rankOrder(c.rank) > rankOrder(card.rank)).length;
  const isStopper = rankPosition < stoppers;

  if (isStopper) return 500 + rankOrder(card.rank);

  // Мелочь: длинная масть ценнее — её нельзя разрушить сносом двух карт,
  // короткую (2-3 карты) выгодно снести целиком под ренонс.
  const lengthValue = suitCards.length >= 4 ? 100 : suitCards.length * 10;
  return lengthValue + rankOrder(card.rank);
}

/**
 * Опасность карты на мизере (§7): чем выше, тем нужнее её снести.
 * Опасна карта, под которую нечего подложить: своих младших меньше, чем чужих.
 */
function miserDanger(card: Card, groups: Readonly<Record<Suit, readonly Card[]>>): number {
  const suitCards = groups[card.suit];
  const ownBelow = suitCards.filter((c) => rankOrder(c.rank) < rankOrder(card.rank)).length;
  const missingBelow = rankOrder(card.rank) - ownBelow;
  return (missingBelow - ownBelow) * 10 + rankOrder(card.rank);
}

/**
 * Выбрать снос — ровно две карты (§4.2).
 *
 * Оцениваются ПАРЫ, а не отдельные карты: снос двух карт из одной короткой
 * масти даёт ренонс (возможность подрезать козырем), а снос по карте из
 * разных мастей не даёт ничего. Поэтому пара оценивается суммой ценностей
 * минус премия за созданный ренонс.
 * Детерминирован: при равных оценках порядок задаёт пара `cardId`.
 */
export function chooseDiscard(input: DiscardInput): readonly CardId[] {
  const hand = input.hand;
  if (hand.length < 2) {
    throw new Error(`Снос требует минимум двух карт в руке, получено ${hand.length} (§4.2)`);
  }

  const contract = parseContract(input.contract);
  const groups = bySuitOf(hand);
  const mizer = isMizer(contract);
  const trump = contractTrump(contract);

  const value = (card: Card): number =>
    mizer ? -miserDanger(card, groups) : keepValue(card, groups, trump);

  let bestPair: readonly [CardId, CardId] | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < hand.length; i += 1) {
    for (let j = i + 1; j < hand.length; j += 1) {
      const a = hand[i] as Card;
      const b = hand[j] as Card;
      let score = value(a) + value(b);

      // Премия за ренонс: пара выносит боковую масть целиком (§4.2 — снос под козырь).
      if (!mizer && trump !== null && a.suit === b.suit && a.suit !== trump) {
        if (groups[a.suit].length === 2) score -= VOID_BONUS;
      }

      const pair: readonly [CardId, CardId] = [cardId(a), cardId(b)];
      const better =
        score < bestScore ||
        (score === bestScore &&
          bestPair !== null &&
          `${pair[0]}${pair[1]}`.localeCompare(`${bestPair[0]}${bestPair[1]}`) < 0);
      if (bestPair === null || better) {
        bestPair = pair;
        bestScore = score;
      }
    }
  }

  return Object.freeze(bestPair as readonly [CardId, CardId]);
}

/** Премия за созданный ренонс: больше разницы между мелочью, но меньше стоппера. */
const VOID_BONUS = 60;

/** Все масти — реэкспорт для читаемости вызовов в тестах. */
export { SUITS };
