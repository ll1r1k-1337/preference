/**
 * Снос двух карт с учётом выбранного козыря.
 * Источник истины: docs/rules.md §4.2, §7 п.3.
 */
import { describe, expect, it } from 'vitest';
import { cardIds, parseCards } from '../../core/index.js';
import { chooseDiscard } from '../discard.js';

describe('chooseDiscard — снос ровно двух карт (§4.2)', () => {
  it('всегда возвращает ровно две разные карты из руки', () => {
    const hand = parseCards([
      'AS', 'KS', 'QS', '9S', '7S', 'AC', '8C', '7D', '9D', '8H', '7H', 'TH',
    ]);
    const discard = chooseDiscard({ hand, contract: '6S' });
    expect(discard).toHaveLength(2);
    expect(new Set(discard).size).toBe(2);
    for (const id of discard) expect(cardIds(hand)).toContain(id);
  });

  it('никогда не сносит козырь, пока есть боковые карты', () => {
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', 'TS', '9S', '8S', '7D', '9D', '7H', '8H', '9H',
    ]);
    const discard = chooseDiscard({ hand, contract: '6S' });
    for (const id of discard) expect(id.endsWith('S')).toBe(false);
  });

  it('не сносит козырь даже когда он — самая мелкая карта руки', () => {
    // ♥7 и ♥8 — козыри и одновременно младшие карты; сносить надо ♦, а не их.
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', 'AC', 'KC', 'QC', 'JC', '9D', 'TD', '7H', '8H',
    ]);
    const discard = chooseDiscard({ hand, contract: '6H' });
    for (const id of discard) expect(id.endsWith('H')).toBe(false);
    expect(new Set(discard)).toEqual(new Set(['9D', 'TD']));
  });

  it('не сносит козырь, даже если это разбивает ренонс в боковой масти', () => {
    // ♦ — двойка мелочи (ренонс за один снос), но ♥ — козырь и тоже мелочь.
    // Правило «козырь не сносится» сильнее премии за ренонс.
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', 'TS', '9S', '8S', '7S', '7D', '8D', '7H', '8H',
    ]);
    const discard = chooseDiscard({ hand, contract: '6H' });
    for (const id of discard) expect(id.endsWith('H')).toBe(false);
  });

  it('козырная мелочь ценнее боковой мелочи той же силы', () => {
    // ♥78 — козырный дублет из младших карт; боковые масти длиной 3 и 4,
    // ренонса ни одна пара не даёт. Без правила «козырь не сносится» самой
    // дешёвой парой оказался бы именно козырный дублет.
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', '7C', '8C', '9C', '7D', '8D', '9D', '7H', '8H',
    ]);
    const discard = chooseDiscard({ hand, contract: '6H' });
    for (const id of discard) expect(id.endsWith('H')).toBe(false);
    expect(discard).not.toContain('7H');
    expect(discard).not.toContain('8H');
  });

  it('сохраняет стопперы: снос идёт из мелочи, а не из старших карт масти', () => {
    // ♦ длинная и содержит стопперы AK; сносить надо её мелочь, не honor-ы.
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', 'TS', 'AD', 'KD', '7D', '8D', '9D', '7C', '8C',
    ]);
    const discard = chooseDiscard({ hand, contract: '6S' });
    expect(discard).not.toContain('AD');
    expect(discard).not.toContain('KD');
  });

  it('сохраняет одинокий стоппер короткой масти, снося мелочь длинной', () => {
    // ♦A — синглет-стоппер: снести его = потерять верную взятку.
    // Мелочь длинных ♣ безопаснее, хотя снос синглета и дал бы ренонс.
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', 'TS', 'AD', '7C', '8C', '9C', 'TC', 'JC', 'QC',
    ]);
    const discard = chooseDiscard({ hand, contract: '6S' });
    expect(discard).not.toContain('AD');
    for (const id of discard) expect(id.endsWith('C')).toBe(true);
  });

  it('сносит короткую боковую масть целиком, освобождая руку под ренонс', () => {
    // ♦ — единственная короткая боковая масть; снести её целиком = получить ренонс.
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', '9S', '7C', '8C', '9C', 'TC', 'JC', '7D', '8D',
    ]);
    const discard = chooseDiscard({ hand, contract: '6S' });
    expect(new Set(discard)).toEqual(new Set(['7D', '8D']));
  });

  it('при двух коротких мастях сносит одну целиком, а не по карте из каждой', () => {
    // ♦78 и ♥78 равноценны, но снос по одной карте не даёт ренонса вовсе.
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', '9S', '8C', '9C', 'TC', '7D', '8D', '7H', '8H',
    ]);
    const discard = chooseDiscard({ hand, contract: '6S' });
    const suits = new Set(discard.map((id) => id[1]));
    expect(suits.size).toBe(1);
  });

  it('сохраняет стопперы: туз короткой масти не сносится', () => {
    const hand = parseCards([
      'AS', 'KS', 'QS', 'JS', '9S', 'AD', '7D', '7C', '8C', '9C', '7H', '8H',
    ]);
    const discard = chooseDiscard({ hand, contract: '6S' });
    expect(discard).not.toContain('AD');
  });

  it('на бескозырной сносит самые слабые карты, козыря нет', () => {
    const hand = parseCards([
      'AS', 'KS', 'AC', 'KC', 'AD', 'KD', 'AH', '7S', '7C', '7D', '7H', '8H',
    ]);
    const discard = chooseDiscard({ hand, contract: '6NT' });
    expect(discard).toHaveLength(2);
    for (const id of discard) expect(['AS', 'KS', 'AC', 'KC', 'AD', 'KD', 'AH']).not.toContain(id);
  });

  it('на мизере сносит самые опасные карты — те, что возьмут взятку (§7)', () => {
    // ♠A и ♠K — гарантированные взятки мизериста, их и надо снести.
    const hand = parseCards([
      'AS', 'KS', '7S', '8S', '7C', '8C', '9C', '7D', '8D', '9D', '7H', '8H',
    ]);
    const discard = chooseDiscard({ hand, contract: 'MIZER' });
    expect(new Set(discard)).toEqual(new Set(['AS', 'KS']));
  });

  it('детерминирован: тот же вход даёт тот же снос', () => {
    const hand = parseCards([
      'AS', 'KS', 'QS', '9S', '7S', 'AC', '8C', '7D', '9D', '8H', '7H', 'TH',
    ]);
    const a = chooseDiscard({ hand, contract: '7H' });
    const b = chooseDiscard({ hand, contract: '7H' });
    expect(a).toEqual(b);
  });
});
