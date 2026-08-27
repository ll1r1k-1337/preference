/**
 * Фаза WHIST_DECLARATION: заявки вистующих, режим обороны, раскрытие карт,
 * игра «на своих».
 * Источник истины: docs/rules.md §4.4, §5.1–§5.4, §7.
 */
import { describe, expect, it } from 'vitest';
import { cardIds } from '../../core/index.js';
import { createDeal, dispatch, expectOk } from '../index.js';
import type { DealState } from '../index.js';

/**
 * Довести раздачу до фазы объявления виста.
 * Сдающий 0 → игрок 1 (первая рука), соперники 2 и 0.
 */
function atWhist(contract = '7D', seed = 'whist-1'): DealState {
  const dealt = createDeal({ seed, dealer: 0 });
  let state = expectOk(dispatch(dealt, { type: 'START_BIDDING', player: 0 })).state;
  state = expectOk(dispatch(state, { type: 'BID', player: 1, contract })).state;
  state = expectOk(dispatch(state, { type: 'PASS', player: 2 })).state;
  state = expectOk(dispatch(state, { type: 'PASS', player: 0 })).state;
  state = expectOk(dispatch(state, { type: 'TAKE_WIDOW', player: 1 })).state;
  const [a, b] = cardIds(state.hands[1]);
  state = expectOk(dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, b!] })).state;
  return expectOk(dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract })).state;
}

describe('фаза WHIST_DECLARATION — порядок опроса (§4.4)', () => {
  it('соперники отвечают по часовой стрелке от игрока', () => {
    const state = atWhist();

    expect(state.phase).toBe('WHIST_DECLARATION');
    expect(state.toAct).toBe(2);

    const next = expectOk(dispatch(state, { type: 'WHIST', player: 2 }));
    expect(next.state.toAct).toBe(0);
  });

  it('ответ не в свою очередь отвергается', () => {
    const state = atWhist();

    const result = dispatch(state, { type: 'WHIST', player: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_ACTOR');
  });

  it('разыгрывающий вистовать не может', () => {
    const state = atWhist();

    const result = dispatch(state, { type: 'WHIST', player: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_ACTOR');
  });
});

describe('фаза WHIST_DECLARATION — оба вистуют: втёмную (§5.2)', () => {
  it('вистуют оба — режим втёмную, карты не раскрываются, розыгрыш начинается', () => {
    let state = atWhist();
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2 })).state;

    const final = expectOk(dispatch(state, { type: 'WHIST', player: 0 }));

    expect(final.state.phase).toBe('PLAY');
    expect(final.state.whisted).toEqual({ 0: true, 2: true });
    expect(final.state.defenseMode).toBe('dark');
    expect(final.state.revealedHands).toEqual([]);
    expect(final.events).toContainEqual({ type: 'DEFENSE_MODE_SET', mode: 'dark' });
  });

  it('при двух вистующих выбор режима «всветлую» отвергается', () => {
    let state = atWhist();
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2 })).state;

    const result = dispatch(state, { type: 'WHIST', player: 0, mode: 'light' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_WHIST');
    expect(result.error.message).toMatch(/втёмную/i);
  });

  it('первый ход в PLAY делает разыгрывающий (§2.4)', () => {
    let state = atWhist();
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'WHIST', player: 0 })).state;

    expect(state.toAct).toBe(1);
    expect(state.play?.toPlay).toBe(1);
  });
});

describe('фаза WHIST_DECLARATION — один вистующий выбирает режим (§5.2)', () => {
  it('единственный вистующий может выбрать втёмную', () => {
    let state = atWhist();
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2, mode: 'dark' })).state;

    const final = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 }));

    expect(final.state.phase).toBe('PLAY');
    expect(final.state.whisted).toEqual({ 0: false, 2: true });
    expect(final.state.defenseMode).toBe('dark');
    expect(final.state.revealedHands).toEqual([]);
  });

  it('единственный вистующий может выбрать всветлую — карты обороны раскрыты', () => {
    let state = atWhist();
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2, mode: 'light' })).state;

    const final = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 }));

    expect(final.state.phase).toBe('PLAY');
    expect(final.state.defenseMode).toBe('light');
    expect(final.state.revealedHands).toEqual([0, 2]);
    expect(final.events).toContainEqual({ type: 'HANDS_REVEALED', players: [0, 2] });
  });

  it('при висте всветлую вистующий ходит и за пасовавшего (§5.2)', () => {
    let state = atWhist();
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2, mode: 'light' })).state;
    state = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 })).state;

    expect(state.controlledBy[0]).toBe(2);
    expect(state.controlledBy[2]).toBe(2);
    expect(state.controlledBy[1]).toBe(1);
  });

  it('при висте втёмную каждый ходит своими картами', () => {
    let state = atWhist();
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2, mode: 'dark' })).state;
    state = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 })).state;

    expect(state.controlledBy).toEqual({ 0: 0, 1: 1, 2: 2 });
  });

  it('режим по умолчанию при одиночном висте — втёмную', () => {
    let state = atWhist();
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 })).state;

    expect(state.defenseMode).toBe('dark');
  });
});

