/**
 * Независимая сверка ЦЕН КОНТРАКТОВ между тремя представлениями:
 *  1) таблица §А.1 в docs/rules.md (нормативный текст),
 *  2) src/core/contract.ts — gamePrice ядра (используется движком и ботом),
 *  3) src/scoring/config.ts — gamePrice расчёта (используется листом записи).
 *
 * Два модуля пришли из РАЗНЫХ задач и хранят цену независимо. Если таблицы
 * разойдутся, лист записи молча начнёт считать не по тем правилам, по которым
 * играет движок, и ни один существующий тест этого не увидит: каждый модуль
 * самосогласован.
 *
 * Заодно сверяется bidOrder ядра со шкалой А.1 — порядок старшинства заявок.
 */
import { readFileSync } from 'node:fs';
import { bidOrder, gamePrice as corePrice, parseContract } from '../src/core/index.js';
import { gamePrice as scoringPrice } from '../src/scoring/index.js';

const rules = readFileSync('docs/rules.md', 'utf8');

interface Row {
  readonly id: string;
  readonly bidOrder: number;
  readonly price: number;
}

// Строки таблицы А.1: | 6 пик | `6S` | 6 | ♠ | 1 | 2 | 2 | 2 | 2 |
const rows: Row[] = [];
for (const line of rules.split('\n')) {
  // Строка мизера выделена жирным (**16**, **10**) — звёздочки убираем.
  const cells = line.split('|').map((c) => c.trim().replace(/\*\*/g, ''));
  if (cells.length < 10) continue;
  const code = /^`([0-9]{1,2}(?:S|C|D|H|NT)|MIZER)`$/.exec(cells[2] ?? '');
  if (code === null) continue;
  const order = Number(cells[5]);
  const price = Number(cells[6]);
  if (!Number.isFinite(order) || !Number.isFinite(price)) continue;
  rows.push({ id: code[1]!, bidOrder: order, price });
}

console.log(`строк таблицы А.1 разобрано: ${rows.length}`);
if (rows.length < 26) {
  console.log('НЕ УДАЛОСЬ разобрать таблицу А.1 целиком — проверка не состоялась');
  process.exit(2);
}

let mismatches = 0;
const report = (what: string, id: string, ...vals: unknown[]): void => {
  mismatches += 1;
  console.log(`  РАСХОЖДЕНИЕ ${what} ${id}: ${vals.join(' ')}`);
};

for (const row of rows) {
  const contract = parseContract(row.id);

  // bidOrder: шкала старшинства заявок (мизер тоже участвует).
  const order = bidOrder(contract);
  if (order !== row.bidOrder) report('bidOrder', row.id, `docs=${row.bidOrder}`, `core=${order}`);

  // Цена игры: у мизера своя ветка расчёта, в общей таблице цен её нет.
  if (row.id === 'MIZER') continue;
  const core = corePrice(contract);
  const scoring = scoringPrice(row.id as Parameters<typeof scoringPrice>[0]);
  if (core !== row.price || scoring !== row.price) {
    report('цена', row.id, `docs=${row.price}`, `core=${core}`, `scoring=${scoring}`);
  }
}

if (mismatches > 0) {
  console.log(`ПРОВАЛ: расхождений ${mismatches}`);
  process.exit(1);
}
console.log(`OK: bidOrder и цены всех ${rows.length} контрактов совпадают в docs / core / scoring`);
