/**
 * Реестр вариативных правил (§10) и машиночитаемые справочники (§А.1–А.2).
 * Дефолты = конвенция «Сочи».
 */
import type { ContractId, ContractLevel, PlayerId, TrickContractId } from './types.js';

/** §9.2 — стоимость игры. Не зависит от масти козыря. */
export const GAME_PRICE: Readonly<Record<ContractLevel | 'MIZER', number>> = Object.freeze({
  6: 2,
  7: 4,
  8: 6,
  9: 8,
  10: 10,
  MIZER: 10,
});

/** §5.3 — обязательство всей обороны, взяток. */
export const WHIST_OBLIGATION_TOTAL: Readonly<Record<ContractLevel | 'MIZER', number>> =
  Object.freeze({ 6: 4, 7: 2, 8: 1, 9: 1, 10: 0, MIZER: 0 });

/** §5.3 — обязательство на каждого при двух вистующих. */
export const WHIST_OBLIGATION_PER_DEFENDER: Readonly<Record<ContractLevel | 'MIZER', number>> =
  Object.freeze({ 6: 2, 7: 1, 8: 1, 9: 1, 10: 0, MIZER: 0 });

/** §А.1 — порядок заявок (шкала торговли). Мизер = 16. */
export const BID_ORDER: Readonly<Record<ContractId, number>> = Object.freeze({
  '6S': 1, '6C': 2, '6D': 3, '6H': 4, '6NT': 5,
  '7S': 6, '7C': 7, '7D': 8, '7H': 9, '7NT': 10,
  '8S': 11, '8C': 12, '8D': 13, '8H': 14, '8NT': 15,
  MIZER: 16,
  '9S': 17, '9C': 18, '9D': 19, '9H': 20, '9NT': 21,
  '10S': 22, '10C': 23, '10D': 24, '10H': 25, '10NT': 26,
});

/** §9.1 — курс записи в вистах. */
export const POOL_PER_POINT = 10;
export const MOUNTAIN_PER_POINT = -10;

/** Всего взяток в раздаче (§6.1). */
export const TRICKS_IN_DEAL = 10;

/** §10 — вариативные параметры расчёта. */
export interface ScoringOptions {
  /** Стол; порядок не важен, дельты всё равно сортируются по PlayerId. */
  players: readonly PlayerId[];
  /** §9.4 — тип виста. По умолчанию `zhlob`. */
  whistType?: 'zhlob' | 'gentleman';
  /** §9.6 — ответственность вистующего. По умолчанию `full`. */
  whistResponsibility?: 'full' | 'half';
  /** §7 п.7 — висты на мизере. По умолчанию `none`. */
  miserVists?: 'none' | 'asTen';
  /** §5.3 — на 8 и 9 при двух вистующих обязательство на каждом. По умолчанию `both`. */
  responsibility89?: 'both' | 'last';
  /** §5.3 — десятерная. По умолчанию `checked` (обязательств нет). */
  tenPlayed?: 'checked' | 'whisted';
  /** §8.4 — цена взятки на распасах. По умолчанию 1. */
  raspasyTrickPrice?: number;
  /** §8.4 — прогрессия множителя. По умолчанию `limitedArithmetic`. */
  raspasyProgression?:
    | 'none'
    | 'limitedArithmetic'
    | 'limitedGeometric'
    | 'unlimitedArithmetic'
    | 'unlimitedGeometric';
  /** §8.5 — куда идёт премия за 0 взяток. По умолчанию `pool`. */
  raspasyZeroBonus?: 'pool' | 'mountain';
  /** §9.8 — «американская помощь». По умолчанию `on`. */
  americanHelp?: boolean;
  /** §9.8 — целевая пуля партии. По умолчанию 10. */
  poolTarget?: number;
  /**
   * §9.8, §А.3 п.5 — текущая пуля игроков до раздачи.
   * Нужна исключительно «американской помощи»; без неё помощь не применяется.
   */
  currentPool?: Readonly<Record<PlayerId, number>>;
  /** §5.3, порядок посадки по часовой стрелке — для разрешения ничьей в §9.8. */
  seating?: readonly PlayerId[];
}

/** Полностью разрешённая конфигурация: все параметры имеют значение. */
export interface ResolvedOptions {
  players: readonly PlayerId[];
  whistType: 'zhlob' | 'gentleman';
  whistResponsibility: 'full' | 'half';
  miserVists: 'none' | 'asTen';
  responsibility89: 'both' | 'last';
  tenPlayed: 'checked' | 'whisted';
  raspasyTrickPrice: number;
  raspasyProgression:
    | 'none'
    | 'limitedArithmetic'
    | 'limitedGeometric'
    | 'unlimitedArithmetic'
    | 'unlimitedGeometric';
  raspasyZeroBonus: 'pool' | 'mountain';
  americanHelp: boolean;
  poolTarget: number;
  currentPool: Readonly<Record<PlayerId, number>> | null;
  seating: readonly PlayerId[];
}

/** Приводит частичные опции к полной конфигурации с дефолтами «Сочи». */
export function resolveOptions(options: ScoringOptions): ResolvedOptions {
  const players = [...options.players];
  if (players.length !== 3) {
    throw new RangeError(`поддерживается ровно 3 игрока, получено ${players.length}`);
  }
  if (new Set(players).size !== players.length) {
    throw new RangeError('идентификаторы игроков должны быть уникальны');
  }
  return {
    players,
    whistType: options.whistType ?? 'zhlob',
    whistResponsibility: options.whistResponsibility ?? 'full',
    miserVists: options.miserVists ?? 'none',
    responsibility89: options.responsibility89 ?? 'both',
    tenPlayed: options.tenPlayed ?? 'checked',
    raspasyTrickPrice: options.raspasyTrickPrice ?? 1,
    raspasyProgression: options.raspasyProgression ?? 'limitedArithmetic',
    raspasyZeroBonus: options.raspasyZeroBonus ?? 'pool',
    americanHelp: options.americanHelp ?? true,
    poolTarget: options.poolTarget ?? 10,
    currentPool: options.currentPool ?? null,
    seating: options.seating ?? players,
  };
}

/** Уровень контракта из идентификатора (§А.1). */
export function contractLevel(contract: TrickContractId): ContractLevel {
  const level = Number.parseInt(contract, 10);
  if (level !== 6 && level !== 7 && level !== 8 && level !== 9 && level !== 10) {
    throw new RangeError(`неизвестный контракт: ${contract}`);
  }
  return level;
}

/** Стоимость игры (§9.2) для любого контракта, включая мизер. */
export function gamePrice(contract: ContractId): number {
  if (contract === 'MIZER') return GAME_PRICE.MIZER;
  return GAME_PRICE[contractLevel(contract)];
}
