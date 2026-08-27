/**
 * Фаза BIDDING: заявки по шкале старшинства, пас, «здесь», мизер, распасы.
 * Источник истины: docs/rules.md §3, сценарии TS-01…TS-08.
 */
import { describe, expect, it } from 'vitest';
import { createDeal, dispatch, expectOk } from '../index.js';
import type { DealState, DispatchResult } from '../index.js';

/** Раздача, доведённая до фазы торговли. Сдающий 0 → руки: первая 1, вторая 2, третья 0. */
function biddingState(dealer: 0 | 1 | 2 = 0): DealState {
  const dealt = createDeal({ seed: 'bid-1', dealer });
  return expectOk(dispatch(dealt, { type: 'START_BIDDING', player: dealer })).state;
}

function bid(state: DealState, player: 0 | 1 | 2, contract: string): DispatchResult {
  return dispatch(state, { type: 'BID', player, contract });
}

function pass(state: DealState, player: 0 | 1 | 2): DispatchResult {
  return dispatch(state, { type: 'PASS', player });
}

describe('фаза BIDDING — порядок и легальность заявок (§3.1, §3.3)', () => {
  it('заявки начинает первая рука, очередь идёт по часовой стрелке', () => {
    let state = biddingState(0);
    expect(state.toAct).toBe(1);

    state = expectOk(bid(state, 1, '6S')).state;
    expect(state.toAct).toBe(2);
    expect(state.bidding?.highestBid).toBe('6S');
    expect(state.bidding?.highestBidder).toBe(1);

    state = expectOk(bid(state, 2, '6C')).state;
    expect(state.toAct).toBe(0);
  });

  it('заявка не в свою очередь отвергается', () => {
    const state = biddingState(0);
    const result = bid(state, 2, '6S');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_ACTOR');
  });

  it('TS-01: заявка, равная текущей, отвергается — нужна строго старшая', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6S')).state;

    const result = bid(state, 2, '6S');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_BID');
    expect(result.error.message).toMatch(/строго старше/i);
  });

  it('TS-08: прыжок через ступень разрешён (bidJumps = allowed)', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6S')).state;

    state = expectOk(bid(state, 2, '9H')).state;

    expect(state.bidding?.highestBid).toBe('9H');
    expect(state.bidding?.highestBidder).toBe(2);
  });

  it('legalBids содержит только строго старшие контракты', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '8NT')).state;

    const legal = state.bidding?.legalBids ?? [];

    expect(legal).not.toContain('8NT');
    expect(legal).toContain('MIZER');
    expect(legal).toContain('9S');
    expect(legal[0]).toBe('MIZER');
  });

  it('до первой заявки легальна вся шкала, начиная с 6S', () => {
    const state = biddingState(0);
    const legal = state.bidding?.legalBids ?? [];

    expect(legal).toHaveLength(26);
    expect(legal[0]).toBe('6S');
    expect(legal[25]).toBe('10NT');
  });
});

describe('фаза BIDDING — пас и завершение торговли (§3.4, §3.5)', () => {
  it('спасовавший выбывает окончательно и очередь его пропускает', () => {
    let state = biddingState(0);
    state = expectOk(pass(state, 1)).state;
    expect(state.toAct).toBe(2);

    state = expectOk(bid(state, 2, '6S')).state;
    expect(state.toAct).toBe(0);

    state = expectOk(bid(state, 0, '6C')).state;
    // Первая рука спасовала — очередь возвращается ко второй руке, а не к ней.
    expect(state.toAct).toBe(2);
  });

  it('спасовавший больше не может заявлять', () => {
    let state = biddingState(0);
    state = expectOk(pass(state, 1)).state;
    state = expectOk(bid(state, 2, '6S')).state;
    state = expectOk(bid(state, 0, '6C')).state;

    const result = bid(state, 1, '7S');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_ACTOR');
  });

  it('TS-02: два паса при одной значащей заявке — торговля окончена, определён игрок', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6S')).state;
    state = expectOk(pass(state, 2)).state;
    state = expectOk(bid(state, 0, '7H')).state;

    const final = expectOk(pass(state, 1));

    expect(final.state.phase).toBe('WIDOW_PICKUP');
    expect(final.state.declarer).toBe(0);
    expect(final.state.bidding?.wonBid).toBe('7H');
    expect(final.events).toContainEqual({
      type: 'BIDDING_WON',
      player: 0,
      contract: '7H',
    });
  });

  it('TS-03: три паса первым словом — распасы', () => {
    let state = biddingState(0);
    state = expectOk(pass(state, 1)).state;
    state = expectOk(pass(state, 2)).state;

    const final = expectOk(pass(state, 0));

    expect(final.state.phase).toBe('PASSOUT');
    expect(final.state.declarer).toBeNull();
    expect(final.events).toContainEqual({ type: 'PASSOUT_DECLARED' });
  });
});

