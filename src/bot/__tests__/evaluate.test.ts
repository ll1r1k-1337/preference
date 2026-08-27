/**
 * Оценка руки: верные и полуверные взятки, сила по мастям, пригодность для мизера.
 * Источник истины по правилам: docs/rules.md §1 (старшинство), §5.3, §7.
 */
import { describe, expect, it } from 'vitest';
import { parseCards } from '../../core/index.js';
import { evaluateHand, evaluateSuit, miserRisk } from '../evaluate.js';

describe('evaluateSuit — верные и полуверные взятки одной масти', () => {
  it('туз — одна верная взятка', () => {
    expect(evaluateSuit(parseCards(['AS']))).toEqual({ sure: 1, half: 0 });
  });

  it('туз с королём — две верные', () => {
    expect(evaluateSuit(parseCards(['AS', 'KS']))).toEqual({ sure: 2, half: 0 });
  });

  it('туз, король, дама — три верные', () => {
    expect(evaluateSuit(parseCards(['AS', 'KS', 'QS']))).toEqual({ sure: 3, half: 0 });
  });

  it('король без туза с прикрытием — полуверная', () => {
    expect(evaluateSuit(parseCards(['KS', '7S']))).toEqual({ sure: 0, half: 1 });
  });

  it('голый король без туза не считается вовсе', () => {
    expect(evaluateSuit(parseCards(['KS']))).toEqual({ sure: 0, half: 0 });
  });

  it('король с дамой и прикрытием — две полуверные', () => {
    expect(evaluateSuit(parseCards(['KS', 'QS', 'JS']))).toEqual({ sure: 0, half: 2 });
  });

  it('дама без короля требует двух прикрытий', () => {
    expect(evaluateSuit(parseCards(['QS', 'JS', '9S']))).toEqual({ sure: 0, half: 1 });
    expect(evaluateSuit(parseCards(['QS', 'JS']))).toEqual({ sure: 0, half: 0 });
  });

  it('мелочь взяток не даёт', () => {
    expect(evaluateSuit(parseCards(['7S', '8S', '9S', 'TS']))).toEqual({ sure: 0, half: 0 });
  });
});

describe('evaluateHand — оценка руки под конкретный козырь', () => {
  // Рука: ♠AKQ97 ♣A8 ♦7 ♥87 — сильные пики, туз треф, синглет бубны.
  const hand = parseCards(['AS', 'KS', 'QS', '9S', '7S', 'AC', '8C', '7D', '8H', '7H']);

  it('на бескозырной считает только честные взятки, без длины и ренонсов', () => {
    const nt = evaluateHand(hand, 'NT');
    // ♠AKQ = 3 верных, ♣A = 1 верная; полуверных нет.
    expect(nt.sure).toBe(4);
    expect(nt.half).toBe(0);
    expect(nt.expected).toBe(4);
  });

  it('козырь добавляет длину и возможность подрезать короткие масти', () => {
    const spades = evaluateHand(hand, 'S');
    expect(spades.sure).toBe(4);
    // Козырных пять: длина сверх трёх даёт бонус; синглет ♦ — потенциальный ренонс.
    expect(spades.expected).toBeGreaterThan(evaluateHand(hand, 'NT').expected);
  });

  it('bestTrump выбирает масть с наибольшей ожидаемой силой', () => {
    expect(evaluateHand(hand, 'S').bestTrump).toBe('S');
    expect(evaluateHand(hand, 'NT').bestTrump).toBe('S');
  });

  it('оценка по мастям доступна отдельно', () => {
    const spades = evaluateHand(hand, 'S');
    expect(spades.bySuit.S).toEqual({ sure: 3, half: 0, length: 5 });
    expect(spades.bySuit.D).toEqual({ sure: 0, half: 0, length: 1 });
  });
});

describe('miserRisk — пригодность руки для мизера (§7)', () => {
  it('сплошная мелочь — идеальный мизер, риск ноль', () => {
    const hand = parseCards(['7S', '8S', '9S', '7C', '8C', '9C', '7D', '8D', '7H', '8H']);
    expect(miserRisk(hand)).toBe(0);
  });

  it('каждый голый туз — верная взятка мизериста', () => {
    const hand = parseCards(['AS', '7S', '8S', 'AC', '7C', '8C', '7D', '8D', '7H', '8H']);
    expect(miserRisk(hand)).toBe(2);
  });

  it('туз с королём одной масти — две неизбежные взятки', () => {
    const hand = parseCards(['AS', 'KS', '7S', '8S', '7C', '8C', '7D', '8D', '7H', '8H']);
    expect(miserRisk(hand)).toBe(2);
  });

  it('одинокая старшая карта в короткой масти опаснее той же карты в длинной', () => {
    const short = parseCards(['KS', '7S', '7C', '8C', '9C', 'TC', '7D', '8D', '7H', '8H']);
    const long = parseCards(['KS', '7S', '8S', '9S', 'TS', 'JS', '7D', '8D', '7H', '8H']);
    expect(miserRisk(short)).toBeGreaterThan(miserRisk(long));
  });
});
