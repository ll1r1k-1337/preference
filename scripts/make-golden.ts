/**
 * Генерация эталона `golden-deals.json` из фактических прогонов сценариев.
 * Запуск: npx vitest run src/engine/__tests__/make-golden.ts --config vitest.tools.config.ts
 * (обычным `npm test` не подхватывается — файл не *.test.ts).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, runScenario } from '../src/engine/__tests__/scenarios.js';

const golden: Record<string, unknown> = {};
const report: string[] = [];

for (const scenario of SCENARIOS) {
  const run = runScenario(scenario.name);
  golden[scenario.name] = run.state.outcome;
  report.push(
    [
      scenario.name.padEnd(16),
      `phase=${run.state.phase}`,
      `contract=${String(run.state.contract)}`,
      `declarer=${String(run.state.declarer)}`,
      `tricks=${JSON.stringify(run.tricks)}`,
      `outcome=${JSON.stringify(run.state.outcome)}`,
    ].join('  '),
  );
}

const target = fileURLToPath(new URL('../src/engine/__tests__/golden-deals.json', import.meta.url));
writeFileSync(target, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');

console.log(report.join('\n'));
console.log(`\nЭталон записан: ${target}`);
