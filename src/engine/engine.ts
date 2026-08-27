/**
 * Движок раздачи: конечный автомат фаз и обработка команд игроков.
 * Источник истины: docs/rules.md §2–§8.
 *
 * Все переходы иммутабельны: `dispatch` возвращает новое состояние либо отказ,
 * исходное состояние не меняется никогда.
 */
import type { Card, CardId, Contract, ContractId, PlayerId, PlayState, Seed } from '../core/index.js';
import {
  applyMove,
  cardId,
  contractId,
  createPlay,
  dealCards,
  firstHand,
  isTerminal,
  legalMoveIds,
  parseCard,
  parseContract,
  currentTrumpSuit,
} from '../core/index.js';
import type { BidRecord, BiddingState } from './bidding.js';
import {
  bidRejection,
  biddingOutcome,
  createBidding,
  hereRejection,
  nextActive,
  withLegalBids,
} from './bidding.js';
import {
  applyDiscard,
  discardRejection,
  finalContractRejection,
  legalFinalContracts,
  pickUpWidow,
  widowIds,
} from './widow.js';
import type { WhistState } from './whist.js';
import {
  createWhist,
  isWhistComplete,
  nextDefender,
  resolveControl,
  resolveDefenseMode,
  resolveObligations,
  revealedHandsFor,
  whistModeRejection,
  whistedFlags,
} from './whist.js';
import {
  contractOutcome,
  playedOnOwnOutcome,
  raspasyOutcome,
  tricksFromPlay,
} from './outcome.js';
import type { Command, DealState, DispatchResult, EngineError, EngineEvent, ErrorCode } from './types.js';

export interface CreateDealInput {
  readonly seed: Seed;
  readonly dealer: PlayerId;
  /** Номер распаса подряд для §8.4; по умолчанию 0. */
  readonly consecutiveRaspasy?: number;
}

function fail(code: ErrorCode, message: string): DispatchResult {
  return { ok: false, error: Object.freeze({ code, message }) };
}

function ok(state: DealState, events: readonly EngineEvent[]): DispatchResult {
  return { ok: true, state, events: Object.freeze([...events]) };
}

/** Сдать карты и открыть раздачу в фазе DEAL (§2.3). */
export function createDeal(input: CreateDealInput): DealState {
  const dealt = dealCards({ seed: input.seed, dealer: input.dealer });
  return Object.freeze({
    phase: 'DEAL' as const,
    dealer: dealt.dealer,
    firstHand: dealt.firstHand,
    hands: dealt.hands,
    widow: dealt.widow,
    widowRevealed: false,
    toAct: null,
    bidding: null,
    declarer: null,
    discard: Object.freeze([]),
    contract: null,
    legalContracts: Object.freeze([]),
    whist: null,
    whisted: Object.freeze({}),
    whistObligation: Object.freeze({}),
    defenseMode: null,
    revealedHands: Object.freeze([]),
    controlledBy: Object.freeze({ 0: 0, 1: 1, 2: 2 }),
    play: null,
    trumpSuit: null,
    legalMoves: Object.freeze([]),
    consecutiveRaspasy: input.consecutiveRaspasy ?? 0,
    outcome: null,
  });
}

/** Разбор строки контракта; `null`, если строка не является контрактом. */
function tryParseContract(id: string): Contract | null {
  try {
    return parseContract(id);
  } catch {
    return null;
  }
}

/** Разбор строки карты; `null`, если строка не является картой. */
function tryParseCard(id: string): Card | null {
  try {
    return parseCard(id);
  } catch {
    return null;
  }
}

/**
 * Перевести состояние в фазу PLAY с созданным розыгрышем ядра (§2.4).
 * `hands` синхронизируются с ядром: единственный источник истины по картам
 * во время розыгрыша — `play.hands`, иначе UI показывал бы уже сыгранные карты.
 */
