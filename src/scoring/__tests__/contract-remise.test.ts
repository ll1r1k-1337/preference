import { describe, expect, it } from 'vitest';

import { scoreDeal } from '../index.js';
import { deltaOf, expectNormalized, PLAYERS } from './helpers.js';

// docs/rules.md §9.5 (ремиз игрока и консоляция), §9.4 (жлобский вист)
describe('Ремиз игрока и консоляция (§9.5)', () => {
  it('TS-32: 8♦ (цена 6), игрок без двух; вистовали оба, взятки обороны 3 и 1', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '8D',
        declarer: 'P0',
        tricks: { P0: 6, P1: 3, P2: 1 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    // Игрок: гора += 6 × 2 = 12, в пулю ничего.
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 0, mountain: 12, vistsOn: {} });
    // A: 3×6 (взятки) + 2×6 (консоляция) = 30.
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: { P0: 30 } });
    // B: 1×6 + 2×6 = 18. Обязательство 1 выполнено — ремиза на висте нет.
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: { P0: 18 } });
  });

  it('TS-33: 6♣ (цена 2), без одной; вистовал только A — жлобский вист за все взятки обороны', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6C',
        declarer: 'P0',
        tricks: { P0: 5, P1: 3, P2: 2 },
        whisted: { P1: true, P2: false },
        mode: 'light',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 0, mountain: 2, vistsOn: {} });
    // A пишет за ВСЕ 5 взяток обороны (5×2 = 10) + консоляция 1×2 = 2 → 12.
    // Обязательство единственного вистующего = 4, зачётных взяток 5 → ремиза на висте нет.
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: { P0: 12 } });
    // Пасовавший B пишет ТОЛЬКО консоляцию = 2, обязательств не несёт.
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: { P0: 2 } });
  });

  it('TS-39: 10♦ (цена 10), без двух; взятки обороны 1 и 1 — по 30 вистов с каждого', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '10D',
        declarer: 'P0',
        tricks: { P0: 8, P1: 1, P2: 1 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 0, mountain: 20, vistsOn: {} });
    // Обязательство 0 (tenPlayed = checked) — ремиза на висте нет ни у кого.
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: { P0: 30 } });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: { P0: 30 } });
  });

  it('§9.5 нормативный пример: шестерная без одной, взятки обороны 3 и 2 → 8 и 6 вистов', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6S',
        declarer: 'P0',
        tricks: { P0: 5, P1: 3, P2: 2 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 0, mountain: 2, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: { P0: 8 } });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: { P0: 6 } });
  });
});
