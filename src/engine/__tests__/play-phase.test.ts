/**
 * Фаза PLAY и формирование DealResult: очерёдность ходов, валидация,
 * счётчик взяток, переход в RESULT.
 * Источник истины: docs/rules.md §2.4, §6, §7, §8.2, приложение А.3.
 */
import { describe, expect, it } from 'vitest';
import { cardIds } from '../../core/index.js';
import { createDeal, dispatch, expectOk } from '../index.js';
import type { DealState, EngineEvent } from '../index.js';

/** Довести раздачу до фазы PLAY с вистом обоих соперников. */
function atPlay(contract = '7D', seed = 'play-1'): DealState {
  const dealt = createDeal({ seed, dealer: 0 });
  let state = expectOk(dispatch(dealt, { type: 'START_BIDDING', player: 0 })).state;
  state = expectOk(dispatch(state, { type: 'BID', player: 1, contract })).state;
  state = expectOk(dispatch(state, { type: 'PASS', player: 2 })).state;
  state = expectOk(dispatch(state, { type: 'PASS', player: 0 })).state;
  state = expectOk(dispatch(state, { type: 'TAKE_WIDOW', player: 1 })).state;
  const [a, b] = cardIds(state.hands[1]);
  state = expectOk(dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, b!] })).state;
  state = expectOk(dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract })).state;
  if (state.phase === 'PLAY') return state; // мизер
  state = expectOk(dispatch(state, { type: 'WHIST', player: 2 })).state;
  return expectOk(dispatch(state, { type: 'WHIST', player: 0 })).state;
}

/** Доиграть раздачу до конца, всегда выбирая первый легальный ход. */
function playOut(start: DealState): { readonly state: DealState; readonly events: EngineEvent[] } {
  let state = start;
  const events: EngineEvent[] = [];
  let guard = 0;
  while (state.phase === 'PLAY') {
    if (guard++ > 40) throw new Error('розыгрыш не сходится: больше 30 ходов');
    const card = state.legalMoves[0];
    if (card === undefined) throw new Error('нет легальных ходов в фазе PLAY');
    const step = expectOk(dispatch(state, { type: 'PLAY_CARD', player: state.toAct!, card }));
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
}

describe('фаза PLAY — очерёдность и валидация ходов (§6.2)', () => {
  it('первый ход делает разыгрывающий, legalMoves — вся его рука', () => {
    const state = atPlay();

    expect(state.toAct).toBe(1);
    expect(state.legalMoves).toEqual(cardIds(state.hands[1]));
  });

  it('ход не в свою очередь отвергается', () => {
    const state = atPlay();
    const card = cardIds(state.hands[2])[0];

    const result = dispatch(state, { type: 'PLAY_CARD', player: 2, card: card! });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_ACTOR');
  });

  it('нелегальный ход отвергается с перечнем допустимых карт', () => {
    let state = atPlay();
    state = expectOk(dispatch(state, { type: 'PLAY_CARD', player: 1, card: state.legalMoves[0]! })).state;

    const hand = cardIds(state.hands[state.toAct!]);
    const illegal = hand.find((id) => !state.legalMoves.includes(id));
    if (illegal === undefined) return; // у этого игрока свободный ход — случай проверяется другим тестом

    const result = dispatch(state, { type: 'PLAY_CARD', player: state.toAct!, card: illegal });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_MOVE');
    expect(result.error.message).toContain(state.legalMoves[0]);
  });

  it('ход картой не из руки отвергается', () => {
    const state = atPlay();
    const foreign = cardIds(state.hands[2])[0];

    const result = dispatch(state, { type: 'PLAY_CARD', player: 1, card: foreign! });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_MOVE');
  });

  it('некорректный идентификатор карты отвергается', () => {
    const state = atPlay();

    const result = dispatch(state, { type: 'PLAY_CARD', player: 1, card: 'ZZ' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_MOVE');
  });

  it('после хода очередь переходит по часовой стрелке, карта уходит из руки', () => {
    const state = atPlay();
    const card = state.legalMoves[0]!;

    const next = expectOk(dispatch(state, { type: 'PLAY_CARD', player: 1, card }));

    expect(next.state.toAct).toBe(2);
    expect(cardIds(next.state.hands[1])).not.toContain(card);
    expect(next.events).toContainEqual({ type: 'CARD_PLAYED', player: 1, card });
  });

  it('завершённая взятка даёт событие TRICK_TAKEN и передаёт ход победителю', () => {
    let state = atPlay();
    const collected: EngineEvent[] = [];
    for (let i = 0; i < 3; i += 1) {
      const step = expectOk(dispatch(state, { type: 'PLAY_CARD', player: state.toAct!, card: state.legalMoves[0]! }));
      state = step.state;
      collected.push(...step.events);
    }

    const taken = collected.find((e) => e.type === 'TRICK_TAKEN');
    expect(taken).toBeDefined();
    if (taken?.type !== 'TRICK_TAKEN') throw new Error('нет TRICK_TAKEN');
    expect(taken.number).toBe(1);
    expect(taken.cards).toHaveLength(3);
    expect(state.toAct).toBe(taken.winner);
    expect(state.play?.tricksWon[taken.winner]).toBe(1);
  });
});

describe('фаза PLAY — вист всветлую: ходы за пасовавшего (§5.2)', () => {
  function lightDefense(): DealState {
    const dealt = createDeal({ seed: 'light-1', dealer: 0 });
    let state = expectOk(dispatch(dealt, { type: 'START_BIDDING', player: 0 })).state;
    state = expectOk(dispatch(state, { type: 'BID', player: 1, contract: '6S' })).state;
    state = expectOk(dispatch(state, { type: 'PASS', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'PASS', player: 0 })).state;
    state = expectOk(dispatch(state, { type: 'TAKE_WIDOW', player: 1 })).state;
    const [a, b] = cardIds(state.hands[1]);
    state = expectOk(dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, b!] })).state;
    state = expectOk(dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: '6S' })).state;
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2, mode: 'light' })).state;
    return expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 })).state;
  }

  it('вистующий ходит картами пасовавшего, сам пасовавший ходить не может', () => {
    let state = lightDefense();
    state = expectOk(dispatch(state, { type: 'PLAY_CARD', player: 1, card: state.legalMoves[0]! })).state;
    expect(state.toAct).toBe(2);
    state = expectOk(dispatch(state, { type: 'PLAY_CARD', player: 2, card: state.legalMoves[0]! })).state;

    // Очередь карт игрока 0, но ходит за него вистующий 2.
    expect(state.play?.toPlay).toBe(0);
    expect(state.toAct).toBe(2);

    const rejected = dispatch(state, { type: 'PLAY_CARD', player: 0, card: state.legalMoves[0]! });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('ожидался отказ');
    expect(rejected.error.code).toBe('WRONG_ACTOR');

    const accepted = expectOk(dispatch(state, { type: 'PLAY_CARD', player: 2, card: state.legalMoves[0]! }));
    expect(accepted.state.play?.completedTricks).toHaveLength(1);
  });
});