describe('фаза BIDDING — мизер (§3.7)', () => {
  it('TS-05: мизер после собственной заявки на взятки отвергается (кабальный)', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6S')).state;
    state = expectOk(bid(state, 2, '7C')).state;
    state = expectOk(bid(state, 0, '7D')).state;

    const result = bid(state, 1, 'MIZER');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_BID');
    expect(result.error.message).toMatch(/кабальн/i);
  });

  it('TS-06: мизер перебивается только заявкой уровня 9+', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, 'MIZER')).state;

    const rejected = bid(state, 2, '8S');
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('ожидался отказ');
    expect(rejected.error.code).toBe('ILLEGAL_BID');

    const accepted = expectOk(bid(state, 2, '9S'));
    expect(accepted.state.bidding?.highestBid).toBe('9S');
  });

  it('TS-07: мизер перебит девятерной — игроком становится автор 9♠', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, 'MIZER')).state;
    state = expectOk(bid(state, 2, '9S')).state;
    state = expectOk(pass(state, 0)).state;

    const final = expectOk(pass(state, 1));

    expect(final.state.declarer).toBe(2);
    expect(final.state.bidding?.wonBid).toBe('9S');
  });

  it('мизер выигрывает торговлю и ведёт в WIDOW_PICKUP (мизер с прикупом, §3.7)', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, 'MIZER')).state;
    state = expectOk(pass(state, 2)).state;

    const final = expectOk(pass(state, 0));

    expect(final.state.phase).toBe('WIDOW_PICKUP');
    expect(final.state.declarer).toBe(1);
    expect(final.state.bidding?.wonBid).toBe('MIZER');
  });
});

describe('фаза BIDDING — правило «здесь» (§3.6)', () => {
  it('TS-04: старшая рука может сказать «здесь» на заявку младшей', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6D')).state;
    state = expectOk(pass(state, 2)).state;
    state = expectOk(bid(state, 0, '6H')).state;

    const here = expectOk(dispatch(state, { type: 'HERE', player: 1 }));

    expect(here.state.bidding?.highestBid).toBe('6H');
    expect(here.state.bidding?.highestBidder).toBe(1);
    expect(here.state.phase).toBe('BIDDING');
    expect(here.state.toAct).toBe(0);
  });

  it('TS-01: младшая рука сказать «здесь» не может, даже когда остались двое', () => {
    // Сдающий 0: первая рука 1, вторая 2, третья 0. Заявку держит первая рука,
    // отвечает третья — она младше, поэтому «здесь» ей недоступно.
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6S')).state;
    state = expectOk(pass(state, 2)).state;
    expect(state.toAct).toBe(0);
    expect(state.bidding?.active).toEqual([1, 0]);

    const result = dispatch(state, { type: 'HERE', player: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('ILLEGAL_BID');
    expect(result.error.message).toMatch(/старш/i);
  });

  it('«здесь» недоступно, когда активных участников трое', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6S')).state;
    state = expectOk(bid(state, 2, '6C')).state;

    const result = dispatch(state, { type: 'HERE', player: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.message).toMatch(/двое/i);
  });

  it('после «здесь» соперник обязан повысить или спасовать — равная заявка отвергается', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6D')).state;
    state = expectOk(pass(state, 2)).state;
    state = expectOk(bid(state, 0, '6H')).state;
    state = expectOk(dispatch(state, { type: 'HERE', player: 1 })).state;

    const rejected = bid(state, 0, '6H');
    expect(rejected.ok).toBe(false);

    const raised = expectOk(bid(state, 0, '6NT'));
    expect(raised.state.bidding?.highestBidder).toBe(0);
  });

  it('пас соперника после «здесь» отдаёт контракт сказавшему «здесь»', () => {
    let state = biddingState(0);
    state = expectOk(bid(state, 1, '6D')).state;
    state = expectOk(pass(state, 2)).state;
    state = expectOk(bid(state, 0, '6H')).state;
    state = expectOk(dispatch(state, { type: 'HERE', player: 1 })).state;

    const final = expectOk(pass(state, 0));

    expect(final.state.phase).toBe('WIDOW_PICKUP');
    expect(final.state.declarer).toBe(1);
    expect(final.state.bidding?.wonBid).toBe('6H');
  });
});
