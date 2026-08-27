/**
 * Фазы WIDOW_PICKUP -> DISCARD -> FINAL_CONTRACT: прикуп, снос двух карт,
 * окончательный заказ контракта.
 * Источник истины: docs/rules.md §4, сценарии TS-09…TS-12.
 */
import { describe, expect, it } from 'vitest';
import { cardIds } from '../../core/index.js';
import { createDeal, dispatch, expectOk } from '../index.js';
import type { DealState } from '../index.js';

/**
 * Довести раздачу до конца торговли с заданной выигравшей заявкой.
 * Сдающий 0 → первая рука 1 заявляет, остальные пасуют. Игрок — 1.
 */
function wonBy(contract: string, seed = 'widow-1'): DealState {
  const dealt = createDeal({ seed, dealer: 0 });
  let state = expectOk(dispatch(dealt, { type: 'START_BIDDING', player: 0 })).state;
  state = expectOk(dispatch(state, { type: 'BID', player: 1, contract })).state;
  state = expectOk(dispatch(state, { type: 'PASS', player: 2 })).state;
  state = expectOk(dispatch(state, { type: 'PASS', player: 0 })).state;
  return state;
}

describe('фаза WIDOW_PICKUP (§4.1, §4.2)', () => {
  it('прикуп вскрыт и виден всем сразу после торговли', () => {
    const state = wonBy('7D');

    expect(state.phase).toBe('WIDOW_PICKUP');
    expect(state.widowRevealed).toBe(true);
    expect(state.widow).toHaveLength(2);
    expect(state.toAct).toBe(1);
  });

  it('TS-09: TAKE_WIDOW даёт игроку 12 карт и переводит в DISCARD', () => {
    const state = wonBy('7D');
    const before = state.hands[1];

    const next = expectOk(dispatch(state, { type: 'TAKE_WIDOW', player: 1 }));

    expect(next.state.phase).toBe('DISCARD');
    expect(next.state.hands[1]).toHaveLength(12);
    expect(cardIds(next.state.hands[1])).toEqual(
      expect.arrayContaining([...cardIds(before), ...cardIds(state.widow)]),
    );
    expect(next.events).toContainEqual({
      type: 'WIDOW_TAKEN',
      player: 1,
      cards: cardIds(state.widow),
    });
  });

  it('прикуп берёт только разыгрывающий', () => {
    const state = wonBy('7D');

    const result = dispatch(state, { type: 'TAKE_WIDOW', player: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_ACTOR');
  });

  it('руки соперников прикуп не меняет', () => {
    const state = wonBy('7D');
    const next = expectOk(dispatch(state, { type: 'TAKE_WIDOW', player: 1 })).state;

    expect(next.hands[0]).toEqual(state.hands[0]);
    expect(next.hands[2]).toEqual(state.hands[2]);
  });
});

describe('фаза DISCARD — снос ровно двух карт (§4.2)', () => {
  function afterPickup(contract = '7D'): DealState {
    const state = wonBy(contract);
    return expectOk(dispatch(state, { type: 'TAKE_WIDOW', player: 1 })).state;
  }

  it('снос двух карт из руки оставляет 10 карт и ведёт в FINAL_CONTRACT', () => {
    const state = afterPickup();
    const [a, b] = cardIds(state.hands[1]);

    const next = expectOk(dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, b!] }));

    expect(next.state.phase).toBe('FINAL_CONTRACT');
    expect(next.state.hands[1]).toHaveLength(10);
    expect(cardIds(next.state.hands[1])).not.toContain(a);
    expect(cardIds(next.state.hands[1])).not.toContain(b);
    expect(next.state.discard).toEqual([a, b]);
  });

  it('TS-12: снос одной карты отвергается — нужно ровно две', () => {
    const state = afterPickup();
    const [a] = cardIds(state.hands[1]);

    const result = dispatch(state, { type: 'DISCARD', player: 1, cards: [a!] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_DISCARD');
    expect(result.error.message).toMatch(/ровно две/i);
  });

  it('снос трёх карт отвергается', () => {
    const state = afterPickup();
    const [a, b, c] = cardIds(state.hands[1]);

    const result = dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, b!, c!] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_DISCARD');
  });

  it('снос одной и той же карты дважды отвергается', () => {
    const state = afterPickup();
    const [a] = cardIds(state.hands[1]);

    const result = dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, a!] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_DISCARD');
    expect(result.error.message).toMatch(/дважды|дубл/i);
  });

  it('снос карты не из руки отвергается с указанием карты', () => {
    const state = afterPickup();
    const hand = cardIds(state.hands[1]);
    const foreign = cardIds(state.hands[0]).find((id) => !hand.includes(id));
    const [a] = hand;

    const result = dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, foreign!] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_DISCARD');
    expect(result.error.message).toContain(foreign);
  });

  it('снесённые карты в розыгрыше не участвуют — их нет ни у кого', () => {
    const state = afterPickup();
    const [a, b] = cardIds(state.hands[1]);
    const next = expectOk(dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, b!] })).state;

    const allInHands = [0, 1, 2].flatMap((p) => cardIds(next.hands[p as 0 | 1 | 2]));
    expect(allInHands).toHaveLength(30);
    expect(allInHands).not.toContain(a);
    expect(allInHands).not.toContain(b);
  });

  it('снос делает только разыгрывающий', () => {
    const state = afterPickup();
    const [a, b] = cardIds(state.hands[2]);

    const result = dispatch(state, { type: 'DISCARD', player: 2, cards: [a!, b!] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_ACTOR');
  });
});

