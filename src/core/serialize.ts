/**
 * Сериализация состояния розыгрыша в JSON и обратно.
 * Нужна UI (сохранение партии) и ботам (передача позиции, реплеи).
 *
 * Формат — плоский снимок из строк и чисел: карты кодируются `CardId` (§1.4),
 * контракты — `ContractId` (приложение А.1).
 */
import type { Card, CardId } from './cards.js';
import { cardId, parseCard } from './cards.js';
import type { ContractId } from './contract.js';
import { contractId, parseContract } from './contract.js';
import type { PlayerId } from './deal.js';
import { PLAYERS } from './deal.js';
import type { CompletedTrick, PlayMode, PlayState, PlayedCard } from './play.js';
import { createPlay } from './play.js';

/** Версия формата снимка. */
export const SNAPSHOT_VERSION = 1;

export interface PlayedCardSnapshot {
  readonly player: PlayerId;
  readonly card: CardId;
}

export interface CompletedTrickSnapshot {
  readonly number: number;
  readonly leader: PlayerId;
  readonly plays: readonly PlayedCardSnapshot[];
  readonly winner: PlayerId;
  readonly widowCard: CardId | null;
}

export type PlayModeSnapshot =
  | { readonly kind: 'contract'; readonly contract: ContractId; readonly declarer: PlayerId }
  | { readonly kind: 'raspasy'; readonly widow: readonly [CardId, CardId] };

export interface PlayStateSnapshot {
  readonly version: number;
  readonly mode: PlayModeSnapshot;
  readonly dealer: PlayerId;
  readonly hands: Readonly<Record<PlayerId, readonly CardId[]>>;
  readonly leader: PlayerId;
  readonly toPlay: PlayerId;
  readonly currentTrick: readonly PlayedCardSnapshot[];
  readonly completedTricks: readonly CompletedTrickSnapshot[];
  readonly tricksWon: Readonly<Record<PlayerId, number>>;
}

function serializeMode(mode: PlayMode): PlayModeSnapshot {
  if (mode.kind === 'contract') {
    return { kind: 'contract', contract: contractId(mode.contract), declarer: mode.declarer };
  }
  return { kind: 'raspasy', widow: [cardId(mode.widow[0]), cardId(mode.widow[1])] };
}

function serializePlays(plays: readonly PlayedCard[]): PlayedCardSnapshot[] {
  return plays.map((p) => ({ player: p.player, card: cardId(p.card) }));
}

function serializeTrick(trick: CompletedTrick): CompletedTrickSnapshot {
  return {
    number: trick.number,
    leader: trick.leader,
    plays: serializePlays(trick.plays),
    winner: trick.winner,
    widowCard: trick.widowCard ? cardId(trick.widowCard) : null,
  };
}

/** Снимок состояния розыгрыша — чистые JSON-значения. */
export function serializePlayState(state: PlayState): PlayStateSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    mode: serializeMode(state.mode),
    dealer: state.dealer,
    hands: {
      0: state.hands[0].map(cardId),
      1: state.hands[1].map(cardId),
      2: state.hands[2].map(cardId),
    },
    leader: state.leader,
    toPlay: state.toPlay,
    currentTrick: serializePlays(state.currentTrick),
    completedTricks: state.completedTricks.map(serializeTrick),
    tricksWon: { ...state.tricksWon },
  };
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 0 || value === 1 || value === 2;
}

function requirePlayer(value: unknown, field: string): PlayerId {
  if (!isPlayerId(value)) {
    throw new Error(`Некорректный снимок: поле ${field} должно быть игроком 0..2`);
  }
  return value;
}

function deserializeMode(snapshot: PlayModeSnapshot): PlayMode {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Некорректный снимок: отсутствует режим розыгрыша');
  }
  if (snapshot.kind === 'contract') {
    return {
      kind: 'contract',
      contract: parseContract(snapshot.contract),
      declarer: requirePlayer(snapshot.declarer, 'mode.declarer'),
    };
  }
  if (snapshot.kind === 'raspasy') {
    const widow = snapshot.widow;
    if (!Array.isArray(widow) || widow.length !== 2) {
      throw new Error('Некорректный снимок: прикуп распасов должен содержать 2 карты');
    }
    return { kind: 'raspasy', widow: [parseCard(widow[0]), parseCard(widow[1])] };
  }
  throw new Error(`Некорректный снимок: неизвестный режим ${JSON.stringify(snapshot)}`);
}

function deserializePlays(plays: readonly PlayedCardSnapshot[]): PlayedCard[] {
  if (!Array.isArray(plays)) {
    throw new Error('Некорректный снимок: список выложенных карт должен быть массивом');
  }
  return plays.map((p) => ({
    player: requirePlayer(p?.player, 'plays[].player'),
    card: parseCard(p?.card as string),
  }));
}

function deserializeHand(hand: readonly CardId[] | undefined, player: PlayerId): Card[] {
  if (!Array.isArray(hand)) {
    throw new Error(`Некорректный снимок: рука игрока ${player} должна быть массивом CardId`);
  }
  return hand.map((id) => parseCard(id as string));
}

/** Восстановить состояние розыгрыша из снимка. Бросает на любом отклонении формата. */
export function deserializePlayState(snapshot: PlayStateSnapshot): PlayState {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Некорректный снимок: ожидается объект');
  }
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `Неподдерживаемая версия снимка: ${snapshot.version} (поддерживается ${SNAPSHOT_VERSION})`,
    );
  }

  const mode = deserializeMode(snapshot.mode);
  const dealer = requirePlayer(snapshot.dealer, 'dealer');
  const hands = {
    0: deserializeHand(snapshot.hands?.[0], 0),
    1: deserializeHand(snapshot.hands?.[1], 1),
    2: deserializeHand(snapshot.hands?.[2], 2),
  } as Record<PlayerId, Card[]>;

  const completedTricks: CompletedTrick[] = (snapshot.completedTricks ?? []).map((t) => ({
    number: t.number,
    leader: requirePlayer(t.leader, 'completedTricks[].leader'),
    plays: deserializePlays(t.plays),
    winner: requirePlayer(t.winner, 'completedTricks[].winner'),
    widowCard: t.widowCard ? parseCard(t.widowCard) : null,
  }));

  const state = createPlay({
    mode,
    dealer,
    hands,
    leader: requirePlayer(snapshot.leader, 'leader'),
    currentTrick: deserializePlays(snapshot.currentTrick ?? []),
    completedTricks,
  });

  const expectedToPlay = requirePlayer(snapshot.toPlay, 'toPlay');
  if (state.toPlay !== expectedToPlay) {
    throw new Error(
      `Несогласованный снимок: toPlay = ${expectedToPlay}, но по взятке ходит ${state.toPlay}`,
    );
  }
  for (const player of PLAYERS) {
    const declared = snapshot.tricksWon?.[player];
    if (typeof declared === 'number' && declared !== state.tricksWon[player]) {
      throw new Error(
        `Несогласованный снимок: tricksWon[${player}] = ${declared}, ` +
          `по завершённым взяткам ${state.tricksWon[player]}`,
      );
    }
  }

  return state;
}

/** Состояние → строка JSON. */
export function toJson(state: PlayState): string {
  return JSON.stringify(serializePlayState(state));
}

/** Строка JSON → состояние. */
export function fromJson(json: string): PlayState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Некорректный JSON снимка: ${(error as Error).message}`);
  }
  return deserializePlayState(parsed as PlayStateSnapshot);
}
