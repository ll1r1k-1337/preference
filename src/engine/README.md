# `@preference/engine` — движок раздачи

Оркестрация полного цикла раздачи преферанса: от сдачи до `DealOutcome`,
готового для модуля `scoring`. Поверх ядра `src/core` (карты, правила хода,
состояние розыгрыша) движок добавляет **фазы, торговлю, прикуп/снос, вист
и формирование результата**.

**Источник истины по правилам:** [`docs/rules.md`](../../docs/rules.md)
(`rules-v1`, конвенция «Сочи», 3 игрока). При расхождении кода и документа
прав документ.

Модуль не зависит ни от UI, ни от модуля расчёта очков: единственная точка
связи со `scoring` — структура `DealOutcome` (приложение А.3).

## Конечный автомат фаз

```
DEAL ──START_BIDDING──▶ BIDDING ──┬─ три паса ──▶ PASSOUT ──START_PLAY──▶ PLAY ──▶ RESULT
                                  │
                                  └─ торговля выиграна ──▶ WIDOW_PICKUP
                                       │ TAKE_WIDOW
                                       ▼
                                     DISCARD ──DISCARD──▶ FINAL_CONTRACT
                                       │ DECLARE_CONTRACT
                                       ▼
                              WHIST_DECLARATION ──┬─ вистует хоть один ──▶ PLAY ──▶ RESULT
                                                  └─ оба спасовали ─────▶ RESULT («на своих»)
```

Мизер — частный случай ветки контракта: после `DECLARE_CONTRACT` фаза
`WHIST_DECLARATION` **проскакивается**, оборона обязательно раскрывает карты
и раздача сразу переходит в `PLAY` (§7.4, TS-24).

## Командный интерфейс

Каждый шаг — команда игрока с валидацией. `dispatch` **никогда не бросает**
на игровых ошибках: он возвращает размеченный результат.

```ts
import { createDeal, dispatch } from './src/engine/index.js';

let state = createDeal({ seed: 'game-42', dealer: 0 });

const result = dispatch(state, { type: 'START_BIDDING', player: 0 });
if (result.ok) {
  state = result.state;          // новое состояние
  console.log(result.events);    // журнал: PHASE_CHANGED, BID_MADE, TRICK_TAKEN…
} else {
  console.error(result.error.code, result.error.message);  // например ILLEGAL_BID
}
```

`expectOk(result)` разворачивает успешный результат и бросает на отказе —
удобно в тестах и скриптах, где отказ означает ошибку сценария.

### Команды

| Команда | Фаза | Что делает |
|---|---|---|
| `START_BIDDING` | `DEAL` | сдающий открывает торговлю; заявляет первая рука (§3.1) |
| `BID` | `BIDDING` | значащая заявка; проверка §3.3 и §3.7 |
| `HERE` | `BIDDING` | «здесь» — перебить равной заявкой со старшей руки (§3.6) |
| `PASS` | `BIDDING` | пас; спасовавший выбывает окончательно (§3.4) |
| `TAKE_WIDOW` | `WIDOW_PICKUP` | игрок берёт прикуп — 12 карт (§4.2) |
| `DISCARD` | `DISCARD` | снос ровно двух карт из руки (§4.2, TS-12) |
| `DECLARE_CONTRACT` | `FINAL_CONTRACT` | окончательный заказ не ниже заявки (§4.3) |
| `WHIST` | `WHIST_DECLARATION` | вист; `mode: 'light'` — «в светлую» (§5.2) |
| `PASS_WHIST` | `WHIST_DECLARATION` | пас соперника (§4.4) |
| `START_PLAY` | `PASSOUT` | начать розыгрыш распасов (§8.1) |
| `PLAY_CARD` | `PLAY` | ход картой; легальность считает ядро (§6.2) |

### Коды отказа

`WRONG_PHASE`, `WRONG_ACTOR`, `ILLEGAL_BID`, `ILLEGAL_DISCARD`,
`ILLEGAL_CONTRACT`, `ILLEGAL_WHIST`, `ILLEGAL_MOVE`, `UNKNOWN_COMMAND`.

Текст ошибки человекочитаемый и ссылается на параграф правил, например:
`Заявка 6S должна быть строго старше 6S по шкале (§3.3)`.

### События

`PHASE_CHANGED`, `BID_MADE`, `HERE_DECLARED`, `PASSED`, `BIDDING_WON`,
`PASSOUT_DECLARED`, `WIDOW_TAKEN`, `DISCARDED`, `CONTRACT_DECLARED`,
`WHIST_DECLARED`, `WHIST_PASSED`, `DEFENSE_MODE_SET`, `HANDS_REVEALED`,
`PLAYED_ON_OWN`, `CARD_PLAYED`, `TRICK_TAKEN`, `DEAL_FINISHED`.

