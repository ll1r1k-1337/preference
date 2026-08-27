import { describe, it, expect } from 'vitest';
import {
  ALL_CONTRACTS,
  MIZER,
  bidOrder,
  compareContracts,
  contractId,
  contractLevel,
  contractTrump,
  gamePrice,
  isHigherContract,
  isMizer,
  makeContract,
  parseContract,
  whistObligation,
} from '../contract.js';

const NORMATIVE_BID_ORDER: Record<string, number> = {
  '6S': 1, '6C': 2, '6D': 3, '6H': 4, '6NT': 5,
  '7S': 6, '7C': 7, '7D': 8, '7H': 9, '7NT': 10,
  '8S': 11, '8C': 12, '8D': 13, '8H': 14, '8NT': 15,
  MIZER: 16,
  '9S': 17, '9C': 18, '9D': 19, '9H': 20, '9NT': 21,
  '10S': 22, '10C': 23, '10D': 24, '10H': 25, '10NT': 26,
};

describe('contract: шкала bidOrder (§3.2, приложение А.1)', () => {
  it('таблица bidOrder совпадает с нормативной для всех 26 контрактов', () => {
    const actual = Object.fromEntries(ALL_CONTRACTS.map((c) => [contractId(c), bidOrder(c)]));
    expect(actual).toEqual(NORMATIVE_BID_ORDER);
  });

  it('шкала — плотная перестановка 1..26', () => {
    const orders = ALL_CONTRACTS.map(bidOrder).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });

  it('мизер стоит между 8БК и 9 пик (§3.2)', () => {
    expect(bidOrder(MIZER)).toBe(16);
    expect(bidOrder(parseContract('8NT'))).toBe(15);
    expect(bidOrder(parseContract('9S'))).toBe(17);
  });

  it('минимальная заявка — 6 пик, максимальная — 10 без козыря', () => {
    expect(bidOrder(parseContract('6S'))).toBe(1);
    expect(bidOrder(parseContract('10NT'))).toBe(26);
  });
});

describe('contract: конструирование и разбор', () => {
  it('makeContract строит игру на взятки', () => {
    const c = makeContract(7, 'H');
    expect(contractId(c)).toBe('7H');
    expect(contractLevel(c)).toBe(7);
    expect(contractTrump(c)).toBe('H');
    expect(isMizer(c)).toBe(false);
  });

  it('бескозырный контракт не имеет козыря', () => {
    const c = parseContract('8NT');
    expect(contractTrump(c)).toBeNull();
    expect(contractLevel(c)).toBe(8);
  });

  it('мизер: козыря нет, уровень отсутствует', () => {
    expect(isMizer(MIZER)).toBe(true);
    expect(contractTrump(MIZER)).toBeNull();
    expect(contractLevel(MIZER)).toBeNull();
    expect(contractId(MIZER)).toBe('MIZER');
  });

  it('parseContract(contractId(c)) — тождество для всех контрактов', () => {
    for (const c of ALL_CONTRACTS) {
      expect(parseContract(contractId(c))).toEqual(c);
    }
  });

  it('невалидные контракты отвергаются', () => {
    expect(() => parseContract('5S')).toThrow(/контракт/i);
    expect(() => parseContract('11NT')).toThrow(/контракт/i);
    expect(() => makeContract(6, 'X' as never)).toThrow(/контракт/i);
    expect(() => makeContract(11 as never, 'S')).toThrow(/контракт/i);
  });
});

describe('contract: сравнение по шкале старшинства (§3.3, §4.3)', () => {
  it('TS-01: 6♠ не перебивается такой же заявкой 6♠', () => {
    const six = parseContract('6S');
    expect(isHigherContract(six, six)).toBe(false);
    expect(compareContracts(six, six)).toBe(0);
  });

  it('TS-06: мизер перебивается только заявкой уровня 9+', () => {
    expect(isHigherContract(parseContract('8S'), MIZER)).toBe(false);
    expect(isHigherContract(parseContract('8NT'), MIZER)).toBe(false);
    expect(isHigherContract(parseContract('9S'), MIZER)).toBe(true);
  });

  it('TS-08: прыжок через ступень допустим по шкале (6♠ → 9♥)', () => {
    expect(isHigherContract(parseContract('9H'), parseContract('6S'))).toBe(true);
  });

  it('масти внутри уровня упорядочены S < C < D < H < NT', () => {
    const ids = ['6S', '6C', '6D', '6H', '6NT'];
    const orders = ids.map((id) => bidOrder(parseContract(id)));
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(5);
  });

  it('TS-09: окончательный заказ не ниже выигравшей заявки 7♦', () => {
    const won = parseContract('7D');
    const allowed = ALL_CONTRACTS.filter((c) => compareContracts(c, won) >= 0 && !isMizer(c));
    const allowedIds = allowed.map(contractId);
    expect(allowedIds).toContain('7D');
    expect(allowedIds).toContain('7H');
    expect(allowedIds).toContain('7NT');
    expect(allowedIds).toContain('8S');
    expect(allowedIds).not.toContain('7S');
    expect(allowedIds).not.toContain('7C');
    expect(allowedIds).not.toContain('6NT');
  });
});

describe('contract: стоимость игры (§9.2, приложение А.1)', () => {
  it('стоимость зависит только от уровня, не от масти', () => {
    expect(gamePrice(parseContract('6S'))).toBe(2);
    expect(gamePrice(parseContract('6NT'))).toBe(2);
    expect(gamePrice(parseContract('7H'))).toBe(4);
    expect(gamePrice(parseContract('8D'))).toBe(6);
    expect(gamePrice(parseContract('9H'))).toBe(8);
    expect(gamePrice(parseContract('10NT'))).toBe(10);
  });

  it('TS-10: заказ 8♠ после заявки 6♣ даёт цену 6', () => {
    expect(gamePrice(parseContract('8S'))).toBe(6);
  });

  it('мизер оценивается как десятерная — 10', () => {
    expect(gamePrice(MIZER)).toBe(10);
  });
});

describe('contract: вистовые обязательства (§5.3)', () => {
  it('обязательство всей обороны по уровням 6/7/8/9/10', () => {
    expect(whistObligation(parseContract('6S'))).toEqual({ total: 4, perDefenderWhenTwo: 2 });
    expect(whistObligation(parseContract('7H'))).toEqual({ total: 2, perDefenderWhenTwo: 1 });
    expect(whistObligation(parseContract('8D'))).toEqual({ total: 1, perDefenderWhenTwo: 1 });
    expect(whistObligation(parseContract('9NT'))).toEqual({ total: 1, perDefenderWhenTwo: 1 });
    expect(whistObligation(parseContract('10S'))).toEqual({ total: 0, perDefenderWhenTwo: 0 });
  });

  it('на мизере вистовых обязательств нет', () => {
    expect(whistObligation(MIZER)).toEqual({ total: 0, perDefenderWhenTwo: 0 });
  });
});
