/**
 * Monte-Carlo поиск хода: сэмплирование неизвестных рук («детерминизация»)
 * и симуляция раздачи до конца эвристиками из `play.ts`.
 *
 * Правила розыгрыша НЕ дублируются: симуляция гоняет ядро `src/core`
 * (`createPlay`/`legalMoves`/`applyMove`), поэтому любая сгенерированная
 * позиция подчиняется §6.2 автоматически.
 */
import type { Card, PlayMode, PlayState, PlayerId, Rng, Suit } from '../core/index.js';
import {
  applyMove,
  cardId,
  createPlay,
  currentTrumpSuit,
  isTerminal,
  legalMoves,
  PLAYERS,
} from '../core/index.js';
import type { PlayGoal } from './play.js';
import { pickCard } from './play.js';

/** Ренонсы: масти, которых у игрока заведомо нет (он их не положил на масть хода). */
export type VoidMap = Readonly<Record<PlayerId, ReadonlySet<Suit>>>;

export interface DeterminizeInput {
  /** Карты, местонахождение которых неизвестно. */
  readonly unseen: readonly Card[];
  /** Сколько неизвестных карт у каждого игрока (у себя — 0). */
  readonly sizes: Readonly<Record<PlayerId, number>>;
  readonly voids: VoidMap;
  /**
   * Сколько неизвестных карт вне игры: снос игрока (§4.2) и невскрытый прикуп.
   * Они раздаются в «мёртвую» стопку и в симуляции не участвуют.
   */
  readonly dead?: number;
  readonly rng: Rng;
}

/**
 * Раздать неизвестные карты по скрытым рукам с учётом ренонсов.
 *
 * Карты раздаются от самых «дефицитных» (мало кандидатов) к свободным —
 * это резко снижает шанс зайти в тупик; при тупике делается перезапуск
 * без учёта ренонсов, чтобы поиск не падал на редких раскладах.
 * Лишние карты (`dead`) уходят в мёртвую стопку — ренонсы на неё не влияют.
 */
export function determinize(input: DeterminizeInput): Readonly<Record<PlayerId, readonly Card[]>> {
  const DEAD = -1;
  const dead = input.dead ?? 0;

  // Молчаливая недодача карт — самый коварный баг сэмплирования: симуляция
  // падает далеко от причины. Поэтому несоответствие ловится сразу.
  const slotsTotal = PLAYERS.reduce<number>((sum, p) => sum + input.sizes[p], 0) + dead;
  if (input.unseen.length < slotsTotal) {
    throw new Error(
      `Неизвестных карт меньше, чем мест в руках: ${input.unseen.length} < ${slotsTotal} — ` +
        'состав известных карт посчитан неверно',
    );
  }

  const attempt = (respectVoids: boolean): Record<PlayerId, Card[]> | null => {
    const remaining: Record<number, number> = { ...input.sizes, [DEAD]: dead };
    const result: Record<PlayerId, Card[]> = { 0: [], 1: [], 2: [] };
    const slots: readonly number[] = dead > 0 ? [...PLAYERS, DEAD] : PLAYERS;

    const candidatesOf = (card: Card): number[] =>
      slots.filter(
        (p) =>
          (remaining[p] ?? 0) > 0 &&
          (p === DEAD || !respectVoids || !input.voids[p as PlayerId].has(card.suit)),
      );

    const pool = [...input.unseen];
    while (pool.length > 0) {
      // Самая ограниченная карта первой.
      let index = 0;
      let fewest = Infinity;
      for (let i = 0; i < pool.length; i += 1) {
        const count = candidatesOf(pool[i] as Card).length;
        if (count < fewest) {
          fewest = count;
          index = i;
        }
      }
      const card = pool.splice(index, 1)[0] as Card;
      const candidates = candidatesOf(card);
      if (candidates.length === 0) return null;

      // Вес слота — число оставшихся в нём мест: так распределение
      // приближается к равномерному по возможным раскладам.
      let total = 0;
      for (const p of candidates) total += remaining[p] ?? 0;
      let roll = input.rng.nextInt(total);
      let chosen = candidates[0] as number;
      for (const p of candidates) {
        roll -= remaining[p] ?? 0;
        if (roll < 0) {
          chosen = p;
          break;
        }
      }

      if (chosen !== DEAD) result[chosen as PlayerId].push(card);
      remaining[chosen] = (remaining[chosen] ?? 0) - 1;
    }
    return result;
  };

  const withVoids = attempt(true);
  const hands = withVoids ?? attempt(false);
  if (hands === null) {
    throw new Error('Не удалось раздать неизвестные карты: размеры рук не сходятся с колодой');
  }
  return Object.freeze({
    0: Object.freeze(hands[0]),
    1: Object.freeze(hands[1]),
    2: Object.freeze(hands[2]),
  });
}

/** Что оптимизирует поиск: свои взятки в плюс или в минус. */
export type SearchObjective = 'maximize' | 'minimize';

