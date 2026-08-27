/**
 * Розыгрыш: состояние взяток, правила хода, победитель взятки, переходы.
 * Источник истины: docs/rules.md §2.4, §6, §7, §8.2.
 *
 * Все переходы иммутабельны: `applyMove(state, card)` возвращает новое состояние,
 * исходное не изменяется.
 */
import type { Card, Suit } from './cards.js';
import { cardId, rankOrder, sameCard, sortCards } from './cards.js';
import type { Contract } from './contract.js';
import { contractTrump, isMizer } from './contract.js';
import type { PlayerId } from './deal.js';
import { PLAYERS, TRICKS_PER_DEAL, firstHand, playerAfter } from './deal.js';

/** Одна выложенная карта во взятке. */
export interface PlayedCard {
  readonly player: PlayerId;
  readonly card: Card;
}

/** Завершённая взятка. */
export interface CompletedTrick {
  /** Номер взятки, начиная с 1. */
  readonly number: number;
  /** Кто ходил первым. */
  readonly leader: PlayerId;
  /** Выложенные карты в порядке хода. */
  readonly plays: readonly PlayedCard[];
  /** Победитель взятки. */
  readonly winner: PlayerId;
  /** Карта прикупа, вскрытая перед взяткой (только распасы, §8.2); иначе `null`. */
  readonly widowCard: Card | null;
}

/**
 * Режим розыгрыша.
 * `contract` — игра на взятки либо мизер (мизер = контракт без козыря).
 * `raspasy` — распасы: козыря нет, первые две взятки открывают карту прикупа.
 */
export type PlayMode =
  | { readonly kind: 'contract'; readonly contract: Contract; readonly declarer: PlayerId }
  | { readonly kind: 'raspasy'; readonly widow: readonly [Card, Card] };

/** Иммутабельное состояние розыгрыша. */
export interface PlayState {
  readonly mode: PlayMode;
  readonly dealer: PlayerId;
  /** Руки игроков в канонической сортировке. */
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;
  /** Кто ходил первым в текущей взятке. */
  readonly leader: PlayerId;
  /** Чей ход сейчас. */
  readonly toPlay: PlayerId;
  /** Карты текущей (незавершённой) взятки. */
  readonly currentTrick: readonly PlayedCard[];
  /** Завершённые взятки в порядке розыгрыша. */
  readonly completedTricks: readonly CompletedTrick[];
  /** Число взяток по игрокам. */
  readonly tricksWon: Readonly<Record<PlayerId, number>>;
  /** Вскрытая карта прикупа для текущей взятки (распасы, §8.2); иначе `null`. */
  readonly revealedWidowCard: Card | null;
}

export interface CreatePlayInput {
  readonly mode: PlayMode;
  readonly dealer: PlayerId;
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;
  /** Кто ходит первым; по умолчанию — по §2.4. */
  readonly leader?: PlayerId;
  /** Уже выложенные карты текущей взятки (для позиционных тестов и восстановления). */
  readonly currentTrick?: readonly PlayedCard[];
  readonly completedTricks?: readonly CompletedTrick[];
}

/** Козырь текущего розыгрыша: `null` для БК, мизера и распасов (§6.2, §7.2, §8.1). */
export function currentTrumpSuit(state: PlayState): Suit | null {
  return state.mode.kind === 'contract' ? contractTrump(state.mode.contract) : null;
}

/** Номер текущей взятки, начиная с 1. */
export function currentTrickNumber(state: PlayState): number {
  return state.completedTricks.length + 1;
}

/**
 * Масть текущего хода. На распасах в первых двух взятках её задаёт
 * вскрытая карта прикупа (§8.2), иначе — первая карта взятки.
 * `null`, если взятка ещё не начата.
 */
export function currentLedSuit(state: PlayState): Suit | null {
  if (state.revealedWidowCard) return state.revealedWidowCard.suit;
  const first = state.currentTrick[0];
  return first ? first.card.suit : null;
}

/** Первый ход раздачи по §2.4. */
function defaultLeader(mode: PlayMode, dealer: PlayerId): PlayerId {
  return mode.kind === 'contract' ? mode.declarer : firstHand(dealer);
}

/** Карта прикупа, вскрываемая перед взяткой `trickNumber` (§8.2). */
function widowCardForTrick(mode: PlayMode, trickNumber: number): Card | null {
  if (mode.kind !== 'raspasy') return null;
  if (trickNumber === 1) return mode.widow[0];
  if (trickNumber === 2) return mode.widow[1];
  return null;
}

