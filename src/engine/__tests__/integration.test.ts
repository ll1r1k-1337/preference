/**
 * Интеграция: полные раздачи от сдачи до DealResult с фиксированным seed.
 * Покрывает шесть нормативных сценариев: обычная игра, распасы, мизер,
 * вист втёмную, недобор (ремиз игрока) и игра «на своих».
 * Источник истины: docs/rules.md §2–§9, приложение А.3.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCENARIOS, runScenario } from './scenarios.js';
import type { ScenarioName } from './scenarios.js';

const GOLDEN = JSON.parse(
  readFileSync(fileURLToPath(new URL('./golden-deals.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

describe('интеграция: полный цикл раздачи (acceptance)', () => {
  it('сценариев не меньше шести и они покрывают требуемые типы раздач', () => {
    const names = SCENARIOS.map((s) => s.name);

    expect(names).toEqual([
      'обычная игра',
      'распасы',
      'мизер',
      'вист втёмную',
      'недобор',
      'на своих',
    ]);
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  it.each(SCENARIOS.map((s) => [s.name] as const))(
    'сценарий «%s»: раздача доходит до RESULT с корректным DealResult',
    (name) => {
      const run = runScenario(name as ScenarioName);

      expect(run.state.phase).toBe('RESULT');
      expect(run.state.outcome).not.toBeNull();
      expect(run.state.toAct).toBeNull();

      // Взяток ровно 10 и они распределены между тремя игроками (приложение А.3).
      const tricks = run.tricks;
      expect(tricks[0] + tricks[1] + tricks[2]).toBe(10);
      for (const p of [0, 1, 2] as const) {
        expect(tricks[p]).toBeGreaterThanOrEqual(0);
        expect(tricks[p]).toBeLessThanOrEqual(10);
      }
    },
  );

  it.each(SCENARIOS.map((s) => [s.name] as const))(
    'сценарий «%s»: результат воспроизводим по seed',
    (name) => {
      const a = runScenario(name as ScenarioName);
      const b = runScenario(name as ScenarioName);

      expect(b.state.outcome).toEqual(a.state.outcome);
      expect(b.trace).toEqual(a.trace);
    },
  );

  it.each(SCENARIOS.map((s) => [s.name] as const))(
    'сценарий «%s»: DealResult совпадает с эталоном',
    (name) => {
      const run = runScenario(name as ScenarioName);

      expect(run.state.outcome).toEqual(GOLDEN[name]);
    },
  );

  it('обычная игра: контракт СЫГРАН — взяток не меньше заказа (§9.3)', () => {
    const run = runScenario('обычная игра');

    expect(run.state.outcome).toMatchObject({
      kind: 'contract',
      contract: '6S',
      declarer: run.state.declarer,
      whisted: { 0: true, 2: true },
      mode: 'dark',
    });
    expect(run.state.play?.completedTricks).toHaveLength(10);
    // Контракт выполнен: взяток разыгрывающего >= уровня контракта.
    expect(run.tricks[run.state.declarer!]).toBeGreaterThanOrEqual(6);
  });

  it('распасы: игрока нет, прикуп вскрывался в первых двух взятках (§8.2)', () => {
    const run = runScenario('распасы');

    expect(run.state.declarer).toBeNull();
    expect(run.state.contract).toBeNull();
    expect(run.state.outcome).toMatchObject({ kind: 'raspasy', consecutiveIndex: 0 });

    const tricks = run.state.play!.completedTricks;
    expect(tricks[0]?.widowCard).toEqual(run.state.widow[0]);
    expect(tricks[1]?.widowCard).toEqual(run.state.widow[1]);
    expect(tricks[2]?.widowCard).toBeNull();
    // §8.2 п.3: третьей взяткой первой ходит первая рука независимо от победителя второй.
    expect(tricks[2]?.leader).toBe(run.state.firstHand);
  });

  it('мизер: outcome вида miser, карты обороны раскрыты, козыря нет (§7)', () => {
    const run = runScenario('мизер');

    expect(run.state.contract).toBe('MIZER');
    expect(run.state.defenseMode).toBe('light');
    expect(run.state.revealedHands).toEqual([0, 2]);
    expect(run.state.trumpSuit).toBeNull();
    expect(run.state.outcome).toMatchObject({ kind: 'miser', declarer: run.state.declarer });
    // Мизерист взял взятки — недобор по §7.7 виден в DealResult.
    if (run.state.outcome?.kind !== 'miser') throw new Error('ожидался miser');
    expect(run.state.outcome.declarerTricks).toBeGreaterThan(0);
    expect(run.state.outcome.declarerTricks).toBe(run.tricks[run.state.declarer!]);
  });

  it('вист втёмную: карты обороны закрыты, каждый ходит своими (§5.2)', () => {
    const run = runScenario('вист втёмную');

    expect(run.state.defenseMode).toBe('dark');
    expect(run.state.revealedHands).toEqual([]);
    expect(run.state.controlledBy).toEqual({ 0: 0, 1: 1, 2: 2 });
    expect(run.state.outcome).toMatchObject({ mode: 'dark', whisted: { 0: true, 2: true } });
  });

  it('недобор: игрок взял меньше заказанного — ремиз (§9.5)', () => {
    const run = runScenario('недобор');

    const declarer = run.state.declarer!;
    const level = Number(String(run.state.contract).replace(/[A-Z]+$/, ''));
    expect(run.tricks[declarer]).toBeLessThan(level);
    expect(run.state.outcome).toMatchObject({ kind: 'contract', declarer });
  });

  it('на своих: розыгрыша не было, оба соперника спасовали (§5.2, TS-37)', () => {
    const run = runScenario('на своих');
    const declarer = run.state.declarer!;
    const defenders = [0, 1, 2].filter((p) => p !== declarer) as (0 | 1 | 2)[];

    expect(run.state.play).toBeNull();
    for (const d of defenders) {
      expect(run.state.whisted[d]).toBe(false);
    }
    expect(run.state.outcome).toMatchObject({ kind: 'contract', declarer });
    if (run.state.outcome?.kind !== 'contract') throw new Error('ожидался contract');
    expect(run.state.outcome.whisted).toEqual({ [defenders[0]!]: false, [defenders[1]!]: false });
    expect(run.tricks[declarer]).toBe(10);
  });

  it('во всех сценариях сыграны ровно 30 разных карт (или розыгрыша не было)', () => {
    for (const scenario of SCENARIOS) {
      const run = runScenario(scenario.name);
      if (run.state.play === null) continue;

      const played = run.state.play.completedTricks.flatMap((t) => t.plays.map((p) => `${p.card.rank}${p.card.suit}`));
      expect(played).toHaveLength(30);
      expect(new Set(played).size).toBe(30);
    }
  });
});
