/**
 * Решение о висте: вистовать или пасовать по ожидаемым взяткам
 * против объявленного контракта.
 * Источник истины: docs/rules.md §4.4, §5.2, §5.3, §9.4, §9.6.
 */
import { describe, expect, it } from 'vitest';
import { parseCards } from '../../core/index.js';
import { chooseWhist } from '../whist.js';

/** Оборонительно сильная рука: три туза и король — четыре честные взятки. */
const STRONG = parseCards(['AS', 'KS', 'AC', '9C', 'AD', '8D', '7D', 'AH', '8H', '7H']);
/** Пустая рука: ни одной честной взятки. */
const WEAK = parseCards(['9S', '8S', '7S', '9C', '8C', '7C', '9D', '8D', '9H', '7H']);

describe('chooseWhist — вистовать или пас (§4.4, §5.3)', () => {
  it('на шестерной (норма обороны 4) сильная рука вистует', () => {
    const decision = chooseWhist({ hand: STRONG, contract: '6S', partnerWhisted: false });
    expect(decision.whist).toBe(true);
  });

  it('на шестерной пустая рука пасует: нормы 4 взятки ей не набрать', () => {
    const decision = chooseWhist({ hand: WEAK, contract: '6S', partnerWhisted: false });
    expect(decision.whist).toBe(false);
  });

  it('на десятерной вистуют всегда: обязательство ноль, риска ремиза нет (§5.3)', () => {
    expect(chooseWhist({ hand: WEAK, contract: '10NT', partnerWhisted: false }).whist).toBe(true);
  });

  it('на десятерной при вистующем партнёре режим не запрашивается (§5.2)', () => {
    // Обязательство ноль, но «всветлую» всё равно недопустимо, когда вистуют оба.
    const decision = chooseWhist({ hand: WEAK, contract: '10NT', partnerWhisted: true });
    expect(decision.whist).toBe(true);
    expect(decision.mode).toBeUndefined();
  });

  it('на восьмерной норма 1 взятка — хватает одного туза', () => {
    const oneAce = parseCards(['AS', '9S', '8S', '7C', '8C', '9C', '7D', '8D', '7H', '8H']);
    expect(chooseWhist({ hand: oneAce, contract: '8H', partnerWhisted: false }).whist).toBe(true);
  });

  it('когда партнёр уже вистует, норма делится — порог ниже (§5.3)', () => {
    // Рука тянет ~2 взятки: одна на всю оборону мало (норма 4), но при двух вистующих норма 2.
    const medium = parseCards(['AS', '9S', '8S', 'AC', '8C', '7C', '9D', '8D', '9H', '7H']);
    expect(chooseWhist({ hand: medium, contract: '6S', partnerWhisted: false }).whist).toBe(false);
    expect(chooseWhist({ hand: medium, contract: '6S', partnerWhisted: true }).whist).toBe(true);
  });

  it('единственный вистующий с сильной рукой играет всветлую — видит обе руки (§5.2)', () => {
    const decision = chooseWhist({ hand: STRONG, contract: '6S', partnerWhisted: false });
    expect(decision.whist).toBe(true);
    expect(decision.mode).toBe('light');
  });

  it('при вистующем партнёре режим не выбирается — обязательно втёмную (§5.2)', () => {
    const decision = chooseWhist({ hand: STRONG, contract: '6S', partnerWhisted: true });
    expect(decision.whist).toBe(true);
    expect(decision.mode).toBeUndefined();
  });
});
