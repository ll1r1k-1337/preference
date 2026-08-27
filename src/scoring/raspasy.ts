/**
 * Расчёт распасов (§8.3–§8.5, §9.7).
 *
 * Висты на распасах не пишутся — только гора и премия за ноль взяток.
 */
import type { ResolvedOptions } from './config.js';
import type { DeltaBuilder } from './delta.js';
import type { PlayerId } from './types.js';

/**
 * §8.4 — множитель прогрессии по счётчику подряд идущих распасов.
 * `consecutiveIndex` считается с нуля: 0 — первый распас после сыгранной раздачи.
 */
export function raspasyMultiplier(
  consecutiveIndex: number,
  progression: ResolvedOptions['raspasyProgression'],
): number {
  if (!Number.isInteger(consecutiveIndex) || consecutiveIndex < 0) {
    throw new RangeError(`недопустимый счётчик распасов: ${consecutiveIndex}`);
  }
  switch (progression) {
    case 'none':
      return 1;
    case 'limitedArithmetic':
      // ×1, ×2, ×3, далее ×3 (потолок).
      return Math.min(consecutiveIndex + 1, 3);
    case 'limitedGeometric':
      // ×1, ×2, ×4, далее ×4.
      return 2 ** Math.min(consecutiveIndex, 2);
    case 'unlimitedArithmetic':
      // ×1, ×2, ×3, ×4, …
      return consecutiveIndex + 1;
    case 'unlimitedGeometric':
      // ×1, ×2, ×4, ×8, …
      return 2 ** consecutiveIndex;
  }
}

/** §8.3 — амнистия: минимум взяток принимается за ноль. */
export function penaltyTricks(
  players: readonly PlayerId[],
  tricks: Readonly<Record<PlayerId, number>>,
): Map<PlayerId, number> {
  const values = players.map((p) => tricks[p] ?? 0);
  const min = Math.min(...values);
  const result = new Map<PlayerId, number>();
  players.forEach((p, i) => result.set(p, (values[i] ?? 0) - min));
  return result;
}

/** Полный расчёт раздачи-распасов. */
export function scoreRaspasy(
  builder: DeltaBuilder,
  outcome: { tricks: Readonly<Record<PlayerId, number>>; consecutiveIndex: number },
  options: ResolvedOptions,
): void {
  const multiplier = raspasyMultiplier(outcome.consecutiveIndex, options.raspasyProgression);
  const trickPrice = options.raspasyTrickPrice * multiplier;
  const penalties = penaltyTricks(options.players, outcome.tricks);

  for (const player of options.players) {
    // §8.3–8.4: гора за штрафные взятки по текущей цене.
    let mountain = (penalties.get(player) ?? 0) * trickPrice;

    // §8.5: премия за ноль ФАКТИЧЕСКИХ взяток (не штрафных), ×множитель.
    const zeroTricks = (outcome.tricks[player] ?? 0) === 0;
    if (zeroTricks && options.raspasyZeroBonus === 'pool') {
      builder.addPool(player, multiplier);
    } else if (zeroTricks) {
      // Альтернатива `mountain`: списание такого же количества очков с горы.
      // §9.1 запрещает отрицательные записи, поэтому списание ограничено
      // горой, начисленной в этой же раздаче (у игрока с нулём взяток она нулевая).
      mountain = Math.max(0, mountain - multiplier);
    }

    builder.addMountain(player, mountain);
  }
}
