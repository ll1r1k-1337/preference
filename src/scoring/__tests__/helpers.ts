import { expect } from 'vitest';

import type { PlayerId, ScoreDelta } from '../index.js';

/** Стандартный стол для тестов: три игрока в порядке возрастания PlayerId. */
export const PLAYERS: readonly PlayerId[] = ['P0', 'P1', 'P2'] as const;

/** Достаёт дельту конкретного игрока; падает, если её нет (нарушение нормализации А.3 п.1). */
export function deltaOf(deltas: readonly ScoreDelta[], player: PlayerId): ScoreDelta {
  const found = deltas.find((d) => d.player === player);
  expect(found, `нет дельты для игрока ${player}`).toBeDefined();
  return found as ScoreDelta;
}

/** Проверяет нормализацию ScoreDelta[] по приложению А.3. */
export function expectNormalized(
  deltas: readonly ScoreDelta[],
  players: readonly PlayerId[] = PLAYERS,
): void {
  const sorted = [...players].sort();
  expect(deltas.map((d) => d.player)).toEqual(sorted);
  for (const d of deltas) {
    expect(Number.isInteger(d.pool), `pool ${d.player} не целое`).toBe(true);
    expect(Number.isInteger(d.mountain), `mountain ${d.player} не целое`).toBe(true);
    expect(d.pool, `pool ${d.player} отрицательный`).toBeGreaterThanOrEqual(0);
    expect(d.mountain, `mountain ${d.player} отрицательный`).toBeGreaterThanOrEqual(0);
    for (const [target, value] of Object.entries(d.vistsOn)) {
      expect(value, `нулевой ключ vistsOn[${target}] у ${d.player}`).not.toBe(0);
      expect(target, `vistsOn на самого себя у ${d.player}`).not.toBe(d.player);
      expect(Number.isInteger(value)).toBe(true);
    }
  }
}

/** Значение из Record с проверкой наличия (удобно при noUncheckedIndexedAccess). */
export function at(record: Readonly<Record<PlayerId, number>>, player: PlayerId): number {
  const value = record[player];
  expect(value, `нет значения для ${player}`).toBeDefined();
  return value as number;
}

/** Сумма итогов — обязана быть нулевой (TS-41). */
export function totalOf(result: Readonly<Record<PlayerId, number>>): number {
  return Object.values(result).reduce((sum, v) => sum + v, 0);
}
