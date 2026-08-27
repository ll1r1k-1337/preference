import { describe, expect, it } from 'vitest';

import { scoreDeal } from '../index.js';
import { deltaOf, expectNormalized, PLAYERS } from './helpers.js';

// docs/rules.md §8.3–8.5, §9.7; приложение Б.5
describe('Распасы (§8)', () => {
  it('TS-25: первый распас (×1), взятки 3/5/2 — амнистия по минимуму', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 3, P1: 5, P2: 2 }, consecutiveIndex: 0 },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    // min = 2 → штрафные 1/3/0.
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 0, mountain: 1, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 3, vistsOn: {} });
    // Премии за 0 взяток нет ни у кого: нулевых взяток нет.
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: {} });
  });

  it('TS-26: первый распас (×1), взятки 0/4/6 — премия +1 в пулю за ноль взяток', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 0, P1: 4, P2: 6 }, consecutiveIndex: 0 },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 1, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 4, vistsOn: {} });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 6, vistsOn: {} });
  });

  it('TS-27: второй распас подряд (×2), взятки 0/0/10 — гора 20 и по 2 очка премии', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 0, P1: 0, P2: 10 }, consecutiveIndex: 1 },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 2, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 2, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 20, vistsOn: {} });
  });

  it('TS-28: четвёртый распас подряд — множитель ×3 (потолок), не ×4', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 0, P1: 0, P2: 10 }, consecutiveIndex: 3 },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    // 10 штрафных × цена 1 × ×3 = 30, а не 40.
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 30, vistsOn: {} });
    expect(deltaOf(deltas, 'P0').pool).toBe(3);
    expect(deltaOf(deltas, 'P1').pool).toBe(3);
  });

  it('TS-29: после сыгранной раздачи счётчик сброшен — множитель ×1', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 0, P1: 0, P2: 10 }, consecutiveIndex: 0 },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P2').mountain).toBe(10);
    expect(deltaOf(deltas, 'P0').pool).toBe(1);
  });

  it('§9.7: на распасах висты не пишутся вообще', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 1, P1: 4, P2: 5 }, consecutiveIndex: 2 },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    for (const d of deltas) expect(d.vistsOn).toEqual({});
  });
});
