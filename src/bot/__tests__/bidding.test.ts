/**
 * Стратегия торговли: заявка или пас, эскалация, распознавание распасов.
 * Источник истины: docs/rules.md §3, §4.3.
 */
import { describe, expect, it } from 'vitest';
import { parseCards } from '../../core/index.js';
import { evaluateHand } from '../evaluate.js';
import { chooseBid, chooseFinalContract } from '../bidding.js';

/** Сильная рука: ♠AKQJ9 ♣AK ♦A ♥87 — заведомо больше шести взяток. */
const STRONG = parseCards(['AS', 'KS', 'QS', 'JS', '9S', 'AC', 'KC', 'AD', '8H', '7H']);
/** Слабая рука: сплошная мелочь, ни одной честной взятки. */
const WEAK = parseCards(['9S', '8S', '7S', '9C', '8C', '7C', '9D', '8D', '9H', '7H']);
/** Мизерная рука: мелочь без «дырок» — мизерный риск нулевой. */
const MISER = parseCards(['7S', '8S', '9S', '7C', '8C', '9C', '7D', '8D', '7H', '8H']);

describe('chooseBid — решение о заявке (§3.3)', () => {
  it('слабая рука пасует, когда заявок ещё не было', () => {
    expect(chooseBid({ hand: WEAK, legalBids: ['6S', '6C', '7S'] })).toBeNull();
  });

  it('сильная рука заявляет из числа допустимых', () => {
    const bid = chooseBid({ hand: STRONG, legalBids: ['6S', '6C', '6D', '6H', '6NT', '7S'] });
    expect(bid).not.toBeNull();
    expect(['6S', '6C', '6D', '6H', '6NT', '7S']).toContain(bid);
  });

  it('никогда не заявляет контракт вне legalBids (§3.3)', () => {
    const legal = ['8H', '8NT', '9S'] as const;
    const bid = chooseBid({ hand: STRONG, legalBids: [...legal] });
    if (bid !== null) expect(legal as readonly string[]).toContain(bid);
  });

  it('пасует, когда допустимые заявки выше оценки руки — эскалация не бесконечна', () => {
    // Рука тянет максимум на шестерную, а торговля уже на десятерных.
    const modest = parseCards(['AS', 'KS', 'QS', '9S', '7S', 'AC', '8C', '7D', '8H', '7H']);
    expect(chooseBid({ hand: modest, legalBids: ['10S', '10C', '10H', '10NT'] })).toBeNull();
  });

  it('мизерную руку заявляет мизером, когда он допустим (§3.7)', () => {
    expect(chooseBid({ hand: MISER, legalBids: ['6S', '7H', 'MIZER', '9S'] })).toBe('MIZER');
  });

  it('не заявляет мизер негодной рукой', () => {
    expect(chooseBid({ hand: STRONG, legalBids: ['MIZER', '9S', '9C'] })).not.toBe('MIZER');
  });

  it('на пустом списке допустимых заявок пасует', () => {
    expect(chooseBid({ hand: STRONG, legalBids: [] })).toBeNull();
  });

  it('распасы распознаются: три слабые руки все пасуют первым словом (§3.5)', () => {
    const all = ['6S', '6C', '6D', '6H', '6NT'];
    for (const hand of [WEAK, WEAK, WEAK]) {
      expect(chooseBid({ hand, legalBids: all })).toBeNull();
    }
  });

  it('учитывает прикуп: рука на «почти шесть» заявляет, а не пасует (§4.1–4.2)', () => {
    // Выигравший торговлю БЕРЁТ ПРИКУП и сносит (§4.2) — две карты в среднем
    // добавляют около взятки. Оценка, игнорирующая прикуп, систематически
    // недозаявляет, и партия вырождается в бесконечные распасы.
    // ♠AKQ98 ♣987 ♦9 ♥8 — по чистой оценке 5 взяток, с прикупом шестерная реальна.
    const almostSix = parseCards(['AS', 'KS', 'QS', '9S', '8S', '9C', '8C', '7C', '9D', '8H']);
    expect(evaluateHand(almostSix, 'S').expected).toBeLessThan(6);
    expect(chooseBid({ hand: almostSix, legalBids: ['6S', '6C', '6D', '6H', '6NT'] })).not.toBeNull();
  });

  it('но безнадёжную руку прикуп не спасает — пас остаётся пасом', () => {
    expect(chooseBid({ hand: WEAK, legalBids: ['6S', '6C', '6D', '6H', '6NT'] })).toBeNull();
  });

  it('прикуп не превращает шестерную руку в десятерную — бонус ограничен', () => {
    const sixish = parseCards(['AS', 'KS', 'QS', '9S', '8S', 'AC', '9C', '8C', '9D', '8H']);
    const bid = chooseBid({ hand: sixish, legalBids: ['6S', '7S', '8S', '9S', '10S'] });
    expect(['6S', '7S']).toContain(bid);
  });
});

