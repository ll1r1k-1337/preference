/**
 * Табло партии и итоговая роспись пули (§9.9).
 *
 * Итог_i = 5 · Σ_{j≠i} (D_i − D_j) + V_i,  где D = пуля − гора,
 * V_i = (висты, записанные i на других) − (висты, записанные другими на i).
 */
import type { PlayerId, Scoreboard, ScoreDelta } from './types.js';

/** Пустое табло на заданный стол. */
export function createScoreboard(players: readonly PlayerId[]): Scoreboard {
  const pool: Record<PlayerId, number> = {};
  const mountain: Record<PlayerId, number> = {};
  const vists: Record<PlayerId, Record<PlayerId, number>> = {};
  for (const p of players) {
    pool[p] = 0;
    mountain[p] = 0;
    vists[p] = {};
  }
  return { players: [...players], pool, mountain, vists };
}

/** Глубокая копия табло (все операции чистые). */
export function cloneScoreboard(board: Scoreboard): Scoreboard {
  const vists: Record<PlayerId, Record<PlayerId, number>> = {};
  for (const [writer, row] of Object.entries(board.vists)) {
    vists[writer] = { ...row };
  }
  return {
    players: [...board.players],
    pool: { ...board.pool },
    mountain: { ...board.mountain },
    vists,
  };
}

/** Применение дельт раздачи к табло. Возвращает НОВОЕ табло. */
export function applyScore(board: Scoreboard, deltas: readonly ScoreDelta[]): Scoreboard {
  const next = cloneScoreboard(board);
  for (const delta of deltas) {
    if (!next.players.includes(delta.player)) {
      throw new RangeError(`игрок ${delta.player} не за столом`);
    }
    next.pool[delta.player] = (next.pool[delta.player] ?? 0) + delta.pool;
    next.mountain[delta.player] = (next.mountain[delta.player] ?? 0) + delta.mountain;
    const row = (next.vists[delta.player] ??= {});
    for (const [target, value] of Object.entries(delta.vistsOn)) {
      if (!next.players.includes(target)) {
        throw new RangeError(`висты на игрока ${target}, которого нет за столом`);
      }
      row[target] = (row[target] ?? 0) + value;
    }
  }
  return next;
}

/** Сальдо вистов игрока: записал на других минус записано на него. */
export function vistBalance(board: Scoreboard, player: PlayerId): number {
  let written = 0;
  for (const value of Object.values(board.vists[player] ?? {})) written += value;
  let received = 0;
  for (const [writer, row] of Object.entries(board.vists)) {
    if (writer === player) continue;
    received += row[player] ?? 0;
  }
  return written - received;
}

/**
 * Итоговая роспись (§9.9). Сумма результатов всегда равна нулю.
 * Формула инвариантна к амнистии горы (TS-42) и к взаимозачёту вистов (TS-43).
 */
export function finalize(board: Scoreboard): Record<PlayerId, number> {
  const players = board.players;
  const d = new Map<PlayerId, number>();
  for (const p of players) {
    d.set(p, (board.pool[p] ?? 0) - (board.mountain[p] ?? 0));
  }

  const result: Record<PlayerId, number> = {};
  for (const p of players) {
    const di = d.get(p) ?? 0;
    let sum = 0;
    for (const other of players) {
      if (other === p) continue;
      sum += di - (d.get(other) ?? 0);
    }
    result[p] = 5 * sum + vistBalance(board, p);
  }
  return result;
}