/**
 * Кто ходит первым во взятке `trickNumber` на распасах.
 * Первые три взятки заходит первая рука (§8.2 п.1–3), далее — взявший предыдущую.
 */
function raspasyLeaderForTrick(
  dealer: PlayerId,
  trickNumber: number,
  previousWinner: PlayerId | null,
): PlayerId {
  if (trickNumber <= 3 || previousWinner === null) return firstHand(dealer);
  return previousWinner;
}

function assertNoDuplicates(hands: Readonly<Record<PlayerId, readonly Card[]>>): void {
  const seen = new Set<string>();
  for (const player of PLAYERS) {
    for (const card of hands[player]) {
      const id = cardId(card);
      if (seen.has(id)) {
        throw new Error(`Дубль карты ${id} в руках игроков`);
      }
      seen.add(id);
    }
  }
}

/** Создать состояние розыгрыша. */
export function createPlay(input: CreatePlayInput): PlayState {
  assertNoDuplicates(input.hands);

  const completedTricks = input.completedTricks ?? [];
  const currentTrick = input.currentTrick ?? [];
  const trickNumber = completedTricks.length + 1;
  const leader =
    input.leader ??
    (currentTrick[0]?.player ?? defaultLeader(input.mode, input.dealer));

  const tricksWon: Record<PlayerId, number> = { 0: 0, 1: 0, 2: 0 };
  for (const trick of completedTricks) {
    tricksWon[trick.winner] += 1;
  }

  let toPlay = leader;
  for (let i = 0; i < currentTrick.length; i += 1) {
    toPlay = playerAfter(toPlay);
  }

  return Object.freeze({
    mode: input.mode,
    dealer: input.dealer,
    hands: Object.freeze({
      0: Object.freeze(sortCards(input.hands[0])),
      1: Object.freeze(sortCards(input.hands[1])),
      2: Object.freeze(sortCards(input.hands[2])),
    }),
    leader,
    toPlay,
    currentTrick: Object.freeze([...currentTrick]),
    completedTricks: Object.freeze([...completedTricks]),
    tricksWon: Object.freeze(tricksWon),
    revealedWidowCard: widowCardForTrick(input.mode, trickNumber),
  });
}

/** Раздача окончена: карт в руках не осталось (§6.4). */
export function isTerminal(state: PlayState): boolean {
  return PLAYERS.every((p) => state.hands[p].length === 0) && state.currentTrick.length === 0;
}

/**
 * Допустимые ходы игрока, который ходит сейчас (§6.2):
 *   первый ход во взятке    -> любая карта;
 *   есть масть хода         -> только карты этой масти (бить старшей НЕ обязан);
 *   козырный контракт+козыри-> только козыри;
 *   иначе                   -> любая карта (снос).
 */
export function legalMoves(state: PlayState): readonly Card[] {
  const hand = state.hands[state.toPlay];
  if (hand.length === 0) return [];

  const led = currentLedSuit(state);
  if (led === null) return hand;

  const inSuit = hand.filter((c) => c.suit === led);
  if (inSuit.length > 0) return inSuit;

  const trump = currentTrumpSuit(state);
  if (trump !== null) {
    const trumps = hand.filter((c) => c.suit === trump);
    if (trumps.length > 0) return trumps;
  }

  return hand;
}

/** Допустимые ходы в виде идентификаторов — удобно для UI, ботов и тестов. */
export function legalMoveIds(state: PlayState): string[] {
  return legalMoves(state).map(cardId);
}

/** Ход легален? */
export function isLegalMove(state: PlayState, card: Card): boolean {
  return legalMoves(state).some((c) => sameCard(c, card));
}

/**
 * Победитель взятки (§6.3): старший козырь, иначе старшая карта масти хода.
 * `ledSuitOverride` задаёт масть хода явно (распасы: её задаёт карта прикупа).
 * `null`, если взятка пуста или никто не положил масть хода при явном override.
 */
