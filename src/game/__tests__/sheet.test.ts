/**
 * Приёмка листа записи: таблица UI обязана совпадать с выводом модуля
 * `scoring` на полной партии (минимум 3 раздачи, ТЗ задачи t_7665ed90).
 *
 * Партия прогоняется целиком движком + ботами, без UI: лист записи — чистая
 * функция от состояния партии, поэтому проверять его можно в node.
 */
import { describe, expect, it } from 'vitest';
import type { DealState } from '../../engine/index.js';
import {
  applyScore,
  createScoreboard,
  finalize,
  scoreDeal,
  type Scoreboard,
} from '../../scoring/index.js';
import { decide } from '../bot.js';
import { settle, step } from '../flow.js';
import {
  buildSheet,
  createParty,
  isPartyClosed,
  loadParty,
  PLAYER_IDS,
  recordDeal,
  saveParty,
  seatId,
  startDeal,
  toScoringOutcome,
  type PartyState,
} from '../party.js';

/** Прогнать раздачу до конца, все три места играют ботом. */
function playDeal(state: DealState, seed = 'sheet'): DealState {
  let current = settle(state).state;
  for (let guard = 0; guard < 500; guard += 1) {
    if (current.phase === 'RESULT') return current;
    const seat = current.toAct;
    if (seat === null) throw new Error(`ход ни за кем в фазе ${current.phase}`);
    const command = decide(current, seat, { level: 'normal', seed });
    if (command === null) throw new Error(`бот не смог сходить в фазе ${current.phase}`);
    const result = step(current, command);
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    current = result.state;
  }
  throw new Error('раздача не завершилась за 500 шагов');
}

/** Сыграть партию до закрытия пули (или до потолка раздач). */
function playParty(seed: string, maxDeals = 40): PartyState {
  let party = createParty({ seed });
  for (let i = 0; i < maxDeals && !isPartyClosed(party); i += 1) {
    const finished = playDeal(startDeal(party), seed);
    const outcome = finished.outcome;
    if (outcome === null) throw new Error('раздача завершилась без outcome');
    party = recordDeal(party, outcome);
  }
  return party;
}