describe('фаза FINAL_CONTRACT — окончательный заказ (§4.3)', () => {
  function afterDiscard(contract: string): DealState {
    let state = wonBy(contract);
    state = expectOk(dispatch(state, { type: 'TAKE_WIDOW', player: 1 })).state;
    const [a, b] = cardIds(state.hands[1]);
    return expectOk(dispatch(state, { type: 'DISCARD', player: 1, cards: [a!, b!] })).state;
  }

  it('TS-09: заказ равен выигравшей заявке — принимается', () => {
    const state = afterDiscard('7D');

    const next = expectOk(dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: '7D' }));

    expect(next.state.phase).toBe('WHIST_DECLARATION');
    expect(next.state.contract).toBe('7D');
    expect(next.events).toContainEqual({ type: 'CONTRACT_DECLARED', player: 1, contract: '7D' });
  });

  it('TS-09: заказы ниже выигравшей заявки отвергаются', () => {
    const state = afterDiscard('7D');

    for (const lower of ['7S', '7C', '6NT', '6S']) {
      const result = dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: lower });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`ожидался отказ на ${lower}`);
      expect(result.error.code).toBe('ILLEGAL_CONTRACT');
      expect(result.error.message).toMatch(/не ниже/i);
    }
  });

  it('TS-09: заказы не ниже выигравшей заявки принимаются', () => {
    const state = afterDiscard('7D');

    for (const higher of ['7H', '7NT', '8S', '10NT']) {
      const next = expectOk(dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: higher }));
      expect(next.state.contract).toBe(higher);
    }
  });

  it('TS-10: заказ выше заявленного разрешён и не штрафуется', () => {
    const state = afterDiscard('6C');

    const next = expectOk(dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: '8S' }));

    expect(next.state.contract).toBe('8S');
  });

  it('TS-11: выигравший мизером обязан играть мизер', () => {
    const state = afterDiscard('MIZER');

    const rejected = dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: '9H' });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('ожидался отказ');
    expect(rejected.error.code).toBe('ILLEGAL_CONTRACT');
    expect(rejected.error.message).toMatch(/мизер/i);

    const accepted = expectOk(dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: 'MIZER' }));
    expect(accepted.state.contract).toBe('MIZER');
  });

  it('мизер нельзя заказать при выигранной торговле на взятки (§4.3)', () => {
    const state = afterDiscard('7D');

    const result = dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: 'MIZER' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_CONTRACT');
  });

  it('legalContracts перечисляет ровно допустимые заказы', () => {
    const state = afterDiscard('8H');

    expect(state.legalContracts).toEqual(['8H', '8NT', '9S', '9C', '9D', '9H', '9NT', '10S', '10C', '10D', '10H', '10NT']);
  });

  it('TS-12: заказ до сноса невозможен', () => {
    let state = wonBy('7D');
    state = expectOk(dispatch(state, { type: 'TAKE_WIDOW', player: 1 })).state;

    const result = dispatch(state, { type: 'DECLARE_CONTRACT', player: 1, contract: '7D' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_PHASE');
  });
});
