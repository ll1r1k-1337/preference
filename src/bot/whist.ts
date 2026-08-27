/**
 * Решение обороны: вистовать или пасовать, и в каком режиме.
 * Источник истины: docs/rules.md §4.4, §5.2, §5.3, §9.6.
 *
 * Экономика решения: вистующий, не добравший обязательных взяток, пишет
 * ремиз в гору (§9.6), а пасующий не рискует ничем, но и вистов не пишет
 * (§9.4). Поэтому вистуем, когда ожидаемые взятки покрывают обязательство.
 */
import type { Card } from '../core/index.js';
import { contractTrump, isMizer, parseContract, whistObligation } from '../core/index.js';
import { evaluateHand } from './evaluate.js';

/** Режим розыгрыша обороны (§5.2). */
export type DefenseMode = 'dark' | 'light';

export interface WhistInput {
  readonly hand: readonly Card[];
  /** Окончательный контракт игрока. */
  readonly contract: string;
  /** Второй соперник уже объявил вист — норма делится (§5.3). */
  readonly partnerWhisted: boolean;
}

export interface WhistDecisionResult {
  readonly whist: boolean;
  /**
   * Режим розыгрыша; задаётся только единственным вистующим (§5.2).
   * При вистующем партнёре оборона обязана играть втёмную, поле не заполняется.
   */
  readonly mode?: DefenseMode;
}

/**
 * Запас, с которым бот берёт обязательство: половина взятки.
 * Оценка руки не точна, но недобор наказывается горой (§9.6) — поэтому
 * требуем покрытия нормы без запаса в свою пользу, но и без перестраховки.
 */
const MARGIN = 0.5;

/** Вистовать или пас (§4.4). */
export function chooseWhist(input: WhistInput): WhistDecisionResult {
  const contract = parseContract(input.contract);

  /**
   * §5.2 живёт РОВНО ЗДЕСЬ: режим «всветлую» вправе запросить только
   * единственный вистующий. При вистующем партнёре режим не указывается
   * вовсе — иначе движок отвергнет заявку (ILLEGAL_WHIST).
   */
  const whistNow = (): WhistDecisionResult =>
    input.partnerWhisted ? { whist: true } : { whist: true, mode: 'light' };

  // §7.4: на мизере вистовых заявок нет вовсе — оборона играет обязательно.
  if (isMizer(contract)) return { whist: true };

  const obligation = whistObligation(contract);
  // §5.3: один вистующий отвечает за всю норму, при двух — за свою половину.
  const required = input.partnerWhisted ? obligation.perDefenderWhenTwo : obligation.total;

  // §5.3, десятерная: обязательств нет — вистовать бесплатно.
  if (required === 0) return whistNow();

  // Оборона играет против козыря игрока: свою руку оцениваем в его козыре.
  const trump = contractTrump(contract);
  const expected = evaluateHand(input.hand, trump ?? 'NT').expected;

  if (expected + MARGIN < required) return { whist: false };

  return whistNow();
}
