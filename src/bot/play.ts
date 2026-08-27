/**
 * Эвристики выбора карты в розыгрыше.
 * Источник истины: docs/rules.md §6.2–§6.3 (ход и взятие), §7 (мизер), §8 (распасы).
 *
 * Модуль ничего не решает про легальность: он выбирает ИЗ уже посчитанного
 * движком множества `legal`. Это и есть гарантия «бот не делает нелегальный ход».
 */
import type { Card, CardId, PlayedCard, PlayerId, Suit } from '../core/index.js';
import { cardId, rankOrder, trickWinner } from '../core/index.js';

/**
 * Цель бота в этой раздаче:
 *  - `win`   — брать взятки (игрок на контракте, вистующий);
 *  - `avoid` — не брать (распасы, §8.1);
 *  - `catch` — заставить взять мизериста (§7 п.6).
 */
export type PlayGoal = 'win' | 'avoid' | 'catch';

export interface PickCardInput {
  /** Рука, из которой ходим (при висте всветлую — рука подконтрольного игрока). */
  readonly hand: readonly Card[];
  /** Легальные ходы — считает движок по §6.2. */
  readonly legal: readonly Card[];
  /** Карты, уже выложенные в текущей взятке. */
  readonly trick: readonly PlayedCard[];
  /** Козырь; `null` на БК, мизере и распасах. */
  readonly trump: Suit | null;
  /** Масть хода, если её задаёт не первая карта взятки (распасы, §8.2). */
  readonly ledSuit?: Suit;
  readonly goal: PlayGoal;
  /** Мизерист — против кого играем при `goal: 'catch'`. */
  readonly target?: PlayerId;
  /** Идентификаторы всех уже вышедших карт (для оценки «моя карта старшая?»). */
  readonly seen: ReadonlySet<string>;
}

/** Масть текущего хода: явный override (распасы) либо первая карта взятки. */
function ledSuitOf(input: PickCardInput): Suit | null {
  if (input.ledSuit !== undefined) return input.ledSuit;
  return input.trick[0]?.card.suit ?? null;
}

/** Кто берёт взятку прямо сейчас, если больше никто не положит карту. */
function currentWinner(input: PickCardInput): PlayedCard | null {
  if (input.trick.length === 0) return null;
  const led = ledSuitOf(input);
  const winner = trickWinner(input.trick, input.trump, led ?? undefined);
  return input.trick.find((p) => p.player === winner) ?? null;
}

/** Побьёт ли `card` текущую лидирующую карту взятки (§6.3). */
function beatsCurrent(card: Card, input: PickCardInput): boolean {
  const leader = currentWinner(input);
  if (leader === null) return true;
  const led = ledSuitOf(input);
  const trump = input.trump;

  const cardIsTrump = trump !== null && card.suit === trump;
  const leaderIsTrump = trump !== null && leader.card.suit === trump;

  if (cardIsTrump && !leaderIsTrump) return true;
  if (!cardIsTrump && leaderIsTrump) return false;
  if (cardIsTrump && leaderIsTrump) return rankOrder(card.rank) > rankOrder(leader.card.rank);

  // Оба некозырные: бьёт только карта масти хода и только старшинством.
  if (led !== null && card.suit !== led) return false;
  if (leader.card.suit !== led) return true;
  return rankOrder(card.rank) > rankOrder(leader.card.rank);
}

const bySortedRank = (a: Card, b: Card): number =>
  rankOrder(a.rank) - rankOrder(b.rank) || cardId(a).localeCompare(cardId(b));

/** Самая слабая из списка (детерминированно). */
function lowest(cards: readonly Card[]): Card {
  return [...cards].sort(bySortedRank)[0] as Card;
}

/** Самая сильная из списка (детерминированно). */
function highest(cards: readonly Card[]): Card {
  const sorted = [...cards].sort(bySortedRank);
  return sorted[sorted.length - 1] as Card;
}

/**
 * Карта — старшая из оставшихся в своей масти?
 * Считаем по вышедшим картам и собственной руке: если все карты выше уже
 * вышли или лежат у нас, взятка гарантирована.
 */
function isTopRemaining(card: Card, input: PickCardInput): boolean {
  const RANK_VALUES = [0, 1, 2, 3, 4, 5, 6, 7];
  const own = new Set(input.hand.map(cardId));
  for (const value of RANK_VALUES) {
    if (value <= rankOrder(card.rank)) continue;
    const rank = (['7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const)[value];
    const id = `${rank}${card.suit}` as CardId;
    if (!input.seen.has(id) && !own.has(id)) return false;
  }
  return true;
}

/** Ход первой картой во взятке при цели «брать». */
function leadToWin(input: PickCardInput): Card {
  const winners = input.legal.filter((c) => isTopRemaining(c, input));
  // Заходим со стопперов: пока они старшие, они берут взятку гарантированно.
  if (winners.length > 0) return highest(winners);
  return lowest(input.legal);
}

/** Выбор карты при цели «брать взятки». */
function pickToWin(input: PickCardInput): Card {
  if (input.trick.length === 0) return leadToWin(input);

  const beating = input.legal.filter((c) => beatsCurrent(c, input));
  // Берём минимальной достаточной картой — старшие сохраняем на будущие взятки.
  if (beating.length > 0) return lowest(beating);
  // Взятку не взять — отдаём самую слабую карту.
  return lowest(input.legal);
}

/** Выбор карты при цели «не брать» (распасы, §8.1). */
function pickToAvoid(input: PickCardInput): Card {
  if (input.trick.length === 0) {
    // Заход мелочью: чем ниже карта, тем меньше шансов остаться со взяткой.
    return lowest(input.legal);
  }

  const safe = input.legal.filter((c) => !beatsCurrent(c, input));
  // Сбрасываем самую ОПАСНУЮ из безопасных: избавляемся от старших карт,
  // пока это ничего не стоит.
  if (safe.length > 0) return highest(safe);
  // Взятку придётся взять — берём минимальной картой.
  return lowest(input.legal);
}

/**
 * Выбор карты при цели «поймать мизериста» (§7 п.6).
 *
 * Мизерист берёт взятку только тогда, когда его карта старшая. Отсюда:
 *  - заходим мелочью, вынуждая его класть карту повыше;
 *  - пока он ещё НЕ сходил — держим планку взятки максимально низкой, чтобы
 *    взятку вынужденно забрал именно он (в «не брать» здесь наоборот
 *    сбрасывают самую старшую безопасную карту);
 *  - когда он уже сходил — взятка либо его (и тогда мешать ей нельзя), либо
 *    для него потеряна; в обоих случаях это ровно поведение «не брать»:
 *    сбросить старшую безопасную карту, а вынужденную взятку взять минимальной.
 */
function pickToCatch(input: PickCardInput): Card {
  if (input.trick.length === 0) return lowest(input.legal);

  const target = input.target;
  const targetYetToPlay =
    target !== undefined && !input.trick.some((p) => p.player === target);
  if (targetYetToPlay) return lowest(input.legal);

  return pickToAvoid(input);
}

/** Выбрать карту из легальных по цели раздачи. Всегда детерминирован. */
export function pickCard(input: PickCardInput): Card {
  if (input.legal.length === 0) {
    throw new Error('Нет легальных ходов: движок обязан дать хотя бы один (§6.2)');
  }
  if (input.goal === 'avoid') return pickToAvoid(input);
  if (input.goal === 'catch') return pickToCatch(input);
  return pickToWin(input);
}