export function trickWinner(
  plays: readonly PlayedCard[],
  trumpSuit: Suit | null,
  ledSuitOverride?: Suit,
): PlayerId | null {
  if (plays.length === 0) return null;

  if (trumpSuit !== null) {
    const trumps = plays.filter((p) => p.card.suit === trumpSuit);
    if (trumps.length > 0) {
      return trumps.reduce((best, p) =>
        rankOrder(p.card.rank) > rankOrder(best.card.rank) ? p : best,
      ).player;
    }
  }

  const led = ledSuitOverride ?? (plays[0] as PlayedCard).card.suit;
  const inSuit = plays.filter((p) => p.card.suit === led);
  if (inSuit.length === 0) return null;

  return inSuit.reduce((best, p) =>
    rankOrder(p.card.rank) > rankOrder(best.card.rank) ? p : best,
  ).player;
}

function removeCard(hand: readonly Card[], card: Card): Card[] {
  const index = hand.findIndex((c) => sameCard(c, card));
  if (index < 0) {
    throw new Error(`Карты ${cardId(card)} нет в руке игрока`);
  }
  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

/**
 * Сыграть карту. Возвращает новое состояние; исходное не мутируется.
 * Нелегальный ход, карта не из руки и ход в оконченной раздаче отвергаются с ошибкой.
 */
export function applyMove(state: PlayState, card: Card): PlayState {
  if (isTerminal(state)) {
    throw new Error('Розыгрыш окончен: ходить больше нельзя');
  }

  const player = state.toPlay;
  const hand = state.hands[player];
  if (!hand.some((c) => sameCard(c, card))) {
    throw new Error(`Карты ${cardId(card)} нет в руке игрока ${player}`);
  }
  if (!isLegalMove(state, card)) {
    const allowed = legalMoveIds(state).join(', ');
    throw new Error(
      `Нелегальный ход ${cardId(card)} игрока ${player}: допустимы только [${allowed}]`,
    );
  }

  const hands: Record<PlayerId, readonly Card[]> = {
    0: state.hands[0],
    1: state.hands[1],
    2: state.hands[2],
  };
  hands[player] = removeCard(hand, card);

  const plays: PlayedCard[] = [...state.currentTrick, { player, card }];

  // Взятка ещё не завершена — ход переходит следующему по часовой стрелке.
  if (plays.length < PLAYERS.length) {
    return Object.freeze({
      ...state,
      hands: Object.freeze(hands),
      currentTrick: Object.freeze(plays),
      toPlay: playerAfter(player),
    });
  }

  // Взятка завершена.
  const trickNumber = currentTrickNumber(state);
  const widowCard = state.revealedWidowCard;
  const ledSuit = currentLedSuit(state);
  const trump = currentTrumpSuit(state);

  const winnerBySuit = trickWinner(plays, trump, ledSuit ?? undefined);
  // Распасы, §8.2 п.1: если масть прикупа не положил никто, взятку берёт ходивший первым.
  const winner: PlayerId = winnerBySuit ?? state.leader;

  const completed: CompletedTrick = Object.freeze({
    number: trickNumber,
    leader: state.leader,
    plays: Object.freeze(plays),
    winner,
    widowCard,
  });

  const tricksWon: Record<PlayerId, number> = { ...state.tricksWon };
  tricksWon[winner] += 1;

  const completedTricks = [...state.completedTricks, completed];
  const nextTrickNumber = completedTricks.length + 1;
  const nextLeader =
    state.mode.kind === 'raspasy'
      ? raspasyLeaderForTrick(state.dealer, nextTrickNumber, winner)
      : winner;

  return Object.freeze({
    ...state,
    hands: Object.freeze(hands),
    currentTrick: Object.freeze([]),
    completedTricks: Object.freeze(completedTricks),
    tricksWon: Object.freeze(tricksWon),
    leader: nextLeader,
    toPlay: nextLeader,
    revealedWidowCard: widowCardForTrick(state.mode, nextTrickNumber),
  });
}

/** Взятки по игрокам — контракт с модулем расчёта (приложение А.3). */
export function trickCounts(state: PlayState): Record<PlayerId, number> {
  return { ...state.tricksWon };
}

/** Сумма взяток; после завершения раздачи равна 10 (§6.4). */
export function totalTricks(state: PlayState): number {
  return PLAYERS.reduce<number>((sum, p) => sum + state.tricksWon[p], 0);
}

/** Мизер? — удобный предикат для UI и ботов. */
export function isMizerPlay(state: PlayState): boolean {
  return state.mode.kind === 'contract' && isMizer(state.mode.contract);
}

/** Распасы? */
export function isRaspasyPlay(state: PlayState): boolean {
  return state.mode.kind === 'raspasy';
}

/** Максимальное число взяток в раздаче. */
export const MAX_TRICKS = TRICKS_PER_DEAL;
