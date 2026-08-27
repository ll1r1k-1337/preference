/**
 * Расчёт игры на взятки (§9.3–§9.6).
 *
 * Разделение ответственности:
 *   - зачётные взятки обороны (§9.4, тип виста) — `defenderCreditedTricks`;
 *   - обязательства обороны (§5.3) — `defenderObligation`;
 *   - собственно записи — `scoreTrickContract`.
 */
import {
  contractLevel,
  GAME_PRICE,
  WHIST_OBLIGATION_PER_DEFENDER,
  WHIST_OBLIGATION_TOTAL,
  type ResolvedOptions,
} from './config.js';
import { awardGamePool } from './american-help.js';
import type { DeltaBuilder } from './delta.js';
import type { ContractLevel, PlayerId, TrickContractId } from './types.js';

/** Разбор состава обороны раздачи. */
export interface DefenseShape {
  defenders: readonly PlayerId[];
  whistedDefenders: readonly PlayerId[];
  passedDefenders: readonly PlayerId[];
}

export function defenseShape(
  players: readonly PlayerId[],
  declarer: PlayerId,
  whisted: Readonly<Record<PlayerId, boolean>>,
): DefenseShape {
  const defenders = players.filter((p) => p !== declarer);
  if (defenders.length !== 2) {
    throw new RangeError(`ожидалось 2 соперника, получено ${defenders.length}`);
  }
  const whistedDefenders = defenders.filter((p) => whisted[p] === true);
  const passedDefenders = defenders.filter((p) => whisted[p] !== true);
  return { defenders, whistedDefenders, passedDefenders };
}

/**
 * §9.4 — сколько взяток обороны идёт в зачёт каждому сопернику
 * (для вистов и для проверки обязательств).
 *
 * `zhlob` (дефолт): единственный вистующий берёт в зачёт ВСЕ взятки обороны,
 * включая взятки пасовавшего; пасовавший — ноль. Вистуют оба — каждому свои.
 */
export function defenderCreditedTricks(
  shape: DefenseShape,
  tricks: Readonly<Record<PlayerId, number>>,
  options: ResolvedOptions,
  declarerRemised: boolean,
): Map<PlayerId, number> {
  const credited = new Map<PlayerId, number>();
  const defenseTricks = shape.defenders.reduce((sum, p) => sum + (tricks[p] ?? 0), 0);

  if (shape.whistedDefenders.length === 2 || shape.whistedDefenders.length === 0) {
    for (const p of shape.defenders) credited.set(p, tricks[p] ?? 0);
    return credited;
  }

  const [soleWhister] = shape.whistedDefenders;
  const [passer] = shape.passedDefenders;
  if (soleWhister === undefined || passer === undefined) {
    throw new RangeError('несогласованный состав обороны');
  }

  if (options.whistType === 'gentleman' && declarerRemised) {
    // §9.4: при ремизе игрока висты за взятки обороны делятся поровну,
    // остаток при нечётном — вистовавшему.
    const half = Math.floor(defenseTricks / 2);
    credited.set(soleWhister, defenseTricks - half);
    credited.set(passer, half);
    return credited;
  }

  // Жлобский вист: вистующий пишет за все взятки обороны, пасовавший — ничего.
  credited.set(soleWhister, defenseTricks);
  credited.set(passer, 0);
  return credited;
}

/**
 * §5.3 — обязательство каждого соперника в взятках.
 * Пасовавший обязательств не несёт; единственный вистующий отвечает за всю норму.
 */
export function defenderObligation(
  shape: DefenseShape,
  level: ContractLevel,
  options: ResolvedOptions,
): Map<PlayerId, number> {
  const obligations = new Map<PlayerId, number>();
  for (const p of shape.defenders) obligations.set(p, 0);

  // §5.3: десятерная по умолчанию только проверяется — обязательств нет.
  // Альтернатива `whisted`: десятерная вистуется с обязательством 1 взятка.
  let total = WHIST_OBLIGATION_TOTAL[level];
  let perDefender = WHIST_OBLIGATION_PER_DEFENDER[level];
  if (level === 10) {
    const whistedTen = options.tenPlayed === 'whisted';
    total = whistedTen ? 1 : 0;
    perDefender = whistedTen ? 1 : 0;
  }

  if (shape.whistedDefenders.length === 1) {
    const [sole] = shape.whistedDefenders;
    if (sole !== undefined) obligations.set(sole, total);
    return obligations;
  }

  if (shape.whistedDefenders.length === 2) {
    if ((level === 8 || level === 9) && options.responsibility89 === 'last') {
      // Альтернатива `last`: отвечает только последний вистующий.
      const last = shape.whistedDefenders[shape.whistedDefenders.length - 1];
      if (last !== undefined) obligations.set(last, perDefender);
      return obligations;
    }
    for (const p of shape.whistedDefenders) obligations.set(p, perDefender);
  }

  return obligations;
}

/** Полный расчёт игры на взятки (§9.3, §9.5, §9.6). */
export function scoreTrickContract(
  builder: DeltaBuilder,
  outcome: {
    contract: TrickContractId;
    declarer: PlayerId;
    tricks: Readonly<Record<PlayerId, number>>;
    whisted: Readonly<Record<PlayerId, boolean>>;
  },
  options: ResolvedOptions,
): void {
  const level = contractLevel(outcome.contract);
  const price = GAME_PRICE[level];
  const shape = defenseShape(options.players, outcome.declarer, outcome.whisted);

  const declarerTricks = outcome.tricks[outcome.declarer] ?? 0;
  // §5.2: если оба соперника спасовали — розыгрыша нет, игрок сразу
  // получает очки за выполненный контракт; фактические взятки не считаются.
  const noPlay = shape.whistedDefenders.length === 0;
  const shortfall = noPlay ? 0 : Math.max(0, level - declarerTricks);
  const remised = shortfall > 0;

  const credited = noPlay
    ? new Map<PlayerId, number>(shape.defenders.map((p) => [p, 0]))
    : defenderCreditedTricks(shape, outcome.tricks, options, remised);
  const obligations = noPlay
    ? new Map<PlayerId, number>(shape.defenders.map((p) => [p, 0]))
    : defenderObligation(shape, level, options);

  if (remised) {
    // §9.5: игрок пишет гору за каждый недобор; в пулю не пишется ничего.
    builder.addMountain(outcome.declarer, price * shortfall);
  } else {
    // §9.3: сыгранный контракт — очки в пулю (перебор бонуса не даёт).
    // §9.8: при закрытой пуле очки уходят сопернику («американская помощь»).
    awardGamePool(builder, outcome.declarer, price, options);
  }

  for (const defender of shape.defenders) {
    // §9.3/§9.4: висты за зачётные взятки обороны.
    const tricksForVists = credited.get(defender) ?? 0;
    builder.addVists(defender, outcome.declarer, price * tricksForVists);

    // §9.5: консоляция — её пишет каждый соперник, включая пасовавшего.
    if (remised) {
      builder.addVists(defender, outcome.declarer, price * shortfall);
    }

    // §9.6: ремиз на висте — гора за недобор обязательных взяток.
    const obligation = obligations.get(defender) ?? 0;
    const undertricks = Math.max(0, obligation - tricksForVists);
    if (undertricks > 0) {
      const perTrick = options.whistResponsibility === 'half' ? price / 2 : price;
      builder.addMountain(defender, perTrick * undertricks);
    }
  }
}
