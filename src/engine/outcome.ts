/**
 * Результат раздачи — единственная точка связи с модулем расчёта очков.
 * Источник истины: docs/rules.md приложение А.3.
 */
import type { ContractId, PlayerId, PlayState } from '../core/index.js';
import { isMizer, parseContract, trickCounts } from '../core/index.js';
import type { DefenseMode } from './whist.js';

/** Взятки всех трёх игроков; сумма = 10. */
export type TrickCounts = Readonly<Record<PlayerId, number>>;

/**
 * `DealOutcome` (приложение А.3) — контракт данных между движком раздачи
 * и модулем `scoring`. Никакой игровой логики, только факты раздачи.
 */
export type DealOutcome =
  | {
      readonly kind: 'contract';
      readonly contract: ContractId;
      readonly declarer: PlayerId;
      readonly tricks: TrickCounts;
      /** Кто из двух соперников вистовал. */
      readonly whisted: Readonly<Record<PlayerId, boolean>>;
      readonly mode: DefenseMode;
    }
  | { readonly kind: 'miser'; readonly declarer: PlayerId; readonly declarerTricks: number }
  | {
      readonly kind: 'raspasy';
      readonly tricks: TrickCounts;
      /** Номер распаса подряд, начиная с 0 (§8.4). */
      readonly consecutiveIndex: number;
    };

/** Взятки по игрокам из состояния розыгрыша. */
export function tricksFromPlay(play: PlayState): TrickCounts {
  return Object.freeze(trickCounts(play));
}

/** Результат сыгранной игры на взятки либо мизера (§7.7, А.3). */
export function contractOutcome(input: {
  readonly contract: ContractId;
  readonly declarer: PlayerId;
  readonly tricks: TrickCounts;
  readonly whisted: Readonly<Record<PlayerId, boolean>>;
  readonly mode: DefenseMode;
}): DealOutcome {
  // Мизер оценивается отдельной веткой: важны только взятки мизериста (§7.7).
  if (isMizer(parseContract(input.contract))) {
    return Object.freeze({
      kind: 'miser' as const,
      declarer: input.declarer,
      declarerTricks: input.tricks[input.declarer],
    });
  }
  return Object.freeze({
    kind: 'contract' as const,
    contract: input.contract,
    declarer: input.declarer,
    tricks: input.tricks,
    whisted: input.whisted,
    mode: input.mode,
  });
}

/** Результат распасов (§8.3, А.3). */
export function raspasyOutcome(tricks: TrickCounts, consecutiveIndex: number): DealOutcome {
  return Object.freeze({ kind: 'raspasy' as const, tricks, consecutiveIndex });
}

/**
 * Результат игры «на своих» (§5.2, TS-37): оба соперника спасовали,
 * розыгрыша не было — контракт считается выполненным.
 * Фактических взяток нет, поэтому все 10 записываются игроку: это делает
 * контракт заведомо сыгранным, а обороне даёт ноль зачётных взяток.
 */
export function playedOnOwnOutcome(input: {
  readonly contract: ContractId;
  readonly declarer: PlayerId;
  readonly defenders: readonly PlayerId[];
}): DealOutcome {
  const tricks: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
  tricks[input.declarer] = 10;
  const whisted: Record<number, boolean> = {};
  for (const defender of input.defenders) whisted[defender] = false;

  return Object.freeze({
    kind: 'contract' as const,
    contract: input.contract,
    declarer: input.declarer,
    tricks: Object.freeze(tricks as Record<PlayerId, number>),
    whisted: Object.freeze(whisted as Record<PlayerId, boolean>),
    mode: 'dark' as const,
  });
}
