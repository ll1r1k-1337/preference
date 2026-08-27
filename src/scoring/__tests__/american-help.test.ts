import { describe, expect, it } from 'vitest';

import { scoreDeal } from '../index.js';
import { deltaOf, expectNormalized, PLAYERS } from './helpers.js';

// docs/rules.md §9.8; приложение Б.7 (TS-44)
describe('Американская помощь (§9.8)', () => {
  it('TS-44: пуля P0 закрыта — 2 очка идут P1, а P0 пишет на него 20 вистов', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6C',
        declarer: 'P0',
        tricks: { P0: 6, P1: 2, P2: 2 },
        whisted: { P1: false, P2: false },
        mode: 'dark',
      },
      { players: PLAYERS, poolTarget: 10, currentPool: { P0: 10, P1: 7, P2: 4 } },
    );

    expectNormalized(deltas);
    // Пуля P0 не меняется, очки уходят получателю помощи.
    expect(deltaOf(deltas, 'P0')).toEqual({
      player: 'P0',
      pool: 0,
      mountain: 0,
      vistsOn: { P1: 20 },
    });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 2, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: {} });
  });

  it('помощь не применяется, пока пуля игрока не закрыта', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6C',
        declarer: 'P0',
        tricks: { P0: 6, P1: 2, P2: 2 },
        whisted: { P1: false, P2: false },
        mode: 'dark',
      },
      { players: PLAYERS, poolTarget: 10, currentPool: { P0: 9, P1: 7, P2: 4 } },
    );

    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 2, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: {} });
  });

  it('помощь адресуется сопернику с наибольшей незакрытой пулей', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '7S',
        declarer: 'P0',
        tricks: { P0: 7, P1: 2, P2: 1 },
        whisted: { P1: false, P2: false },
        mode: 'dark',
      },
      { players: PLAYERS, poolTarget: 10, currentPool: { P0: 12, P1: 3, P2: 8 } },
    );

    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 4, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P0').vistsOn).toEqual({ P2: 40 });
  });

  it('при равной пуле соперников помощь идёт следующему по часовой стрелке', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6C',
        declarer: 'P1',
        tricks: { P1: 6, P0: 2, P2: 2 },
        whisted: { P0: false, P2: false },
        mode: 'dark',
      },
      {
        players: PLAYERS,
        poolTarget: 10,
        currentPool: { P0: 5, P1: 10, P2: 5 },
        seating: ['P0', 'P1', 'P2'],
      },
    );

    // Следующий по часовой стрелке от P1 — P2.
    expect(deltaOf(deltas, 'P2').pool).toBe(2);
    expect(deltaOf(deltas, 'P0').pool).toBe(0);
    expect(deltaOf(deltas, 'P1').vistsOn).toEqual({ P2: 20 });
  });

  it('помощь не применяется при ремизе игрока — гора остаётся своей', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6C',
        declarer: 'P0',
        tricks: { P0: 5, P1: 3, P2: 2 },
        whisted: { P1: true, P2: false },
        mode: 'light',
      },
      { players: PLAYERS, poolTarget: 10, currentPool: { P0: 10, P1: 7, P2: 4 } },
    );

    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 0, mountain: 2, vistsOn: {} });
    expect(deltaOf(deltas, 'P1').vistsOn).toEqual({ P0: 12 });
  });

  it('мизер тоже подпадает под помощь (сыгранный мизер, пуля закрыта)', () => {
    const deltas = scoreDeal(
      { kind: 'miser', declarer: 'P0', declarerTricks: 0 },
      { players: PLAYERS, poolTarget: 10, currentPool: { P0: 10, P1: 7, P2: 4 } },
    );

    expect(deltaOf(deltas, 'P0')).toEqual({
      player: 'P0',
      pool: 0,
      mountain: 0,
      vistsOn: { P1: 100 },
    });
    expect(deltaOf(deltas, 'P1').pool).toBe(10);
  });

  it('americanHelp = off отключает механику', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6C',
        declarer: 'P0',
        tricks: { P0: 6, P1: 2, P2: 2 },
        whisted: { P1: false, P2: false },
        mode: 'dark',
      },
      {
        players: PLAYERS,
        poolTarget: 10,
        americanHelp: false,
        currentPool: { P0: 10, P1: 7, P2: 4 },
      },
    );

    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 2, mountain: 0, vistsOn: {} });
  });

  it('премия за распасы под помощь не подпадает (в пулю пишет сам игрок)', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 0, P1: 4, P2: 6 }, consecutiveIndex: 0 },
      { players: PLAYERS, poolTarget: 10, currentPool: { P0: 10, P1: 7, P2: 4 } },
    );

    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 1, mountain: 0, vistsOn: {} });
  });
});