describe('фаза WHIST_DECLARATION — «на своих» (§5.2, TS-37)', () => {
  it('оба спасовали — розыгрыша нет, сразу RESULT, контракт сыгран', () => {
    let state = atWhist('7S');
    state = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 2 })).state;

    const final = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 }));

    expect(final.state.phase).toBe('RESULT');
    expect(final.state.whisted).toEqual({ 0: false, 2: false });
    expect(final.state.play).toBeNull();
    expect(final.events).toContainEqual({ type: 'PLAYED_ON_OWN' });
  });

  it('«на своих»: розыгрыша не было — все 10 взяток условно за игроком, оборона ноль', () => {
    let state = atWhist('7S');
    state = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 })).state;

    expect(state.outcome).toEqual({
      kind: 'contract',
      contract: '7S',
      declarer: 1,
      tricks: { 0: 0, 1: 10, 2: 0 },
      whisted: { 0: false, 2: false },
      mode: 'dark',
    });
  });
});

describe('фаза WHIST_DECLARATION — мизер (§7.4, TS-24)', () => {
  it('мизер разыгрывается всегда всветлую: карты обороны раскрыты сразу', () => {
    const state = atWhist('MIZER');

    expect(state.phase).toBe('PLAY');
    expect(state.defenseMode).toBe('light');
    expect(state.revealedHands).toEqual([0, 2]);
    expect(state.contract).toBe('MIZER');
  });

  it('мизер: первый ход делает мизерист, козыря нет', () => {
    const state = atWhist('MIZER');

    expect(state.toAct).toBe(1);
    expect(state.play?.mode).toEqual(expect.objectContaining({ kind: 'contract', declarer: 1 }));
    expect(state.trumpSuit).toBeNull();
  });

  it('мизер: вистовых заявок не спрашивают', () => {
    const state = atWhist('MIZER');

    const result = dispatch(state, { type: 'WHIST', player: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_PHASE');
  });
});

describe('фаза WHIST_DECLARATION — вистовые обязательства (§5.3)', () => {
  it('обязательство каждого при двух вистующих на семерной — 1 взятка', () => {
    let state = atWhist('7D');
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'WHIST', player: 0 })).state;

    expect(state.whistObligation).toEqual({ 0: 1, 2: 1 });
  });

  it('единственный вистующий на шестерной отвечает за всю норму — 4 взятки', () => {
    let state = atWhist('6S');
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'PASS_WHIST', player: 0 })).state;

    expect(state.whistObligation).toEqual({ 0: 0, 2: 4 });
  });

  it('на десятерной обязательств нет (tenPlayed = checked)', () => {
    let state = atWhist('10S');
    state = expectOk(dispatch(state, { type: 'WHIST', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'WHIST', player: 0 })).state;

    expect(state.whistObligation).toEqual({ 0: 0, 2: 0 });
  });
});

describe('фаза PASSOUT — распасы стартуют без виста (§8.1)', () => {
  it('три паса ведут прямо в розыгрыш распасов, первый ход — первая рука', () => {
    const dealt = createDeal({ seed: 'passout-1', dealer: 0 });
    let state = expectOk(dispatch(dealt, { type: 'START_BIDDING', player: 0 })).state;
    state = expectOk(dispatch(state, { type: 'PASS', player: 1 })).state;
    state = expectOk(dispatch(state, { type: 'PASS', player: 2 })).state;
    state = expectOk(dispatch(state, { type: 'PASS', player: 0 })).state;

    const started = expectOk(dispatch(state, { type: 'START_PLAY', player: 0 }));

    expect(started.state.phase).toBe('PLAY');
    expect(started.state.toAct).toBe(1);
    expect(started.state.play?.mode).toEqual(expect.objectContaining({ kind: 'raspasy' }));
    expect(started.state.defenseMode).toBe('dark');
    expect(started.state.revealedHands).toEqual([]);
  });
});
