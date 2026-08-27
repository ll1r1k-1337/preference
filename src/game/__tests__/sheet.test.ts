/**
 * Приёмка листа записи: таблица UI обязана совпадать с выводом модуля
 * `scoring` на ручных раздачах.
 */
import { describe, expect, it } from 'vitest';
import {
  applyScore,
  createScoreboard,
  scoreDeal,
  type DealOutcome,
  type Scoreboard,
} from '../../scoring/index.js';
import {
  buildSheet,
  createParty,
  loadParty,
  PLAYER_IDS,
  recordDeal,
  saveParty,
  seatId,
  nextDealer,
  type PartyState,
} from '../party.js';

/** Набор вручную описанных исходов для тестовой партии. */
const SAMPLE_OUTCOMES: DealOutcome[] = [
  {
    kind: 'contract',
    contract: '6S',
    declarer: '0',
    tricks: { '0': 8, '1': 1, '2': 1 },
    whisted: { '0': false, '1': true, '2': true },
    mode: 'dark',
  },
  {
    kind: 'raspasy',
    tricks: { '0': 3, '1': 4, '2': 3 },
    consecutiveIndex: 0,
  },
  {
    kind: 'miser',
    declarer: '1',
    declarerTricks: 0,
  },
  {
    kind: 'contract',
    contract: '7H',
    declarer: '2',
    tricks: { '0': 2, '1': 1, '2': 7 },
    whisted: { '0': true, '1': false, '2': false },
    mode: 'dark',
  },
];

/** Сыграть партию из предзаданных исходов. */
function buildParty(outcomes: DealOutcome[]): PartyState {
  let party = createParty({ names: ['Алиса', 'Борис', 'Клара'] });
  for (const outcome of outcomes) {
    party = recordDeal(party, outcome);
  }
  return party;
}

describe('лист записи против модуля scoring', () => {
  const party = buildParty(SAMPLE_OUTCOMES);

  it('партия содержит минимум 3 раздачи', () => {
    expect(party.deals.length).toBeGreaterThanOrEqual(3);
  });

  it('каждая строка листа = ScoreDelta соответствующей раздачи', () => {
    const sheet = buildSheet(party);
    expect(sheet.rows).toHaveLength(party.deals.length);

    party.deals.forEach((deal, i) => {
      const row = sheet.rows[i]!;
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

  it('пуля и гора в каждой строке неотрицательны (§А.3 п.2)', () => {
    for (const row of buildSheet(party).rows) {
      expect(row.pool.every((v) => v >= 0)).toBe(true);
      expect(row.mountain.every((v) => v >= 0)).toBe(true);
    }
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
    let party = createParty();
    // Два распаса подряд
    party = recordDeal(party, {
      kind: 'raspasy', tricks: { '0': 3, '1': 4, '2': 3 }, consecutiveIndex: 0,
    });
    expect(party.consecutiveRaspasy).toBe(1);
    party = recordDeal(party, {
      kind: 'raspasy', tricks: { '0': 2, '1': 5, '2': 3 }, consecutiveIndex: 1,
    });
    expect(party.consecutiveRaspasy).toBe(2);
    // Сыгранная раздача сбрасывает
    party = recordDeal(party, {
      kind: 'contract', contract: '6S', declarer: '0',
      tricks: { '0': 7, '1': 2, '2': 1 },
      whisted: { '0': false, '1': true, '2': false }, mode: 'dark',
    });
    expect(party.consecutiveRaspasy).toBe(0);
  });

  it('сдающий меняется по кругу после каждой раздачи', () => {
    let party = createParty();
    const dealers = [party.dealer];
    for (const outcome of SAMPLE_OUTCOMES.slice(0, 3)) {
      party = recordDeal(party, outcome);
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

    const party = buildParty(SAMPLE_OUTCOMES);
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

  it('nextDealer вращает 0→1→2→0', () => {
    expect(nextDealer(0)).toBe(1);
    expect(nextDealer(1)).toBe(2);
    expect(nextDealer(2)).toBe(0);
  });
});
