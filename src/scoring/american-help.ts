/**
 * «Американская помощь» (§9.8).
 *
 * Игрок, чья пуля достигла `poolTarget`, при следующей сыгранной игре пишет
 * очки за неё в пулю сопернику с наибольшей (незакрытой) пулей, а на него —
 * висты в десятикратном размере (`gamePrice × 10`).
 *
 * Единственное место модуля, которому нужно состояние партии; оно приходит
 * снаружи через `options.currentPool` (§А.3 п.5).
 */
import { POOL_PER_POINT, type ResolvedOptions } from './config.js';
import type { DeltaBuilder } from './delta.js';
import type { PlayerId } from './types.js';

/**
 * Кому адресуется помощь: соперник с наибольшей незакрытой пулей;
 * при равенстве — следующий по часовой стрелке от игрока.
 * `null`, если помощь не применяется.
 */
export function americanHelpRecipient(
  declarer: PlayerId,
  options: ResolvedOptions,
): PlayerId | null {
  if (!options.americanHelp) return null;
  const currentPool = options.currentPool;
  if (currentPool === null) return null;

  const declarerPool = currentPool[declarer] ?? 0;
  if (declarerPool < options.poolTarget) return null;

  const opponents = options.players.filter((p) => p !== declarer);
  const open = opponents.filter((p) => (currentPool[p] ?? 0) < options.poolTarget);
  const candidates = open.length > 0 ? open : opponents;
  if (candidates.length === 0) return null;

  const best = Math.max(...candidates.map((p) => currentPool[p] ?? 0));
  const tied = candidates.filter((p) => (currentPool[p] ?? 0) === best);
  if (tied.length === 1) return tied[0] ?? null;

  // Ничья — следующий по часовой стрелке от игрока.
  const seating = options.seating;
  const start = seating.indexOf(declarer);
  if (start < 0) return tied[0] ?? null;
  for (let step = 1; step <= seating.length; step += 1) {
    const candidate = seating[(start + step) % seating.length];
    if (candidate !== undefined && tied.includes(candidate)) return candidate;
  }
  return tied[0] ?? null;
}

/**
 * Начисление очков за СЫГРАННУЮ игру (§9.3, §7 п.7) с учётом помощи (§9.8).
 * Возвращает получателя помощи (или `null`, если очки записаны самому игроку).
 */
export function awardGamePool(
  builder: DeltaBuilder,
  declarer: PlayerId,
  points: number,
  options: ResolvedOptions,
): PlayerId | null {
  const recipient = americanHelpRecipient(declarer, options);
  if (recipient === null) {
    builder.addPool(declarer, points);
    return null;
  }
  // Очки уходят в пулю получателя, компенсация — висты ×10 на него.
  builder.addPool(recipient, points);
  builder.addVists(declarer, recipient, points * POOL_PER_POINT);
  return recipient;
}
