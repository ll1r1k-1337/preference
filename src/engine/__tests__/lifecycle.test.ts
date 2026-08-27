/**
 * Жизненный цикл раздачи: фазы DEAL -> BIDDING и командный интерфейс.
 * Источник истины: docs/rules.md §2, §3.1.
 */
import { describe, expect, it } from 'vitest';
import { createDeal, dispatch, expectOk } from '../index.js';

describe('фаза DEAL', () => {
  it('createDeal раздаёт по 10 карт и 2 в прикуп, фаза DEAL', () => {
    const state = createDeal({ seed: 'deal-1', dealer: 0 });

    expect(state.phase).toBe('DEAL');
    expect(state.hands[0]).toHaveLength(10);
    expect(state.hands[1]).toHaveLength(10);
    expect(state.hands[2]).toHaveLength(10);
    expect(state.widow).toHaveLength(2);
    expect(state.dealer).toBe(0);
    expect(state.firstHand).toBe(1);
  });

  it('прикуп в фазе DEAL закрыт', () => {
    const state = createDeal({ seed: 'deal-1', dealer: 0 });
    expect(state.widowRevealed).toBe(false);
  });

  it('одинаковый seed даёт одинаковую раздачу', () => {
    const a = createDeal({ seed: 'deal-1', dealer: 2 });
    const b = createDeal({ seed: 'deal-1', dealer: 2 });
    expect(b.hands[0]).toEqual(a.hands[0]);
    expect(b.widow).toEqual(a.widow);
  });

  it('START_BIDDING переводит в BIDDING, ходит первая рука (§3.1)', () => {
    const dealt = createDeal({ seed: 'deal-1', dealer: 0 });

    const next = expectOk(dispatch(dealt, { type: 'START_BIDDING', player: 0 }));

    expect(next.state.phase).toBe('BIDDING');
    expect(next.state.toAct).toBe(1);
    expect(next.events).toContainEqual({ type: 'PHASE_CHANGED', from: 'DEAL', to: 'BIDDING' });
  });

  it('START_BIDDING от не-сдающего отвергается с внятной ошибкой', () => {
    const dealt = createDeal({ seed: 'deal-1', dealer: 0 });

    const result = dispatch(dealt, { type: 'START_BIDDING', player: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('ожидался отказ');
    expect(result.error.code).toBe('WRONG_ACTOR');
    expect(result.error.message).toMatch(/сдающ/i);
  });

  it('исходное состояние не мутируется', () => {
    const dealt = createDeal({ seed: 'deal-1', dealer: 0 });
    expectOk(dispatch(dealt, { type: 'START_BIDDING', player: 0 }));
    expect(dealt.phase).toBe('DEAL');
  });
});
