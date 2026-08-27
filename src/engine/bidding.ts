/**
 * Торговля: состояние заявок и нормативные правила §3.
 * Источник истины: docs/rules.md §3.1–§3.7, сценарии TS-01…TS-08.
 */
import type { Contract, ContractId, PlayerId } from '../core/index.js';
import {
  ALL_CONTRACTS,
  bidOrder,
  contractId,
  handRole,
  isHigherContract,
  isMizer,
  parseContract,
  playerAfter,
} from '../core/index.js';

/** Заявка в журнале торговли. */
export type BidRecord =
  | { readonly kind: 'bid'; readonly player: PlayerId; readonly contract: ContractId }
  | { readonly kind: 'here'; readonly player: PlayerId; readonly contract: ContractId }
  | { readonly kind: 'pass'; readonly player: PlayerId };

/** Состояние торговли. */
export interface BiddingState {
  /** Журнал заявок в порядке объявления. */
  readonly history: readonly BidRecord[];
  /** Игроки, ещё не спасовавшие (§3.4). */
  readonly active: readonly PlayerId[];
  /** Текущая максимальная заявка; `null` до первой значащей. */
  readonly highestBid: ContractId | null;
  /** Кто держит текущую максимальную заявку (с учётом «здесь», §3.6). */
  readonly highestBidder: PlayerId | null;
  /** Заявки, допустимые игроку `toAct` прямо сейчас. */
  readonly legalBids: readonly ContractId[];
  /** Выигравшая заявка после завершения торговли; иначе `null`. */
  readonly wonBid: ContractId | null;
}

/** Пустая торговля: очередь за первой рукой, вся шкала доступна. */
export function createBidding(firstToAct: PlayerId): BiddingState {
  return Object.freeze({
    history: Object.freeze([]),
    active: Object.freeze([firstToAct, playerAfter(firstToAct), playerAfter(playerAfter(firstToAct))]),
    highestBid: null,
    highestBidder: null,
    legalBids: legalBidsFor(firstToAct, null, [], null),
    wonBid: null,
  });
}

/** Игрок уже делал значащую заявку? Нужно для кабальности мизера (§3.7). */
function hasNamedContract(history: readonly BidRecord[], player: PlayerId): boolean {
  return history.some((r) => r.kind !== 'pass' && r.player === player);
}

/**
 * Проверка одной заявки по §3.3 и §3.7.
 * Возвращает текст отказа либо `null`, если заявка допустима.
 */
export function bidRejection(
  candidate: Contract,
  player: PlayerId,
  highest: Contract | null,
  history: readonly BidRecord[],
): string | null {
  // §3.7: мизер — кабальная заявка, только первой значащей заявкой игрока.
  if (isMizer(candidate) && hasNamedContract(history, player)) {
    return 'Мизер кабальный: его объявляют только первой значащей заявкой (§3.7)';
  }
  // §3.3: каждая новая заявка строго старше текущего максимума.
  if (highest !== null && !isHigherContract(candidate, highest)) {
    return `Заявка ${contractId(candidate)} должна быть строго старше ${contractId(highest)} по шкале (§3.3)`;
  }
  return null;
}

/** Допустимые заявки игрока в текущей позиции (§3.3, §3.7). */
export function legalBidsFor(
  player: PlayerId,
  highest: Contract | null,
  history: readonly BidRecord[],
  _highestBidder: PlayerId | null,
): readonly ContractId[] {
  return Object.freeze(
    ALL_CONTRACTS.filter((c) => bidRejection(c, player, highest, history) === null)
      .sort((a, b) => bidOrder(a) - bidOrder(b))
      .map(contractId),
  );
}

/**
 * «Здесь» допустимо (§3.6), если активных участников ровно двое
 * и заявляющий старше по руке, чем автор текущей максимальной заявки.
 * Возвращает текст отказа либо `null`.
 */
export function hereRejection(
  player: PlayerId,
  state: BiddingState,
  dealer: PlayerId,
): string | null {
  if (state.active.length !== 2) {
    return '«Здесь» доступно, только когда в торговле остались двое (§3.6)';
  }
  if (state.highestBid === null || state.highestBidder === null) {
    return '«Здесь» нечего перебивать: значащих заявок ещё не было (§3.6)';
  }
  if (state.highestBidder === player) {
    return '«Здесь» перебивают заявку соперника, а не свою (§3.6)';
  }
  const ROLE_RANK = { first: 0, second: 1, third: 2 } as const;
  if (ROLE_RANK[handRole(player, dealer)] >= ROLE_RANK[handRole(state.highestBidder, dealer)]) {
    return '«Здесь» доступно только игроку, который старше по руке (§3.6)';
  }
  return null;
}

/** Пересчитать `legalBids` под текущего ходящего. */
export function withLegalBids(state: BiddingState, toAct: PlayerId | null): BiddingState {
  const highest = state.highestBid === null ? null : parseContract(state.highestBid);
  return Object.freeze({
    ...state,
    legalBids:
      toAct === null ? Object.freeze([]) : legalBidsFor(toAct, highest, state.history, state.highestBidder),
  });
}

/** Следующий активный участник торговли по часовой стрелке. */
export function nextActive(active: readonly PlayerId[], current: PlayerId): PlayerId | null {
  if (active.length === 0) return null;
  let candidate = playerAfter(current);
  for (let i = 0; i < 3; i += 1) {
    if (active.includes(candidate)) return candidate;
    candidate = playerAfter(candidate);
  }
  return null;
}

/**
 * Торговля окончена (§3.5)? Возвращает исход:
 *  - `passout` — все трое спасовали первым словом;
 *  - `won` — остался один активный участник со значащей заявкой;
 *  - `null` — торговля продолжается.
 */
export function biddingOutcome(
  state: BiddingState,
): { readonly kind: 'passout' } | { readonly kind: 'won'; readonly player: PlayerId; readonly contract: ContractId } | null {
  if (state.active.length === 0) return { kind: 'passout' };
  if (state.active.length === 1 && state.highestBid !== null && state.highestBidder !== null) {
    return { kind: 'won', player: state.highestBidder, contract: state.highestBid };
  }
  return null;
}