describe('лист записи против модуля scoring', () => {
  const party = playParty('acceptance-1');

  it('партия содержит минимум 3 раздачи', () => {
    expect(party.deals.length).toBeGreaterThanOrEqual(3);
  });

  it('каждая строка листа = ScoreDelta соответствующей раздачи', () => {
    const sheet = buildSheet(party);
    expect(sheet.rows).toHaveLength(party.deals.length);

    party.deals.forEach((deal, i) => {
      const row = sheet.rows[i]!;
      // Независимый пересчёт: дельты берём заново из scoring по outcome раздачи.
      const pool: Record<string, number> = {};
      party.deals.slice(0, i).forEach((prev) => {
        prev.deltas.forEach((d) => {
          pool[d.player] = (pool[d.player] ?? 0) + d.pool;
        });
      });
      const recomputed = scoreDeal(deal.outcome, {
        players: PLAYER_IDS,
        seating: PLAYER_IDS,
        currentPool: pool,
      });

      expect(recomputed).toHaveLength(3);
      recomputed.forEach((delta) => {
        const seat = Number(delta.player);
        expect(row.pool[seat]).toBe(delta.pool);
        expect(row.mountain[seat]).toBe(delta.mountain);
        for (const target of PLAYER_IDS) {
          // vistsOn содержит только ненулевые ключи — «нет виста» это отсутствие ключа.
          expect(row.vists[seat]![Number(target)]).toBe(delta.vistsOn[target] ?? 0);
        }
      });
    });
  });

  it('итоги листа = накопленное табло scoring', () => {
    const sheet = buildSheet(party);
    let board: Scoreboard = createScoreboard(PLAYER_IDS);
    for (const deal of party.deals) board = applyScore(board, deal.deltas);

    PLAYER_IDS.forEach((p, seat) => {
      expect(sheet.totals.pool[seat]).toBe(board.pool[p]);
      expect(sheet.totals.mountain[seat]).toBe(board.mountain[p]);
    });
  });

  it('на мизерной раздаче колонки вистов пустые (§7.7)', () => {
    const sheet = buildSheet(playParty('acceptance-miser'));
    sheet.rows.forEach((row, i) => {
      if (party.deals[i]?.outcome.kind !== 'miser') return;
      expect(row.vists.flat().every((v) => v === 0)).toBe(true);
    });
  });

  it('пуля и гора в каждой строке неотрицательны (§А.3 п.2)', () => {
    for (const row of buildSheet(party).rows) {
      expect(row.pool.every((v) => v >= 0)).toBe(true);
      expect(row.mountain.every((v) => v >= 0)).toBe(true);
    }
  });

  it('итоговый пересчёт совпадает с finalize и даёт нулевую сумму (§9.9)', () => {
    const closed = playParty('acceptance-1', 200);
    expect(isPartyClosed(closed)).toBe(true);

    const sheet = buildSheet(closed);
    expect(sheet.final).not.toBeNull();

    const expected = finalize(closed.board);
    PLAYER_IDS.forEach((p, seat) => {
      expect(sheet.final![seat]).toBe(expected[p]);
    });
    expect(sheet.final!.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('сальдо вистов листа сходится с таблицей вистов', () => {
    const sheet = buildSheet(party);
    expect(sheet.totals.vistBalance.reduce((a, b) => a + b, 0)).toBe(0);
    [0, 1, 2].forEach((a) => {
      const written = [0, 1, 2].filter((b) => b !== a).reduce((s, b) => s + sheet.totals.vists[a]![b]!, 0);
      const received = [0, 1, 2].filter((b) => b !== a).reduce((s, b) => s + sheet.totals.vists[b]![a]!, 0);
      expect(sheet.totals.vistBalance[a]).toBe(written - received);
    });
  });
});

describe('слой партии', () => {
  it('счётчик распасов растёт подряд и сбрасывается сыгранной раздачей (§8.4)', () => {
    // seed подобран так, чтобы в партии были распасы подряд и сыгранная
    // раздача между ними (см. scripts/find-raspasy-seed.ts).
    let party = createParty({ seed: 'scan-16' });
    const seen: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const before = party.consecutiveRaspasy;
      const finished = playDeal(startDeal(party));
      const outcome = toScoringOutcome(finished.outcome!);
      if (outcome.kind === 'raspasy') {
        // Движок получает счётчик снаружи — индекс раздачи обязан совпасть.
        expect(outcome.consecutiveIndex).toBe(before);
        seen.push(outcome.consecutiveIndex);
      }
      party = recordDeal(party, finished.outcome!);
      if (outcome.kind !== 'raspasy') expect(party.consecutiveRaspasy).toBe(0);
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('сдающий меняется по кругу после каждой раздачи', () => {
    let party = createParty({ seed: 'dealer-rotation' });
    const dealers = [party.dealer];
    for (let i = 0; i < 3; i += 1) {
      party = recordDeal(party, playDeal(startDeal(party)).outcome!);
      dealers.push(party.dealer);
    }
    expect(dealers).toEqual([0, 1, 2, 0]);
  });

  it('partyState переживает сохранение и загрузку', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;

    const party = playParty('persist', 5);
    saveParty(party, storage);
    const restored = loadParty(storage);

    expect(restored).not.toBeNull();
    expect(buildSheet(restored!)).toEqual(buildSheet(party));
  });

  it('битое сохранение не роняет загрузку', () => {
    const storage = {
      getItem: () => '{не json',
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage;
    expect(loadParty(storage)).toBeNull();
  });

  it('seatId сопоставляет места с идентификаторами scoring', () => {
    expect([0, 1, 2].map((s) => seatId(s as 0 | 1 | 2))).toEqual(['0', '1', '2']);
  });
});
