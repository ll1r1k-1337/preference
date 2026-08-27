import { describe, expect, it } from 'vitest';

import { scoreDeal } from '../index.js';
import { deltaOf, PLAYERS } from './helpers.js';

// docs/rules.md §7, приложение Б.4
describe('Мизер (§7)', () => {
  it('TS-22: мизер сыгран (0 взяток) — пуля += 10, вистов и консоляции нет', () => {
    const deltas = scoreDeal(
      { kind: 'miser', declarer: 'P0', declarerTricks: 0 },
      { players: PLAYERS },
    );

    expect(deltas).toHaveLength(3);
    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 10, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: {} });
  });

  it('TS-23: мизерист взял 2 взятки — гора += 20, пуля не меняется, вистов нет', () => {
    const deltas = scoreDeal(
      { kind: 'miser', declarer: 'P0', declarerTricks: 2 },
      { players: PLAYERS },
    );

    expect(deltaOf(deltas, 'P0')).toEqual({ player: 'P0', pool: 0, mountain: 20, vistsOn: {} });
    expect(deltaOf(deltas, 'P1')).toEqual({ player: 'P1', pool: 0, mountain: 0, vistsOn: {} });
    expect(deltaOf(deltas, 'P2')).toEqual({ player: 'P2', pool: 0, mountain: 0, vistsOn: {} });
  });
});
