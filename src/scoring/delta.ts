/**
 * Сборка и нормализация `ScoreDelta[]` (приложение А.3).
 *
 * Билдер гарантирует нормализацию, требуемую спецификацией:
 *  1. ровно по одной записи на каждого игрока, отсортированные по `PlayerId`;
 *  2. `pool`/`mountain` — всегда числа ≥ 0;
 *  3. `vistsOn` содержит только ненулевые записи;
 *  4. `vistsOn[self]` запрещён.
 */
import type { PlayerId, ScoreDelta } from './types.js';

interface Accumulator {
  pool: number;
  mountain: number;
  vistsOn: Map<PlayerId, number>;
}

export class DeltaBuilder {
  private readonly acc = new Map<PlayerId, Accumulator>();

  constructor(players: readonly PlayerId[]) {
    for (const player of players) {
      this.acc.set(player, { pool: 0, mountain: 0, vistsOn: new Map() });
    }
  }

  private slot(player: PlayerId): Accumulator {
    const found = this.acc.get(player);
    if (!found) throw new RangeError(`игрок ${player} не за столом`);
    return found;
  }

  /** Запись в пулю (§9.1): только неотрицательные приращения. */
  addPool(player: PlayerId, points: number): this {
    if (points < 0) throw new RangeError(`отрицательная запись в пулю: ${points}`);
    this.slot(player).pool += points;
    return this;
  }

  /** Запись в гору (§9.1): только неотрицательные приращения. */
  addMountain(player: PlayerId, points: number): this {
    if (points < 0) throw new RangeError(`отрицательная запись в гору: ${points}`);
    this.slot(player).mountain += points;
    return this;
  }

  /**
   * `writer` пишет `vists` вистов на `target`.
   * Нулевые записи допускаются на входе и отбрасываются при `build()` —
   * единственная точка, где действует нормализация §А.3 п.3.
   */
  addVists(writer: PlayerId, target: PlayerId, vists: number): this {
    if (writer === target) throw new RangeError(`висты на самого себя: ${writer}`);
    if (vists < 0) throw new RangeError(`отрицательная запись вистов: ${vists}`);
    const slot = this.slot(writer);
    this.slot(target); // валидация цели
    slot.vistsOn.set(target, (slot.vistsOn.get(target) ?? 0) + vists);
    return this;
  }

  /** Нормализованный результат: сортировка по PlayerId, нулевые висты отброшены. */
  build(): ScoreDelta[] {
    return [...this.acc.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([player, slot]) => {
        const vistsOn: Record<PlayerId, number> = {};
        for (const target of [...slot.vistsOn.keys()].sort()) {
          const value = slot.vistsOn.get(target) ?? 0;
          if (value !== 0) vistsOn[target] = value;
        }
        return { player, pool: slot.pool, mountain: slot.mountain, vistsOn };
      });
  }
}
