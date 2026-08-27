import { describe, expect, it } from 'vitest';

import { applyScore, createScoreboard, finalize, scoreDeal } from '../index.js';
import { at, PLAYERS, totalOf } from './helpers.js';

// docs/rules.md §9.9; приложение Б.7
describe('Табло и итоговая роспись (§9.9)', () => {
  it('applyScore складывает дельты в табло, не мутируя исходное', () => {
    const empty = createScoreboard(PLAYERS);
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6S',
        declarer: 'P0',
        tricks: { P0: 6, P1: 2, P2: 2 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    const next = applyScore(empty, deltas);

    expect(at(empty.pool, 'P0')).toBe(0);
    expect(at(next.pool, 'P0')).toBe(2);
    expect(next.vists['P1']?.['P0']).toBe(4);
    expect(next.vists['P2']?.['P0']).toBe(4);
    expect(next).not.toBe(empty);
  });

  it('TS-40: партия из трёх раздач — итоги +122 / −117 / −5', () => {
    let board = createScoreboard(PLAYERS);

    // (1) P0 играет 6♠ и сыгрывает; вистовал только P1, взятки обороны 2+2.
    board = applyScore(
      board,
      scoreDeal(
        {
          kind: 'contract',
          contract: '6S',
          declarer: 'P0',
          tricks: { P0: 6, P1: 2, P2: 2 },
          whisted: { P1: true, P2: false },
          mode: 'light',
        },
        { players: PLAYERS },
      ),
    );

    // (2) P1 играет мизер и берёт 1 взятку.
    board = applyScore(
      board,
      scoreDeal({ kind: 'miser', declarer: 'P1', declarerTricks: 1 }, { players: PLAYERS }),
    );

    // (3) Распасы ×1: P0=0, P1=4, P2=6.
    board = applyScore(
      board,
      scoreDeal(
        { kind: 'raspasy', tricks: { P0: 0, P1: 4, P2: 6 }, consecutiveIndex: 0 },
        { players: PLAYERS },
      ),
    );

    expect(board.pool).toEqual({ P0: 3, P1: 0, P2: 0 });
    expect(board.mountain).toEqual({ P0: 0, P1: 14, P2: 6 });
    // Жлобский вист: P1 пишет на P0 за все 4 взятки обороны × 2 = 8.
    expect(board.vists['P1']?.['P0']).toBe(8);
    expect(board.vists['P2']?.['P0'] ?? 0).toBe(0);

    const result = finalize(board);
    expect(result).toEqual({ P0: 122, P1: -117, P2: -5 });
    expect(totalOf(result)).toBe(0);
  });

  it('TS-41: сумма итогов всегда равна нулю', () => {
    const board = createScoreboard(PLAYERS);
    board.pool = { P0: 7, P1: 3, P2: 11 };
    board.mountain = { P0: 4, P1: 19, P2: 2 };
    board.vists = { P0: { P1: 30 }, P1: { P2: 12 }, P2: { P0: 7 } };

    expect(totalOf(finalize(board))).toBe(0);
  });

  it('TS-42: амнистия горы (вычесть k у всех) не меняет итогов', () => {
    const base = createScoreboard(PLAYERS);
    base.pool = { P0: 5, P1: 2, P2: 0 };
    base.mountain = { P0: 9, P1: 12, P2: 4 };
    base.vists = { P0: {}, P1: { P0: 18 }, P2: {} };

    const amnestied = createScoreboard(PLAYERS);
    amnestied.pool = { P0: 5, P1: 2, P2: 0 };
    amnestied.mountain = { P0: 5, P1: 8, P2: 0 }; // k = 4
    amnestied.vists = { P0: {}, P1: { P0: 18 }, P2: {} };

    expect(finalize(amnestied)).toEqual(finalize(base));
  });

  it('TS-43: взаимозачёт вистов (30 и 18 → 12) не меняет итогов', () => {
    const mutual = createScoreboard(PLAYERS);
    mutual.pool = { P0: 4, P1: 0, P2: 0 };
    mutual.mountain = { P0: 0, P1: 0, P2: 3 };
    mutual.vists = { P0: { P1: 30 }, P1: { P0: 18 }, P2: {} };

    const netted = createScoreboard(PLAYERS);
    netted.pool = { P0: 4, P1: 0, P2: 0 };
    netted.mountain = { P0: 0, P1: 0, P2: 3 };
    netted.vists = { P0: { P1: 12 }, P1: {}, P2: {} };

    expect(finalize(netted)).toEqual(finalize(mutual));
  });

  it('TS-45: партия завершена, когда пуля закрыта у всех троих', () => {
    const board = createScoreboard(PLAYERS);
    board.pool = { P0: 10, P1: 10, P2: 12 };
    const result = finalize(board);
    expect(totalOf(result)).toBe(0);
    // Роспись выполняется по §9.9 и на закрытой пуле.
    expect(at(result, 'P2')).toBeGreaterThan(at(result, 'P0'));
  });
});
