import { describe, expect, it } from 'vitest';

import { scoreDeal } from '../index.js';
import { deltaOf, expectNormalized, PLAYERS } from './helpers.js';

// docs/rules.md §9.3, §9.4, §9.6; приложение Б.6
describe('Сыгранный контракт (§9.3)', () => {
  it('TS-31: 7♥ (цена 4) сыгран, вистовали оба, взятки обороны 2 и 1', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '7H',
        declarer: 'P0',
        tricks: { P0: 7, P1: 2, P2: 1 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    // Игрок: пуля += 4, гора не растёт, вистов не пишет.
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 4, mountain: 0, vistsOn: {} });
    // Висты за свои взятки: 2×4 и 1×4. Обязательство 1 на каждого выполнено, консоляции нет.
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: { P0: 8 } });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: { P0: 4 } });
  });

  it('TS-34: 6♠ (цена 2), перебор до 7 взяток; недобор обязательных взяток у B', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6S',
        declarer: 'P0',
        tricks: { P0: 7, P1: 2, P2: 1 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    // Перебор не даёт игроку дополнительных очков.
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 2, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: { P0: 4 } });
    // Обязательство 2 на каждого; P2 взял 1 → ремиз на висте 2 × 1.
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 2, vistsOn: { P0: 2 } });
  });

  it('TS-35: 6♠ (цена 2), взятки обороны 3 и 0 — ремиз на висте за 2 взятки', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6S',
        declarer: 'P0',
        tricks: { P0: 7, P1: 3, P2: 0 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: { P0: 6 } });
    // Нулевых вистов не пишем — ключа P0 у P2 быть не должно (§А.3 п.3).
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 4, vistsOn: {} });
  });

  it('TS-36: 9♥ (цена 8), responsibility89 = both — ремиз у не взявшего ни одной', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '9H',
        declarer: 'P0',
        tricks: { P0: 9, P1: 1, P2: 0 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 8, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: { P0: 8 } });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 8, vistsOn: {} });
  });

  it('TS-37: 7♠ (цена 4), оба соперника спасовали — розыгрыша нет', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '7S',
        declarer: 'P0',
        tricks: { P0: 0, P1: 0, P2: 0 },
        whisted: { P1: false, P2: false },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 4, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: {} });
  });

  it('TS-38: 10♦ (цена 10), tenPlayed = checked — вистовых обязательств нет, вистов нет', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '10D',
        declarer: 'P0',
        tricks: { P0: 10, P1: 0, P2: 0 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS },
    );

    expectNormalized(deltas);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 10, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: {} });
  });
});
