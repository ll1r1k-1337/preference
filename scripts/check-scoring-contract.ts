/**
 * Проверка совместимости: DealOutcome движка подаётся в реальный модуль
 * scoring из соседнего воркспейса (задача t_24a2173a) без адаптеров.
 * Вспомогательный скрипт, в тестовый прогон не входит.
 */
import { SCENARIOS, runScenario } from '../src/engine/__tests__/scenarios.js';
// Модуль расчёта лежит в воркспейсе задачи t_24a2173a.
import { scoreDeal } from '../../t_24a2173a/src/scoring/index.js';

const options = { players: ['0', '1', '2'] } as never;

for (const scenario of SCENARIOS) {
  const run = runScenario(scenario.name);
  const outcome = run.state.outcome;
  if (outcome === null) throw new Error(`${scenario.name}: нет outcome`);

  // PlayerId движка — 0|1|2, у scoring — строковый; ключи приводим к строкам.
  const toStr = (rec: Record<number, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(rec).map(([k, v]) => [String(k), v]));

  const adapted =
    outcome.kind === 'miser'
      ? { ...outcome, declarer: String(outcome.declarer) }
      : outcome.kind === 'raspasy'
        ? { ...outcome, tricks: toStr(outcome.tricks as Record<number, number>) }
        : {
            ...outcome,
            declarer: String(outcome.declarer),
            tricks: toStr(outcome.tricks as Record<number, number>),
            whisted: toStr(outcome.whisted as Record<number, boolean>),
          };

  const deltas = scoreDeal(adapted as never, options);
  const sumPool = deltas.reduce((s: number, d: { pool: number }) => s + d.pool, 0);
  const sumMountain = deltas.reduce((s: number, d: { mountain: number }) => s + d.mountain, 0);
  console.log(
    `${scenario.name.padEnd(16)} kind=${outcome.kind.padEnd(9)} ` +
      `пуля=${sumPool} гора=${sumMountain} deltas=${JSON.stringify(deltas)}`,
  );
}
console.log('\nOK: все шесть DealOutcome приняты модулем scoring без ошибок');
