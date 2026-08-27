import { describe, expect, it } from 'vitest';

import { raspasyMultiplier, scoreDeal } from '../index.js';
import { deltaOf, expectNormalized, PLAYERS } from './helpers.js';

// docs/rules.md §10 — альтернативные значения параметров.
describe('Вариативные правила (§10)', () => {
  it('whistType = gentleman: при ремизе висты делятся, остаток вистовавшему', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6C',
        declarer: 'P0',
        tricks: { P0: 5, P1: 3, P2: 2 },
        whisted: { P1: true, P2: false },
        mode: 'light',
      },
      { players: PLAYERS, whistType: 'gentleman' },
    );

    expectNormalized(deltas);
    // 5 взяток обороны делятся 3/2 (остаток вистовавшему), цена 2, консоляция 2 каждому.
    expect(deltaOf(deltas, 'P1').vistsOn).toEqual({ P0: 3 * 2 + 2 });
    expect(deltaOf(deltas, 'P2').vistsOn).toEqual({ P0: 2 * 2 + 2 });
    // Обязательство единственного вистующего = 4, в зачёт 3 → ремиз на висте 2 × 1.
    expect(deltaOf(deltas, 'P1').mountain).toBe(2);
  });

  it('whistResponsibility = half: полуответственный вист — половина цены за взятку', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '6S',
        declarer: 'P0',
        tricks: { P0: 7, P1: 3, P2: 0 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS, whistResponsibility: 'half' },
    );

    // Недобор 2 взятки × (2 / 2) = 2 вместо 4 при full.
    expect(deltaOf(deltas, 'P2').mountain).toBe(2);
  });

  it('responsibility89 = last: на девятерной отвечает только последний вистующий', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '9H',
        declarer: 'P0',
        tricks: { P0: 9, P1: 0, P2: 1 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS, responsibility89: 'last' },
    );

    // P1 не взял ни одной, но обязательство лежит на последнем (P2), который взял 1.
    expect(deltaOf(deltas, 'P1').mountain).toBe(0);
    expect(deltaOf(deltas, 'P2').mountain).toBe(0);
  });

  it('tenPlayed = whisted: у десятерной появляется обязательство 1 взятка', () => {
    const deltas = scoreDeal(
      {
        kind: 'contract',
        contract: '10D',
        declarer: 'P0',
        tricks: { P0: 10, P1: 0, P2: 0 },
        whisted: { P1: true, P2: true },
        mode: 'dark',
      },
      { players: PLAYERS, tenPlayed: 'whisted' },
    );

    expect(deltaOf(deltas, 'P1').mountain).toBe(10);
    expect(deltaOf(deltas, 'P2').mountain).toBe(10);
  });

  it('raspasyTrickPrice = 2 удваивает гору на распасах', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 0, P1: 4, P2: 6 }, consecutiveIndex: 0 },
      { players: PLAYERS, raspasyTrickPrice: 2 },
    );

    expect(deltaOf(deltas, 'P1').mountain).toBe(8);
    expect(deltaOf(deltas, 'P2').mountain).toBe(12);
    // Премия за 0 взяток от цены взятки не зависит — только от множителя.
    expect(deltaOf(deltas, 'P0').pool).toBe(1);
  });

  it('raspasyProgression: все пять прогрессий дают предписанные множители', () => {
    const index = [0, 1, 2, 3, 4];
    expect(index.map((i) => raspasyMultiplier(i, 'none'))).toEqual([1, 1, 1, 1, 1]);
    expect(index.map((i) => raspasyMultiplier(i, 'limitedArithmetic'))).toEqual([1, 2, 3, 3, 3]);
    expect(index.map((i) => raspasyMultiplier(i, 'limitedGeometric'))).toEqual([1, 2, 4, 4, 4]);
    expect(index.map((i) => raspasyMultiplier(i, 'unlimitedArithmetic'))).toEqual([1, 2, 3, 4, 5]);
    expect(index.map((i) => raspasyMultiplier(i, 'unlimitedGeometric'))).toEqual([1, 2, 4, 8, 16]);
  });

  it('raspasyZeroBonus = mountain: премия не пишется в пулю', () => {
    const deltas = scoreDeal(
      { kind: 'raspasy', tricks: { P0: 0, P1: 4, P2: 6 }, consecutiveIndex: 0 },
      { players: PLAYERS, raspasyZeroBonus: 'mountain' },
    );

    expect(deltaOf(deltas, 'P0').pool).toBe(0);
    expect(deltaOf(deltas, 'P0').mountain).toBe(0);
  });

  it('miserVists = none — дефолт; висты на мизере не пишутся при любых взятках', () => {
    for (const tricks of [0, 1, 5, 10]) {
      const deltas = scoreDeal(
        { kind: 'miser', declarer: 'P0', declarerTricks: tricks },
        { players: PLAYERS },
      );
      for (const d of deltas) expect(d.vistsOn).toEqual({});
    }
  });
});

describe('Валидация входа', () => {
  it('отклоняет стол не из трёх игроков', () => {
    expect(() =>
      scoreDeal({ kind: 'miser', declarer: 'P0', declarerTricks: 0 }, { players: ['P0', 'P1'] }),
    ).toThrow(/3 игрок/);
  });

  it('отклоняет дубли идентификаторов игроков', () => {
    expect(() =>
      scoreDeal(
        { kind: 'miser', declarer: 'P0', declarerTricks: 0 },
        { players: ['P0', 'P0', 'P1'] },
      ),
    ).toThrow(/уникальн/);
  });

  it('отклоняет взятки мизериста вне диапазона 0..10', () => {
    expect(() =>
      scoreDeal({ kind: 'miser', declarer: 'P0', declarerTricks: 11 }, { players: PLAYERS }),
    ).toThrow(/0\.\.10/);
  });

  it('отклоняет отрицательный счётчик распасов', () => {
    expect(() =>
      scoreDeal(
        { kind: 'raspasy', tricks: { P0: 3, P1: 3, P2: 4 }, consecutiveIndex: -1 },
        { players: PLAYERS },
      ),
    ).toThrow(/счётчик распасов/);
  });

  it('отклоняет игрока, которого нет за столом', () => {
    expect(() =>
      scoreDeal({ kind: 'miser', declarer: 'PX', declarerTricks: 3 }, { players: PLAYERS }),
    ).toThrow(/не за столом/);
  });
});