## Состояние `DealState`

Иммутабельно и самодостаточно для UI — производных вычислений не требуется:

| Поле | Смысл |
|---|---|
| `phase`, `toAct` | текущая фаза и чей ход/заявка |
| `hands`, `widow`, `widowRevealed` | карты; в фазе `PLAY` синхронизированы с ядром |
| `bidding` | журнал заявок, активные участники, `legalBids`, `wonBid` |
| `declarer`, `contract`, `discard` | игрок, окончательный контракт, снесённые карты |
| `legalContracts` | допустимые заказы в фазе `FINAL_CONTRACT` |
| `whisted`, `whistObligation` | кто вистовал и обязательства обороны (§5.3) |
| `defenseMode`, `revealedHands`, `controlledBy` | втёмную/всветлую, раскрытые руки, кто кем ходит |
| `play`, `trumpSuit`, `legalMoves` | состояние розыгрыша ядра и допустимые ходы |
| `outcome` | `DealOutcome` после `RESULT` |

`legalBids`, `legalContracts` и `legalMoves` — готовые списки для подсветки
в UI: недопустимое действие невозможно даже отправить.

## Контракт с модулем расчёта

```ts
type DealOutcome =
  | { kind: 'contract'; contract: ContractId; declarer: PlayerId;
      tricks: Record<PlayerId, number>;        // сумма = 10
      whisted: Record<PlayerId, boolean>;      // только два соперника
      mode: 'dark' | 'light' }
  | { kind: 'miser'; declarer: PlayerId; declarerTricks: number }
  | { kind: 'raspasy'; tricks: Record<PlayerId, number>; consecutiveIndex: number };
```

Три тонких места, где ошибаются:

1. **Мизер отдаётся отдельной веткой `kind: 'miser'`** — модуль расчёта не
   должен выводить его из `contract: 'MIZER'` (§7.7).
2. **Игра «на своих»** (оба спасовали, §5.2/TS-37): розыгрыша не было, поэтому
   все 10 взяток записываются игроку. Так контракт заведомо сыгран, а оборона
   получает ноль зачётных взяток — это ровно то поведение, которое ждёт
   `scoreTrickContract`.
3. **`consecutiveIndex` считается с нуля** и передаётся снаружи через
   `createDeal({ consecutiveRaspasy })`: движок раздачи не знает истории партии,
   счётчик ведёт слой партии (§8.4, TS-29).

**Совместимость типов `PlayerId`.** У движка `PlayerId = 0 | 1 | 2` (место за
столом), у модуля `scoring` — `PlayerId = string` (модуль не навязывает формат
идентификатора игрока). При склейке слоёв ключи приводятся к строкам:

```ts
const toStr = <T>(rec: Record<number, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [String(k), v]));
```

Сквозная проверка `scripts/check-scoring-contract.ts` прогоняет все шесть
сценариев через настоящий `scoreDeal` и печатает полученные `ScoreDelta`.

## Что модуль намеренно НЕ делает

Подсчёт очков (пуля/гора/висты), ведение партии, ротация сдающего между
раздачами, боты и UI — вне движка. Ротация даётся ядром (`nextDealer`),
расчёт — модулем `scoring`.

## Проверка

```bash
npm install
npm test                                    # vitest run
npm run typecheck                           # tsc --noEmit
python scripts/mutation_check.py            # мутации правил хода (ядро)
python scripts/mutation_check_engine.py     # мутации правил фаз (движок)
npx tsx scripts/make-golden.ts              # пересобрать эталон интеграции
```

## Тесты

| Файл | Что покрывает |
|---|---|
| `lifecycle.test.ts` | сдача, переход `DEAL → BIDDING`, иммутабельность |
| `bidding.test.ts` | шкала, пас, «здесь», мизер, распасы — TS-01…TS-08 |
| `widow.test.ts` | прикуп, снос, окончательный заказ — TS-09…TS-12 |
| `whist.test.ts` | вист, режимы обороны, «на своих», мизер, обязательства |
| `play-phase.test.ts` | очерёдность, валидация ходов, взятки, `DealOutcome` |
| `integration.test.ts` | **шесть полных раздач с фиксированным seed** |

Шесть интеграционных сценариев (`__tests__/scenarios.ts`) — это обычная игра
(контракт сыгран), распасы, мизер (мизерист берёт взятки), вист втёмную,
недобор и игра «на своих». Каждый прогоняется целиком от сдачи до `RESULT`,
сверяется с эталоном `golden-deals.json` и проверяется на воспроизводимость:
двойной прогон обязан дать идентичный след ходов.