function enterPlay(state: DealState, play: PlayState, events: EngineEvent[]): DealState {
  events.push({ type: 'PHASE_CHANGED', from: state.phase, to: 'PLAY' });
  return Object.freeze({
    ...state,
    phase: 'PLAY' as const,
    hands: play.hands,
    play,
    trumpSuit: currentTrumpSuit(play),
    toAct: state.controlledBy[play.toPlay] ?? play.toPlay,
    legalMoves: Object.freeze(legalMoveIds(play) as CardId[]),
  });
}

/** Начать розыгрыш распасов (§8.1, §8.2). */
function startRaspasy(state: DealState, events: EngineEvent[]): DealState {
  const widow = state.widow;
  const play = createPlay({
    mode: { kind: 'raspasy', widow: [widow[0] as Card, widow[1] as Card] },
    dealer: state.dealer,
    hands: state.hands,
  });
  const withMode: DealState = Object.freeze({
    ...state,
    defenseMode: 'dark' as const,
    revealedHands: Object.freeze([]),
  });
  return enterPlay(withMode, play, events);
}

/**
 * Завершить торговлю, если её исход определён (§3.5):
 * распасы либо переход к прикупу с назначенным разыгрывающим.
 */
function settleBidding(state: DealState, bidding: BiddingState, events: EngineEvent[]): DealState {
  const outcome = biddingOutcome(bidding);

  if (outcome === null) {
    const toAct = nextActive(bidding.active, state.toAct as PlayerId);
    return Object.freeze({ ...state, bidding: withLegalBids(bidding, toAct), toAct });
  }

  if (outcome.kind === 'passout') {
    // §3.5, §8.1: три паса первым словом — распасы, ролей игрока/вистующих нет.
    events.push({ type: 'PASSOUT_DECLARED' });
    events.push({ type: 'PHASE_CHANGED', from: state.phase, to: 'PASSOUT' });
    return Object.freeze({
      ...state,
      phase: 'PASSOUT' as const,
      bidding: withLegalBids({ ...bidding, wonBid: null }, null),
      toAct: null,
      declarer: null,
    });
  }

  // §4.1: торговля выиграна — прикуп вскрывается и передаётся игроку.
  events.push({ type: 'BIDDING_WON', player: outcome.player, contract: outcome.contract });
  events.push({ type: 'PHASE_CHANGED', from: state.phase, to: 'WIDOW_PICKUP' });
  return Object.freeze({
    ...state,
    phase: 'WIDOW_PICKUP' as const,
    bidding: withLegalBids({ ...bidding, wonBid: outcome.contract }, null),
    widowRevealed: true,
    toAct: outcome.player,
    declarer: outcome.player,
  });
}

/**
 * Закрыть опрос вистующих (§4.4, §5.2):
 *  - оба спасовали — розыгрыша нет, игра «на своих», сразу RESULT (TS-37);
 *  - иначе — определяется режим обороны и начинается розыгрыш.
 */
function settleWhist(state: DealState, whist: WhistState, events: EngineEvent[]): DealState {
  if (!isWhistComplete(whist)) {
    return Object.freeze({ ...state, whist, toAct: nextDefender(whist) });
  }

  const declarer = state.declarer as PlayerId;
  const contract = state.contract as ContractId;
  const flags = whistedFlags(whist);
  const someoneWhisted = whist.order.some((p) => flags[p] === true);

  if (!someoneWhisted) {
    // §5.2, TS-37: оба спасовали — игрок сразу получает очки за контракт.
    const outcome = playedOnOwnOutcome({ contract, declarer, defenders: whist.order });
    events.push({ type: 'PLAYED_ON_OWN' });
    events.push({ type: 'DEAL_FINISHED', outcome });
    events.push({ type: 'PHASE_CHANGED', from: state.phase, to: 'RESULT' });
    return Object.freeze({
      ...state,
      phase: 'RESULT' as const,
      whist,
      whisted: flags,
      whistObligation: resolveObligations(whist, parseContract(contract)),
      defenseMode: 'dark' as const,
      toAct: null,
      legalMoves: Object.freeze([]),
      outcome,
    });
  }

  const parsed = parseContract(contract);
  const mode = resolveDefenseMode(whist, parsed);
  const revealed = revealedHandsFor(whist, mode);
  events.push({ type: 'DEFENSE_MODE_SET', mode });
  if (revealed.length > 0) {
    events.push({ type: 'HANDS_REVEALED', players: revealed });
  }

  const withDefense: DealState = Object.freeze({
    ...state,
    whist,
    whisted: flags,
    whistObligation: resolveObligations(whist, parsed),
    defenseMode: mode,
    revealedHands: revealed,
    controlledBy: resolveControl(declarer, whist, mode),
  });

  const play = createPlay({
    mode: { kind: 'contract', contract: parsed, declarer },
    dealer: state.dealer,
    hands: state.hands,
  });
  return enterPlay(withDefense, play, events);
}

