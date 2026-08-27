/**
 * Модуль расчёта очков преферанса (docs/rules.md §9, конвенция «Сочи», rules-v1).
 *
 * Публичный контракт (приложение А.3):
 *   scoreDeal(outcome, options) -> ScoreDelta[]
 *   applyScore(scoreboard, deltas) -> Scoreboard
 *   finalize(scoreboard) -> Record<PlayerId, number>
 */
import { GAME_PRICE, resolveOptions, type ScoringOptions } from './config.js';
import { awardGamePool } from './american-help.js';
import { scoreTrickContract } from './contract.js';
import { DeltaBuilder } from './delta.js';
import { scoreRaspasy } from './raspasy.js';
import type { DealOutcome, ScoreDelta } from './types.js';

export * from './types.js';
export {
  applyScore,
  cloneScoreboard,
  createScoreboard,
  finalize,
  vistBalance,
} from './scoreboard.js';
export { raspasyMultiplier, penaltyTricks } from './raspasy.js';
export { defenderCreditedTricks, defenderObligation, defenseShape } from './contract.js';
export {
  BID_ORDER,
  GAME_PRICE,
  MOUNTAIN_PER_POINT,
  POOL_PER_POINT,
  TRICKS_IN_DEAL,
  WHIST_OBLIGATION_PER_DEFENDER,
  WHIST_OBLIGATION_TOTAL,
  contractLevel,
  gamePrice,
  resolveOptions,
  type ResolvedOptions,
  type ScoringOptions,
} from './config.js';

/** Расчёт одной раздачи. Чистая функция: состояние партии не читается и не меняется. */
export function scoreDeal(outcome: DealOutcome, options: ScoringOptions): ScoreDelta[] {
  const resolved = resolveOptions(options);
  const builder = new DeltaBuilder(resolved.players);

  if (outcome.kind === 'miser') {
    // §7 п.7: сыграл — +10 в пулю; каждая взятка — 10 в гору («шпага»).
    const tricks = outcome.declarerTricks;
    if (!Number.isInteger(tricks) || tricks < 0 || tricks > 10) {
      throw new RangeError(`взятки мизериста вне диапазона 0..10: ${tricks}`);
    }
    if (tricks === 0) {
      // §9.8: сыгранный мизер — тоже сыгранная игра, помощь применяется.
      awardGamePool(builder, outcome.declarer, GAME_PRICE.MIZER, resolved);
    } else {
      builder.addMountain(outcome.declarer, GAME_PRICE.MIZER * tricks);
    }
    // Висты и консоляция на мизере не пишутся (miserVists = none).
    return builder.build();
  }

  if (outcome.kind === 'contract') {
    scoreTrickContract(builder, outcome, resolved);
    return builder.build();
  }

  if (outcome.kind === 'raspasy') {
    scoreRaspasy(builder, outcome, resolved);
    return builder.build();
  }

  throw new Error(`не реализовано: ${(outcome as { kind: string }).kind}`);
}