export interface SearchInput {
  readonly mode: PlayMode;
  readonly dealer: PlayerId;
  readonly leader: PlayerId;
  readonly currentTrick: PlayState['currentTrick'];
  readonly completedTricks: PlayState['completedTricks'];
  /** Известные руки; `null` — рука скрыта и будет сэмплирована. */
  readonly hands: Readonly<Record<PlayerId, readonly Card[] | null>>;
  readonly unseen: readonly Card[];
  /** Сколько НЕИЗВЕСТНЫХ карт у каждого игрока. */
  readonly sizes: Readonly<Record<PlayerId, number>>;
  readonly voids: VoidMap;
  /** Неизвестные карты вне игры: снос и невскрытый прикуп (§4.2). */
  readonly dead?: number;
  /** Цель каждого игрока в симуляции — так соперники играют осмысленно. */
  readonly goalFor: (player: PlayerId) => PlayGoal;
  /** Чьи взятки считаем результатом симуляции. */
  readonly beneficiaries: readonly PlayerId[];
  readonly objective: SearchObjective;
  /** Бюджет симуляций на ход. */
  readonly simulations: number;
  readonly rng: Rng;
  /** Мизерист — для цели `catch`. */
  readonly target?: PlayerId;
}

/** Прогнать позицию до конца эвристиками и вернуть взятки бенефициаров. */
function rollout(state: PlayState, input: SearchInput): number {
  let current = state;
  let guard = 0;

  while (!isTerminal(current)) {
    if (guard++ > 64) throw new Error('Симуляция не сходится: больше 64 ходов');
    const legal = legalMoves(current);
    const player = current.toPlay;
    const card = pickCard({
      hand: current.hands[player],
      legal,
      trick: current.currentTrick,
      trump: currentTrumpSuit(current),
      ...(current.revealedWidowCard !== null
        ? { ledSuit: current.revealedWidowCard.suit }
        : {}),
      goal: input.goalFor(player),
      ...(input.target !== undefined ? { target: input.target } : {}),
      seen: seenCards(current),
    });
    current = applyMove(current, card);
  }

  let tricks = 0;
  for (const player of input.beneficiaries) tricks += current.tricksWon[player];
  return tricks;
}

/** Все карты, вышедшие к текущему моменту. */
export function seenCards(state: PlayState): ReadonlySet<string> {
  const seen = new Set<string>();
  for (const trick of state.completedTricks) {
    for (const play of trick.plays) seen.add(cardId(play.card));
    if (trick.widowCard !== null) seen.add(cardId(trick.widowCard));
  }
  for (const play of state.currentTrick) seen.add(cardId(play.card));
  if (state.revealedWidowCard !== null) seen.add(cardId(state.revealedWidowCard));
  return seen;
}

/**
 * Выбрать ход Monte-Carlo перебором: каждая легальная карта проверяется
 * на одинаковых сэмплах скрытых рук, побеждает карта с лучшим средним.
 *
 * Общие сэмплы для всех карт — это и снижение дисперсии, и детерминизм:
 * при одном seed результат воспроизводим бит в бит.
 */
export function searchMove(input: SearchInput): Card {
  const actor = actorOf(input);
  const ownHand = input.hands[actor];
  if (ownHand === null || ownHand.length === 0) {
    throw new Error(`У игрока ${actor} нет карт для хода — состояние поиска некорректно`);
  }

  // Сэмплы фиксируются заранее: все карты-кандидаты играются на одних раскладах.
  const samples: Readonly<Record<PlayerId, readonly Card[]>>[] = [];
  const sampleCount = Math.max(1, Math.floor(input.simulations));
  for (let i = 0; i < sampleCount; i += 1) {
    samples.push(
      determinize({
        unseen: input.unseen,
        sizes: input.sizes,
        voids: input.voids,
        ...(input.dead !== undefined ? { dead: input.dead } : {}),
        rng: input.rng,
      }),
    );
  }

  const probe = buildState(input, samples[0] as Readonly<Record<PlayerId, readonly Card[]>>);
  const candidates = legalMoves(probe);
  if (candidates.length === 1) return candidates[0] as Card;

  let bestCard = candidates[0] as Card;
  let bestScore = input.objective === 'maximize' ? -Infinity : Infinity;

  for (const candidate of candidates) {
    let total = 0;
    for (const sample of samples) {
      const state = buildState(input, sample);
      total += rollout(applyMove(state, candidate), input);
    }
    const score = total / samples.length;
    const better =
      input.objective === 'maximize'
        ? score > bestScore
        : score < bestScore;
    // Детерминированный разрыв ничьих — по идентификатору карты.
    if (better || (score === bestScore && cardId(candidate) < cardId(bestCard))) {
      bestCard = candidate;
      bestScore = score;
    }
  }

  return bestCard;
}

/** Кто ходит в позиции поиска: лидер плюс уже выложенные карты. */
function actorOf(input: SearchInput): PlayerId {
  return ((input.leader + input.currentTrick.length) % 3) as PlayerId;
}

/** Собрать состояние ядра из известных рук и одного сэмпла скрытых. */
function buildState(
  input: SearchInput,
  sample: Readonly<Record<PlayerId, readonly Card[]>>,
): PlayState {
  const hands: Record<PlayerId, readonly Card[]> = { 0: [], 1: [], 2: [] };
  for (const player of PLAYERS) {
    const known = input.hands[player];
    hands[player] = known === null ? sample[player] : [...known, ...sample[player]];
  }
  return createPlay({
    mode: input.mode,
    dealer: input.dealer,
    hands,
    leader: input.leader,
    currentTrick: input.currentTrick,
    completedTricks: input.completedTricks,
  });
}
