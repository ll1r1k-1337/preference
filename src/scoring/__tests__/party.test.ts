import { describe, expect, it } from 'vitest';

import {
  applyScore,
  createScoreboard,
  finalize,
  scoreDeal,
  type DealOutcome,
  type Scoreboard,
  type ScoringOptions,
} from '../index.js';
import { at, PLAYERS, totalOf } from './helpers.js';

/**
 * Сценарии полной пули: последовательность раздач от начала партии
 * до финального пересчёта (§9.9). Acceptance требует минимум трёх.
 */
function playParty(
  deals: readonly DealOutcome[],
  baseOptions: Omit<ScoringOptions, 'currentPool'> = { players: PLAYERS },
): Scoreboard {
  let board = createScoreboard(baseOptions.players);
  for (const deal of deals) {
    // currentPool пересчитывается перед каждой раздачей — этого требует §9.8.
    board = applyScore(board, scoreDeal(deal, { ...baseOptions, currentPool: { ...board.pool } }));
  }
  return board;
}

describe('Полная пуля от начала до росписи (§9.9)', () => {
  it('Сценарий 1 (TS-40): шестерная, мизер, распасы → +122 / −117 / −5', () => {
    const board = playParty([
      {
        kind: 'contract',
        contract: '6S',
        declarer: 'P0',
        tricks: { P0: 6, P1: 2, P2: 2 },
        whisted: { P1: true, P2: false },
        mode: 'light',
      },
      { kind: 'miser', declarer: 'P1', declarerTricks: 1 },
      { kind: 'raspasy', tricks: { P0: 0, P1: 4, P2: 6 }, consecutiveIndex: 0 },
    ]);

    expect(board.pool).toEqual({ P0: 3, P1: 0, P2: 0 });
    expect(board.mountain).toEqual({ P0: 0, P1: 14, P2: 6 });

    const result = finalize(board);
    expect(result).toEqual({ P0: 122, P1: -117, P2: -5 });
    expect(totalOf(result)).toBe(0);
  });

  it('Сценарий 2: закрытие пули и американская помощь в последней раздаче', () => {
    const options: Omit<ScoringOptions, 'currentPool'> = { players: PLAYERS, poolTarget: 4 };

    const board = playParty(
      [
        // (1) P0 сыгрывает 7♠ (цена 4), вистовали оба, взятки обороны 2 и 1.
        {
          kind: 'contract',
          contract: '7S',
          declarer: 'P0',
          tricks: { P0: 7, P1: 2, P2: 1 },
          whisted: { P1: true, P2: true },
          mode: 'dark',
        },
        // (2) P1 без одной на 6♦ (цена 2); вистовал только P2 — жлобский вист.
        {
          kind: 'contract',
          contract: '6D',
          declarer: 'P1',
          tricks: { P1: 5, P2: 3, P0: 2 },
          whisted: { P2: true, P0: false },
          mode: 'light',
        },
        // (3) Распасы ×1: P0=2, P1=0, P2=8.
        { kind: 'raspasy', tricks: { P0: 2, P1: 0, P2: 8 }, consecutiveIndex: 0 },
        // (4) У P0 пуля 4 = poolTarget → помощь: очки уходят P1.
        {
          kind: 'contract',
          contract: '6C',
          declarer: 'P0',
          tricks: { P0: 6, P1: 2, P2: 2 },
          whisted: { P1: true, P2: true },
          mode: 'dark',
        },
      ],
      options,
    );

    expect(board.pool).toEqual({ P0: 4, P1: 3, P2: 0 });
    expect(board.mountain).toEqual({ P0: 2, P1: 2, P2: 8 });
    expect(board.vists['P0']).toEqual({ P1: 22 }); // 2 консоляции + 20 за помощь
    expect(board.vists['P1']).toEqual({ P0: 12 });
    expect(board.vists['P2']).toEqual({ P0: 8, P1: 12 });

    const result = finalize(board);
    expect(result).toEqual({ P0: 57, P1: 18, P2: -75 });
    expect(totalOf(result)).toBe(0);
  });

  it('Сценарий 3: серия распасов с прогрессией, сброс счётчика после мизера', () => {
    const board = playParty([
      // (1) Распасы ×1: амнистия min=3 → штрафной только у P0.
      { kind: 'raspasy', tricks: { P0: 4, P1: 3, P2: 3 }, consecutiveIndex: 0 },
      // (2) Распасы ×2.
      { kind: 'raspasy', tricks: { P0: 0, P1: 5, P2: 5 }, consecutiveIndex: 1 },
      // (3) Распасы ×3.
      { kind: 'raspasy', tricks: { P0: 1, P1: 9, P2: 0 }, consecutiveIndex: 2 },
      // (4) Сыгранный мизер — сбрасывает счётчик распасов.
      { kind: 'miser', declarer: 'P2', declarerTricks: 0 },
      // (5) Снова распасы, но уже ×1 (TS-29).
      { kind: 'raspasy', tricks: { P0: 5, P1: 5, P2: 0 }, consecutiveIndex: 0 },
    ]);

    expect(board.pool).toEqual({ P0: 2, P1: 0, P2: 14 });
    expect(board.mountain).toEqual({ P0: 9, P1: 42, P2: 10 });
    // §9.7: ни на распасах, ни на мизере вистов нет.
    expect(board.vists).toEqual({ P0: {}, P1: {}, P2: {} });

    const result = finalize(board);
    expect(result).toEqual({ P0: 120, P1: -405, P2: 285 });
    expect(totalOf(result)).toBe(0);
  });

  it('Инвариант нулевой суммы держится на случайных партиях (100 прогонов)', () => {
    // Детерминированный ГПСЧ, чтобы падение можно было воспроизвести.
    let seed = 20260826;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let party = 0; party < 100; party += 1) {
      let board = createScoreboard(PLAYERS);
      let consecutive = 0;

      for (let dealNo = 0; dealNo < 8; dealNo += 1) {
        const kind = rnd(3);
        let deal: DealOutcome;

        if (kind === 0) {
          const t0 = rnd(11);
          const t1 = rnd(11 - t0);
          deal = {
            kind: 'raspasy',
            tricks: { P0: t0, P1: t1, P2: 10 - t0 - t1 },
            consecutiveIndex: consecutive,
          };
          consecutive += 1;
        } else if (kind === 1) {
          deal = { kind: 'miser', declarer: `P${rnd(3)}`, declarerTricks: rnd(11) };
          consecutive = 0;
        } else {
          const declarer = `P${rnd(3)}`;
          const others = PLAYERS.filter((p) => p !== declarer);
          const level = 6 + rnd(5);
          const dTricks = rnd(11);
          const d0 = rnd(11 - dTricks);
          const [a, b] = others as [string, string];
          deal = {
            kind: 'contract',
            contract: `${level}S` as '6S',
            declarer,
            tricks: { [declarer]: dTricks, [a]: d0, [b]: 10 - dTricks - d0 },
            whisted: { [a]: rnd(2) === 1, [b]: rnd(2) === 1 },
            mode: 'dark',
          };
          consecutive = 0;
        }

        const deltas = scoreDeal(deal, {
          players: PLAYERS,
          currentPool: { ...board.pool },
        });
        for (const delta of deltas) {
          expect(delta.pool).toBeGreaterThanOrEqual(0);
          expect(delta.mountain).toBeGreaterThanOrEqual(0);
        }
        board = applyScore(board, deltas);
      }

      const result = finalize(board);
      expect(totalOf(result), `партия ${party}: сумма итогов не нулевая`).toBe(0);
      expect(at(result, 'P0') + at(result, 'P1') + at(result, 'P2')).toBe(0);
    }
  });
});