describe('chooseFinalContract — окончательный заказ (§4.3)', () => {
  it('выбирает контракт строго из legalContracts', () => {
    const legal = ['6S', '6C', '6D', '6H', '6NT', '7S'];
    expect(legal).toContain(chooseFinalContract({ hand: STRONG, legalContracts: legal }));
  });

  it('не завышает заказ выше оценки руки — берёт минимально допустимый', () => {
    const modest = parseCards(['AS', 'KS', 'QS', '9S', '7S', 'AC', '8C', '7D', '8H', '7H']);
    const legal = ['7S', '7C', '7D', '7H', '7NT', '8S', '9S', '10NT'];
    expect(chooseFinalContract({ hand: modest, legalContracts: legal })).toBe('7S');
  });

  it('сильная рука тоже не завышает заказ: лишний уровень — это ремиз (§9.5)', () => {
    // Рука обещает ~7 взяток; допустимы 6..10 — брать десятерную нельзя.
    const strongish = parseCards(['AS', 'KS', 'QS', 'JS', '9S', 'AC', 'KC', 'AD', '8H', '7H']);
    const legal = ['6S', '7S', '8S', '9S', '10S', '10NT'];
    const chosen = chooseFinalContract({ hand: strongish, legalContracts: legal });
    expect(['6S', '7S', '8S']).toContain(chosen);
  });

  it('из нескольких посильных уровней берёт САМЫЙ ДЕШЁВЫЙ, а не самый дорогой', () => {
    // Рука на 10 взяток: посильны все уровни 6..10. Заказ обязан быть
    // минимальным — лишние уровни ничего не добавляют, но грозят ремизом.
    const monster = parseCards(['AS', 'KS', 'QS', 'JS', 'TS', '9S', '8S', '7S', 'AC', 'KC']);
    const legal = ['6S', '7S', '8S', '9S', '10S'];
    expect(chooseFinalContract({ hand: monster, legalContracts: legal })).toBe('6S');
  });

  it('на равном уровне берёт козырь, в котором рука сильнее', () => {
    // ♠AKQJT9 и ♥AKQJ: шестерная посильна в обеих мастях, но пики длиннее
    // и дают больше — козырем обязаны стать они.
    const twoSuited = parseCards(['AS', 'KS', 'QS', 'JS', 'TS', '9S', 'AH', 'KH', 'QH', 'JH']);
    expect(evaluateHand(twoSuited, 'S').expected).toBeGreaterThan(
      evaluateHand(twoSuited, 'H').expected,
    );
    expect(chooseFinalContract({ hand: twoSuited, legalContracts: ['6S', '6H'] })).toBe('6S');
    // Порядок списка на решение не влияет.
    expect(chooseFinalContract({ hand: twoSuited, legalContracts: ['6H', '6S'] })).toBe('6S');
  });

  it('мизер заказывает мизером, когда торговля выиграна мизером (§4.3)', () => {
    expect(chooseFinalContract({ hand: MISER, legalContracts: ['MIZER'] })).toBe('MIZER');
  });

  it('бросает, если допустимых заказов нет — это баг движка, а не решение бота', () => {
    expect(() => chooseFinalContract({ hand: STRONG, legalContracts: [] })).toThrow();
  });
});
