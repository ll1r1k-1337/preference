/**
 * Оценка руки — числовая база всех решений бота.
 *
 * Источник истины по правилам: docs/rules.md §1 (старшинство), §5.3, §7.
 * Модуль не знает ни про фазы, ни про команды: только карты на руках.
 */
import type { BidSuit, Card, Rank, Suit } from '../core/index.js';
import { NO_TRUMP, RANKS, SUITS, rankOrder } from '../core/index.js';

/** Оценка одной масти: сколько взяток она даёт «наверняка» и «примерно». */
export interface SuitStrength {
  /** Взятки, которые не отнять: непрерывная последовательность от туза вниз. */
  readonly sure: number;
  /** Взятки, зависящие от расклада: honor без верхнего соседа, но с прикрытием. */
  readonly half: number;
}

/** Оценка масти в составе руки — то же плюс длина. */
export interface SuitEvaluation extends SuitStrength {
  readonly length: number;
}

/** Полная оценка руки под выбранный козырь. */
export interface HandEvaluation {
  readonly sure: number;
  readonly half: number;
  /** Ожидаемое число взяток: честные взятки плюс бонусы за козырную длину и ренонсы. */
  readonly expected: number;
  /** Козырь (или БК), при котором `expected` максимально. */
  readonly bestTrump: BidSuit;
  readonly bySuit: Readonly<Record<Suit, SuitEvaluation>>;
}

/** Honor-ранги в порядке убывания силы: только они берут взятки «сами по себе». */
const HONORS: readonly Rank[] = Object.freeze(['A', 'K', 'Q']);

/**
 * Взятки одной масти (§1.2).
 *
 * Непрерывная последовательность honor-ов от туза вниз (`A`, `AK`, `AKQ`) —
 * верные взятки. Honor без верхнего соседа берёт взятку только при достаточном
 * прикрытии: королю нужна одна карта под ним, даме — две (иначе его снимут
 * старшей и он останется голым).
 */
export function evaluateSuit(cards: readonly Card[]): SuitStrength {
  const ranks = new Set(cards.map((c) => c.rank));
  const length = cards.length;

  let sure = 0;
  let half = 0;
  let contiguousFromTop = true;

  HONORS.forEach((honor, index) => {
    if (!ranks.has(honor)) {
      contiguousFromTop = false;
      return;
    }
    if (contiguousFromTop) {
      sure += 1;
      return;
    }
    // Honor «с дыркой» сверху: нужно `index` карт прикрытия под ним.
    if (length >= index + 1) half += 1;
  });

  return Object.freeze({ sure, half });
}

/** Карты руки, сгруппированные по мастям. */
function bySuitOf(hand: readonly Card[]): Readonly<Record<Suit, readonly Card[]>> {
  const groups: Record<Suit, Card[]> = { S: [], C: [], D: [], H: [] };
  for (const card of hand) groups[card.suit].push(card);
  return Object.freeze(groups);
}

/** Бонус за козырную длину: каждая козырная карта сверх трёх — полвзятки. */
function trumpLengthBonus(trumpLength: number): number {
  return Math.max(0, trumpLength - 3) * 0.5;
}

/**
 * Бонус за короткие боковые масти: рено́нс — взятка, синглет — полвзятки.
 * Ограничен козырной длиной: подрезать нечем, если козырей нет.
 */
function shortnessBonus(
  groups: Readonly<Record<Suit, readonly Card[]>>,
  trump: Suit,
): number {
  let bonus = 0;
  for (const suit of SUITS) {
    if (suit === trump) continue;
    const length = groups[suit].length;
    if (length === 0) bonus += 1;
    else if (length === 1) bonus += 0.5;
  }
  return Math.min(bonus, groups[trump].length * 0.5);
}

/** Ожидаемые взятки руки при заданном козыре. */
function expectedFor(hand: readonly Card[], trump: BidSuit): number {
  const groups = bySuitOf(hand);
  let sure = 0;
  let half = 0;
  for (const suit of SUITS) {
    const strength = evaluateSuit(groups[suit]);
    sure += strength.sure;
    half += strength.half;
  }
  const honest = sure + half * 0.5;
  if (trump === NO_TRUMP) return honest;
  return honest + trumpLengthBonus(groups[trump].length) + shortnessBonus(groups, trump);
}

/** Все варианты козыря в порядке возрастания силы масти (§1.3). */
const BID_SUITS: readonly BidSuit[] = Object.freeze([...SUITS, NO_TRUMP]);

/** Козырь, дающий руке наибольшую ожидаемую силу. При равенстве — младшая масть (дешевле заказ). */
export function bestTrumpFor(hand: readonly Card[]): BidSuit {
  let best: BidSuit = BID_SUITS[0] as BidSuit;
  let bestValue = -Infinity;
  for (const suit of BID_SUITS) {
    const value = expectedFor(hand, suit);
    if (value > bestValue) {
      best = suit;
      bestValue = value;
    }
  }
  return best;
}

/** Оценка руки под конкретный козырь (§5.3 — база решения о заявке и висте). */
export function evaluateHand(hand: readonly Card[], trump: BidSuit): HandEvaluation {
  const groups = bySuitOf(hand);
  const bySuit: Record<Suit, SuitEvaluation> = {
    S: { ...evaluateSuit(groups.S), length: groups.S.length },
    C: { ...evaluateSuit(groups.C), length: groups.C.length },
    D: { ...evaluateSuit(groups.D), length: groups.D.length },
    H: { ...evaluateSuit(groups.H), length: groups.H.length },
  };

  let sure = 0;
  let half = 0;
  for (const suit of SUITS) {
    sure += bySuit[suit].sure;
    half += bySuit[suit].half;
  }

  return Object.freeze({
    sure,
    half,
    expected: expectedFor(hand, trump),
    bestTrump: bestTrumpFor(hand),
    bySuit: Object.freeze(bySuit),
  });
}

/**
 * Риск мизера (§7): сколько взяток рука возьмёт вынужденно.
 *
 * Карта берёт взятку, если под неё нечего подложить: у соперников больше
 * младших карт этой масти, чем у нас самих. Формально карта опасна, когда
 * своих карт ниже неё меньше, чем чужих недостающих рангов ниже неё.
 */
export function miserRisk(hand: readonly Card[]): number {
  const groups = bySuitOf(hand);
  let risk = 0;

  for (const suit of SUITS) {
    const held = new Set(groups[suit].map((c) => c.rank));
    for (const card of groups[suit]) {
      const order = rankOrder(card.rank);
      let ownBelow = 0;
      let missingBelow = 0;
      for (const rank of RANKS) {
        if (rankOrder(rank) >= order) continue;
        if (held.has(rank)) ownBelow += 1;
        else missingBelow += 1;
      }
      if (ownBelow < missingBelow) risk += 1;
    }
  }

  return risk;
}
