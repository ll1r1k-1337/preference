/**
 * Типы движка раздачи: фазы, состояние, команды, события, ошибки.
 * Источник истины: docs/rules.md §2–§9, приложение А.3.
 */
import type { Card, CardId, ContractId, PlayerId, PlayState, Suit } from '../core/index.js';
import type { BiddingState } from './bidding.js';
import type { DealOutcome } from './outcome.js';
import type { DefenseMode, WhistState } from './whist.js';

/**
 * Фазы раздачи (конечный автомат):
 * DEAL -> BIDDING -> (PASSOUT | WIDOW_PICKUP -> DISCARD -> FINAL_CONTRACT
 *                    -> WHIST_DECLARATION) -> PLAY -> RESULT.
 */
export type Phase =
  | 'DEAL'
  | 'BIDDING'
  | 'PASSOUT'
  | 'WIDOW_PICKUP'
  | 'DISCARD'
  | 'FINAL_CONTRACT'
  | 'WHIST_DECLARATION'
  | 'PLAY'
  | 'RESULT';

/** Код отказа. Каждая отвергнутая команда получает код и человекочитаемый текст. */
export type ErrorCode =
  | 'WRONG_PHASE'
  | 'WRONG_ACTOR'
  | 'ILLEGAL_BID'
  | 'ILLEGAL_DISCARD'
  | 'ILLEGAL_CONTRACT'
  | 'ILLEGAL_WHIST'
  | 'ILLEGAL_MOVE'
  | 'UNKNOWN_COMMAND';

/** Отказ движка: команда не изменила состояние. */
export interface EngineError {
  readonly code: ErrorCode;
  readonly message: string;
}

/** Событие движка — журнал того, что произошло по команде. */
export type EngineEvent =
  | { readonly type: 'PHASE_CHANGED'; readonly from: Phase; readonly to: Phase }
  | { readonly type: 'BID_MADE'; readonly player: PlayerId; readonly contract: ContractId }
  | { readonly type: 'HERE_DECLARED'; readonly player: PlayerId; readonly contract: ContractId }
  | { readonly type: 'PASSED'; readonly player: PlayerId }
  | { readonly type: 'BIDDING_WON'; readonly player: PlayerId; readonly contract: ContractId }
  | { readonly type: 'PASSOUT_DECLARED' }
  | { readonly type: 'WIDOW_TAKEN'; readonly player: PlayerId; readonly cards: readonly CardId[] }
  | { readonly type: 'DISCARDED'; readonly player: PlayerId; readonly cards: readonly CardId[] }
  | { readonly type: 'CONTRACT_DECLARED'; readonly player: PlayerId; readonly contract: ContractId }
  | { readonly type: 'WHIST_DECLARED'; readonly player: PlayerId; readonly mode: DefenseMode | null }
  | { readonly type: 'WHIST_PASSED'; readonly player: PlayerId }
  | { readonly type: 'DEFENSE_MODE_SET'; readonly mode: DefenseMode }
  | { readonly type: 'HANDS_REVEALED'; readonly players: readonly PlayerId[] }
  | { readonly type: 'PLAYED_ON_OWN' }
  | { readonly type: 'CARD_PLAYED'; readonly player: PlayerId; readonly card: CardId }
  | {
      readonly type: 'TRICK_TAKEN';
      readonly number: number;
      readonly winner: PlayerId;
      readonly cards: readonly CardId[];
    }
  | { readonly type: 'DEAL_FINISHED'; readonly outcome: DealOutcome };

/** Команда игрока. */
export type Command =
  | { readonly type: 'START_BIDDING'; readonly player: PlayerId }
  | { readonly type: 'BID'; readonly player: PlayerId; readonly contract: string }
  | { readonly type: 'HERE'; readonly player: PlayerId }
  | { readonly type: 'PASS'; readonly player: PlayerId }
  | { readonly type: 'TAKE_WIDOW'; readonly player: PlayerId }
  | { readonly type: 'DISCARD'; readonly player: PlayerId; readonly cards: readonly string[] }
  | { readonly type: 'DECLARE_CONTRACT'; readonly player: PlayerId; readonly contract: string }
  | { readonly type: 'WHIST'; readonly player: PlayerId; readonly mode?: DefenseMode }
  | { readonly type: 'PASS_WHIST'; readonly player: PlayerId }
  | { readonly type: 'START_PLAY'; readonly player: PlayerId }
  | { readonly type: 'PLAY_CARD'; readonly player: PlayerId; readonly card: string };

/** Иммутабельное состояние раздачи. */
export interface DealState {
  readonly phase: Phase;
  readonly dealer: PlayerId;
  readonly firstHand: PlayerId;
  readonly hands: Readonly<Record<PlayerId, readonly Card[]>>;
  readonly widow: readonly Card[];
  /** Прикуп вскрыт и виден всем (§4.1). */
  readonly widowRevealed: boolean;
  /** Чей сейчас ход/заявка; `null`, если ход не за игроком. */
  readonly toAct: PlayerId | null;
  /** Состояние торговли; `null` в фазе DEAL. */
  readonly bidding: BiddingState | null;
  /** Разыгрывающий; `null` до конца торговли и на распасах. */
  readonly declarer: PlayerId | null;
  /** Снесённые игроком карты (§4.2); пусто до сноса. */
  readonly discard: readonly CardId[];
  /** Окончательный контракт (§4.3); `null` до заказа и на распасах. */
  readonly contract: ContractId | null;
  /** Допустимые окончательные заказы в фазе FINAL_CONTRACT; иначе пусто. */
  readonly legalContracts: readonly ContractId[];
  /** Состояние опроса вистующих; `null` вне игры на взятки. */
  readonly whist: WhistState | null;
  /** Кто из соперников вистовал (§4.4); пусто до конца опроса. */
  readonly whisted: Readonly<Partial<Record<PlayerId, boolean>>>;
  /** Обязательства обороны в взятках (§5.3). */
  readonly whistObligation: Readonly<Partial<Record<PlayerId, number>>>;
  /** Режим розыгрыша обороны (§5.2); `null` до его определения. */
  readonly defenseMode: DefenseMode | null;
  /** Игроки с раскрытыми картами (§5.2, §7.4). */
  readonly revealedHands: readonly PlayerId[];
  /** Кто фактически ходит картами игрока (§5.2, вист всветлую). */
  readonly controlledBy: Readonly<Record<PlayerId, PlayerId>>;
  /** Состояние розыгрыша ядра; `null` вне фазы PLAY. */
  readonly play: PlayState | null;
  /** Козырь текущего розыгрыша; `null` на БК, мизере и распасах. */
  readonly trumpSuit: Suit | null;
  /** Допустимые ходы игрока `toAct` в фазе PLAY; иначе пусто. */
  readonly legalMoves: readonly CardId[];
  /** Номер распаса подряд (§8.4); передаётся при создании раздачи. */
  readonly consecutiveRaspasy: number;
  /** Результат раздачи; `null` до фазы RESULT. */
  readonly outcome: DealOutcome | null;
}

/** Результат обработки команды: новое состояние с журналом либо отказ. */
export type DispatchResult =
  | { readonly ok: true; readonly state: DealState; readonly events: readonly EngineEvent[] }
  | { readonly ok: false; readonly error: EngineError };