/** Общая проверка для команд торговли: фаза и очередь. */
function requireBiddingTurn(state: DealState, player: PlayerId): DispatchResult | BiddingState {
  if (state.phase !== 'BIDDING' || state.bidding === null) {
    return fail('WRONG_PHASE', `Заявки принимаются только в фазе BIDDING, сейчас ${state.phase}`);
  }
  if (state.toAct !== player) {
    return fail(
      'WRONG_ACTOR',
      state.bidding.active.includes(player)
        ? `Сейчас заявляет игрок ${String(state.toAct)}, а не ${player}`
        : `Игрок ${player} спасовал и выбыл из торговли (§3.4)`,
    );
  }
  return state.bidding;
}

/** Общая проверка для команд виста: фаза и очередь. */
function requireWhistTurn(state: DealState, player: PlayerId): DispatchResult | WhistState {
  if (state.phase !== 'WHIST_DECLARATION' || state.whist === null) {
    return fail(
      'WRONG_PHASE',
      `Вистовые заявки принимаются только в фазе WHIST_DECLARATION, сейчас ${state.phase}`,
    );
  }
  if (state.toAct !== player) {
    return fail(
      'WRONG_ACTOR',
      player === state.declarer
        ? 'Разыгрывающий не вистует — вистуют его соперники (§5.1)'
        : `Сейчас отвечает игрок ${String(state.toAct)}, а не ${player}`,
    );
  }
  return state.whist;
}

function isDispatchResult(value: DispatchResult | BiddingState | WhistState): value is DispatchResult {
  return 'ok' in value;
}

/** Завершить раздачу после последней взятки (§6.4, приложение А.3). */
function finishDeal(state: DealState, play: PlayState, events: EngineEvent[]): DealState {
  const tricks = tricksFromPlay(play);
  const outcome =
    state.contract === null
      ? raspasyOutcome(tricks, state.consecutiveRaspasy)
      : contractOutcome({
          contract: state.contract,
          declarer: state.declarer as PlayerId,
          tricks,
          whisted: state.whisted as Readonly<Record<PlayerId, boolean>>,
          mode: state.defenseMode ?? 'dark',
        });

  events.push({ type: 'DEAL_FINISHED', outcome });
  events.push({ type: 'PHASE_CHANGED', from: state.phase, to: 'RESULT' });
  return Object.freeze({
    ...state,
    phase: 'RESULT' as const,
    hands: play.hands,
    play,
    toAct: null,
    legalMoves: Object.freeze([]),
    outcome,
  });
}