describe('фаза RESULT — формирование DealResult (приложение А.3)', () => {
  it('раздача доигрывается до конца: 10 взяток, сумма по игрокам = 10', () => {
    const { state } = playOut(atPlay('7D'));

    expect(state.phase).toBe('RESULT');
    expect(state.play?.completedTricks).toHaveLength(10);
    const tricks = state.play!.tricksWon;
    expect(tricks[0] + tricks[1] + tricks[2]).toBe(10);
  });

  it('игра на взятки даёт DealOutcome вида contract с флагами виста и режимом', () => {
    const { state } = playOut(atPlay('7D'));

    expect(state.outcome).toMatchObject({
      kind: 'contract',
      contract: '7D',
      declarer: 1,
      whisted: { 0: true, 2: true },
      mode: 'dark',
    });
    if (state.outcome?.kind !== 'contract') throw new Error('ожидался contract');
    expect(state.outcome.tricks).toEqual(state.play!.tricksWon);
  });

  it('событие DEAL_FINISHED несёт тот же outcome, что и состояние', () => {
    const { state, events } = playOut(atPlay('7D'));

    const finished = events.find((e) => e.type === 'DEAL_FINISHED');
    expect(finished).toBeDefined();
    if (finished?.type !== 'DEAL_FINISHED') throw new Error('нет DEAL_FINISHED');
    expect(finished.outcome).toEqual(state.outcome);
  });

  it('мизер даёт DealOutcome вида miser со взятками мизериста (§7.7)', () => {
    const { state } = playOut(atPlay('MIZER'));

    expect(state.outcome?.kind).toBe('miser');
    if (state.outcome?.kind !== 'miser') throw new Error('ожидался miser');
    expect(state.outcome.declarer).toBe(1);
    expect(state.outcome.declarerTricks).toBe(state.play!.tricksWon[1]);
  });

  it('после RESULT ходить нельзя', () => {
    const { state } = playOut(atPlay('7D'));

    const result = dispatch(state, { type: 'PLAY_CARD', player: 1, card: '7S' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_PHASE');
  });
});

describe('фаза PLAY — распасы (§8.2, TS-30)', () => {
  function raspasy(seed = 'raspasy-1', consecutiveRaspasy = 0): DealState {
    const dealt = createDeal({ seed, dealer: 0, consecutiveRaspasy });
    let state = expectOk(dispatch(dealt, { type: 'START_BIDDING', player: 0 })).state;
    state = expectOk(dispatch(state, { type: 'PASS', player: 1 })).state;
    state = expectOk(dispatch(state, { type: 'PASS', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'PASS', player: 0 })).state;
    return expectOk(dispatch(state, { type: 'START_PLAY', player: 0 })).state;
  }

  it('TS-30: первая взятка вскрывает верхнюю карту прикупа, ходит первая рука', () => {
    const state = raspasy();

    expect(state.play?.revealedWidowCard).toEqual(state.widow[0]);
    expect(state.toAct).toBe(1);
  });

  it('распасы доигрываются до конца и дают DealOutcome вида raspasy', () => {
    const { state } = playOut(raspasy());

    expect(state.phase).toBe('RESULT');
    expect(state.outcome?.kind).toBe('raspasy');
    if (state.outcome?.kind !== 'raspasy') throw new Error('ожидался raspasy');
    const t = state.outcome.tricks;
    expect(t[0] + t[1] + t[2]).toBe(10);
    expect(state.outcome.consecutiveIndex).toBe(0);
  });

  it('счётчик распасов подряд попадает в DealOutcome (§8.4)', () => {
    const { state } = playOut(raspasy('raspasy-2', 2));

    if (state.outcome?.kind !== 'raspasy') throw new Error('ожидался raspasy');
    expect(state.outcome.consecutiveIndex).toBe(2);
  });

  it('на распасах козыря нет', () => {
    const state = raspasy();
    expect(state.trumpSuit).toBeNull();
  });
});

describe('фаза PLAY — козырь контракта', () => {
  it('козырный контракт задаёт trumpSuit', () => {
    expect(atPlay('7D').trumpSuit).toBe('D');
  });

  it('бескозырный контракт и мизер козыря не имеют (§6.2)', () => {
    expect(atPlay('7NT').trumpSuit).toBeNull();
    expect(atPlay('MIZER').trumpSuit).toBeNull();
  });
});