/** Обработать команду. Возвращает новое состояние либо отказ; вход не мутируется. */
export function dispatch(state: DealState, command: Command): DispatchResult {
  switch (command.type) {
    case 'START_BIDDING': {
      if (state.phase !== 'DEAL') {
        return fail('WRONG_PHASE', `Торговлю можно начать только в фазе DEAL, сейчас ${state.phase}`);
      }
      if (command.player !== state.dealer) {
        return fail('WRONG_ACTOR', `Торговлю открывает сдающий (игрок ${state.dealer})`);
      }
      const opener = firstHand(state.dealer);
      const next: DealState = Object.freeze({
        ...state,
        phase: 'BIDDING' as const,
        bidding: createBidding(opener),
        toAct: opener,
      });
      return ok(next, [{ type: 'PHASE_CHANGED', from: state.phase, to: next.phase }]);
    }

    case 'BID': {
      const guard = requireBiddingTurn(state, command.player);
      if (isDispatchResult(guard)) return guard;
      const bidding = guard as BiddingState;

      const candidate = tryParseContract(command.contract);
      if (candidate === null) {
        return fail('ILLEGAL_BID', `Неизвестный контракт: ${JSON.stringify(command.contract)}`);
      }
      const highest = bidding.highestBid === null ? null : parseContract(bidding.highestBid);
      const rejection = bidRejection(candidate, command.player, highest, bidding.history);
      if (rejection !== null) {
        return fail('ILLEGAL_BID', rejection);
      }

      const id: ContractId = contractId(candidate);
      const record: BidRecord = { kind: 'bid', player: command.player, contract: id };
      const nextBidding: BiddingState = {
        ...bidding,
        history: [...bidding.history, record],
        highestBid: id,
        highestBidder: command.player,
      };

      const events: EngineEvent[] = [{ type: 'BID_MADE', player: command.player, contract: id }];
      return ok(settleBidding(state, nextBidding, events), events);
    }

    case 'HERE': {
      const guard = requireBiddingTurn(state, command.player);
      if (isDispatchResult(guard)) return guard;
      const bidding = guard as BiddingState;

      const rejection = hereRejection(command.player, bidding, state.dealer);
      if (rejection !== null) {
        return fail('ILLEGAL_BID', rejection);
      }

      const id = bidding.highestBid as ContractId;
      const record: BidRecord = { kind: 'here', player: command.player, contract: id };
      const nextBidding: BiddingState = {
        ...bidding,
        history: [...bidding.history, record],
        highestBidder: command.player,
      };

      const events: EngineEvent[] = [{ type: 'HERE_DECLARED', player: command.player, contract: id }];
      return ok(settleBidding(state, nextBidding, events), events);
    }

    case 'PASS': {
      const guard = requireBiddingTurn(state, command.player);
      if (isDispatchResult(guard)) return guard;
      const bidding = guard as BiddingState;

      // §3.4: спасовавший выбывает из торговли окончательно.
      const record: BidRecord = { kind: 'pass', player: command.player };
      const nextBidding: BiddingState = {
        ...bidding,
        history: [...bidding.history, record],
        active: bidding.active.filter((p) => p !== command.player),
      };

      const events: EngineEvent[] = [{ type: 'PASSED', player: command.player }];
      return ok(settleBidding(state, nextBidding, events), events);
    }

    case 'TAKE_WIDOW': {
      if (state.phase !== 'WIDOW_PICKUP') {
        return fail('WRONG_PHASE', `Прикуп берут только в фазе WIDOW_PICKUP, сейчас ${state.phase}`);
      }
      if (command.player !== state.declarer) {
        return fail('WRONG_ACTOR', `Прикуп берёт разыгрывающий (игрок ${String(state.declarer)})`);
      }

      // §4.2: игрок берёт прикуп в руку — 12 карт.
      const hands = {
        ...state.hands,
        [command.player]: pickUpWidow(state.hands[command.player], state.widow),
      };

      const next: DealState = Object.freeze({
        ...state,
        phase: 'DISCARD' as const,
        hands: Object.freeze(hands),
      });
      return ok(next, [
        { type: 'WIDOW_TAKEN', player: command.player, cards: widowIds(state.widow) },
        { type: 'PHASE_CHANGED', from: state.phase, to: next.phase },
      ]);
    }

    case 'DISCARD': {
      if (state.phase !== 'DISCARD') {
        return fail('WRONG_PHASE', `Снос возможен только в фазе DISCARD, сейчас ${state.phase}`);
      }
      if (command.player !== state.declarer) {
        return fail('WRONG_ACTOR', `Снос делает разыгрывающий (игрок ${String(state.declarer)})`);
      }

      const hand = state.hands[command.player];
      const rejection = discardRejection(command.cards, hand);
      if (rejection !== null) {
        return fail('ILLEGAL_DISCARD', rejection);
      }

      const wonBid = state.bidding?.wonBid;
      if (wonBid == null) {
        return fail('WRONG_PHASE', 'Торговля не завершена: выигравшей заявки нет');
      }

      const hands = { ...state.hands, [command.player]: applyDiscard(hand, command.cards) };
      // discardRejection уже подтвердил, что обе карты разобраны и лежат в руке.
      const discarded = Object.freeze(command.cards.map((id) => cardId(parseCard(id))));

      const next: DealState = Object.freeze({
        ...state,
        phase: 'FINAL_CONTRACT' as const,
        hands: Object.freeze(hands),
        discard: discarded,
        legalContracts: legalFinalContracts(parseContract(wonBid)),
      });
      return ok(next, [
        { type: 'DISCARDED', player: command.player, cards: discarded },
        { type: 'PHASE_CHANGED', from: state.phase, to: next.phase },
      ]);
    }

    case 'DECLARE_CONTRACT': {
      if (state.phase !== 'FINAL_CONTRACT') {
        return fail(
          'WRONG_PHASE',
          `Окончательный заказ возможен только в фазе FINAL_CONTRACT, сейчас ${state.phase} (§4.3, TS-12)`,
        );
      }
      if (command.player !== state.declarer) {
        return fail('WRONG_ACTOR', `Контракт объявляет разыгрывающий (игрок ${String(state.declarer)})`);
      }

      const candidate = tryParseContract(command.contract);
      if (candidate === null) {
        return fail('ILLEGAL_CONTRACT', `Неизвестный контракт: ${JSON.stringify(command.contract)}`);
      }
      const wonBid = state.bidding?.wonBid;
      if (wonBid == null) {
        return fail('WRONG_PHASE', 'Торговля не завершена: выигравшей заявки нет');
      }
      const rejection = finalContractRejection(candidate, parseContract(wonBid));
      if (rejection !== null) {
        return fail('ILLEGAL_CONTRACT', rejection);
      }

      const id: ContractId = contractId(candidate);
      const declarer = command.player;
      const whist = createWhist(declarer);
      const declared: DealState = Object.freeze({
        ...state,
        phase: 'WHIST_DECLARATION' as const,
        contract: id,
        legalContracts: Object.freeze([]),
        whist,
        toAct: nextDefender(whist),
      });
      const events: EngineEvent[] = [
        { type: 'CONTRACT_DECLARED', player: command.player, contract: id },
        { type: 'PHASE_CHANGED', from: state.phase, to: 'WHIST_DECLARATION' },
      ];

      // §7.4, TS-24: на мизере вистовых заявок нет — оборона обязательно
      // раскрывает карты и играет всветлую. Режим берём из resolveDefenseMode,
      // чтобы правило §5.2/§7.4 жило ровно в одном месте.
      if (candidate.kind === 'mizer') {
        const mode = resolveDefenseMode(whist, candidate);
        const revealed = revealedHandsFor(whist, mode);
        events.push({ type: 'DEFENSE_MODE_SET', mode });
        if (revealed.length > 0) {
          events.push({ type: 'HANDS_REVEALED', players: revealed });
        }
        const withDefense: DealState = Object.freeze({
          ...declared,
          whisted: whistedFlags(whist),
          whistObligation: resolveObligations(whist, candidate),
          defenseMode: mode,
          revealedHands: revealed,
        });
        const play = createPlay({
          mode: { kind: 'contract', contract: candidate, declarer },
          dealer: state.dealer,
          hands: state.hands,
        });
        return ok(enterPlay(withDefense, play, events), events);
      }

      return ok(declared, events);
    }

    case 'WHIST': {
      const guard = requireWhistTurn(state, command.player);
      if (isDispatchResult(guard)) return guard;
      const whist = guard as WhistState;

      const rejection = whistModeRejection(command.mode, whist, command.player);
      if (rejection !== null) {
        return fail('ILLEGAL_WHIST', rejection);
      }

      const nextWhist: WhistState = Object.freeze({
        ...whist,
        decisions: Object.freeze({
          ...whist.decisions,
          [command.player]: { whisted: true, mode: command.mode ?? null },
        }),
      });
      const events: EngineEvent[] = [
        { type: 'WHIST_DECLARED', player: command.player, mode: command.mode ?? null },
      ];
      return ok(settleWhist(state, nextWhist, events), events);
    }

    case 'PASS_WHIST': {
      const guard = requireWhistTurn(state, command.player);
      if (isDispatchResult(guard)) return guard;
      const whist = guard as WhistState;

      const nextWhist: WhistState = Object.freeze({
        ...whist,
        decisions: Object.freeze({
          ...whist.decisions,
          [command.player]: { whisted: false, mode: null },
        }),
      });
      const events: EngineEvent[] = [{ type: 'WHIST_PASSED', player: command.player }];
      return ok(settleWhist(state, nextWhist, events), events);
    }

    case 'START_PLAY': {
      if (state.phase !== 'PASSOUT') {
        return fail(
          'WRONG_PHASE',
          `Команда START_PLAY доступна только на распасах (фаза PASSOUT), сейчас ${state.phase}`,
        );
      }
      const events: EngineEvent[] = [];
      return ok(startRaspasy(state, events), events);
    }

    case 'PLAY_CARD': {
      if (state.phase !== 'PLAY' || state.play === null) {
        return fail('WRONG_PHASE', `Ходить можно только в фазе PLAY, сейчас ${state.phase}`);
      }
      const play = state.play;
      const owner = play.toPlay;
      const controller = state.controlledBy[owner] ?? owner;
      if (command.player !== controller) {
        return fail(
          'WRONG_ACTOR',
          controller === owner
            ? `Сейчас ходит игрок ${owner}, а не ${command.player}`
            : `Картами игрока ${owner} ходит вистующий ${controller} (вист всветлую, §5.2)`,
        );
      }

      const card = tryParseCard(command.card);
      if (card === null) {
        return fail('ILLEGAL_MOVE', `Некорректный идентификатор карты: ${JSON.stringify(command.card)}`);
      }

      let nextPlay: PlayState;
      try {
        nextPlay = applyMove(play, card);
      } catch (error) {
        return fail('ILLEGAL_MOVE', error instanceof Error ? error.message : String(error));
      }

      const events: EngineEvent[] = [{ type: 'CARD_PLAYED', player: owner, card: cardId(card) }];

      // Взятка завершена, если ядро перешло к следующей.
      const finished = nextPlay.completedTricks.length > play.completedTricks.length;
      if (finished) {
        const trick = nextPlay.completedTricks[nextPlay.completedTricks.length - 1];
        if (trick !== undefined) {
          events.push({
            type: 'TRICK_TAKEN',
            number: trick.number,
            winner: trick.winner,
            cards: Object.freeze(trick.plays.map((p) => cardId(p.card))),
          });
        }
      }

      if (isTerminal(nextPlay)) {
        return ok(finishDeal(state, nextPlay, events), events);
      }

      const next: DealState = Object.freeze({
        ...state,
        hands: nextPlay.hands,
        play: nextPlay,
        toAct: state.controlledBy[nextPlay.toPlay] ?? nextPlay.toPlay,
        legalMoves: Object.freeze(legalMoveIds(nextPlay) as CardId[]),
      });
      return ok(next, events);
    }

    default:
      return fail('UNKNOWN_COMMAND', `Неизвестная команда: ${JSON.stringify(command)}`);
  }
}

/** Развернуть успешный результат; на отказе бросает ошибку с текстом движка. */
export function expectOk(
  result: DispatchResult,
): { readonly state: DealState; readonly events: readonly EngineEvent[] } {
  if (!result.ok) {
    const error: EngineError = result.error;
    throw new Error(`[${error.code}] ${error.message}`);
  }
  return { state: result.state, events: result.events };
}
