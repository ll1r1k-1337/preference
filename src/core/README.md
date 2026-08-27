# `@preference/core` — ядро преферанса

Чистая логика преферанса без UI: колода, детерминированная раздача, прикуп,
контракты, иммутабельное состояние розыгрыша, правила хода и сериализация.

**Источник истины по правилам:** [`docs/rules.md`](../../docs/rules.md) (`rules-v1`,
конвенция «Сочи», 3 игрока). Каждая функция снабжена ссылкой на параграф спецификации;
при расхождении кода и `docs/rules.md` прав документ.

Модуль не зависит ни от UI, ни от модуля расчёта очков. Все переходы состояния
иммутабельны: функции возвращают новое состояние, вход не мутируется.

## Установка и проверка

```bash
npm install
npm test          # vitest run
npm run typecheck # tsc --noEmit
python scripts/mutation_check.py   # мутационная проверка нормативных правил
```

## Быстрый старт

```ts
import {
  dealCards,
  createPlay,
  legalMoves,
  applyMove,
  isTerminal,
  parseContract,
  trickCounts,
} from './src/core/index.js';

// 1. Сдача по seed — воспроизводима.
const dealt = dealCards({ seed: 'game-42', dealer: 0 });
//   dealt.hands[0..2] — по 10 карт, dealt.widow — 2 карты прикупа,
//   dealt.firstHand — кто начинает торговлю.

// 2. Розыгрыш контракта.
let state = createPlay({
  mode: { kind: 'contract', contract: parseContract('7H'), declarer: 1 },
  dealer: 0,
  hands: dealt.hands,
});

// 3. Цикл ходов.
while (!isTerminal(state)) {
  const moves = legalMoves(state);      // только легальные карты
  state = applyMove(state, moves[0]!);  // новое состояние
}

console.log(trickCounts(state)); // { 0: n0, 1: n1, 2: n2 }, сумма = 10
```

## Структура

| Файл | Содержимое | Разделы правил |
|---|---|---|
| `cards.ts` | ранги, масти, `CardId`, каноническая колода 32 карты | §1 |
| `shuffle.ts` | детерминированный ГПСЧ и seed-перемешивание | — |
| `contract.ts` | шкала `bidOrder` 1..26, стоимость игры, вистовые обязательства | §3.2, §4.3, §5.3, §9.2, А.1 |
| `deal.ts` | роли рук, порядок сдачи, прикуп, ротация сдающего | §2 |
| `play.ts` | состояние розыгрыша, `legalMoves`, `trickWinner`, `applyMove` | §6, §7, §8.2 |
| `serialize.ts` | снимок состояния в JSON и обратно | — |
| `index.ts` | публичный барель-экспорт | — |

## Публичный API

### Карты (`cards.ts`, §1)

| Сигнатура | Назначение |
|---|---|
| `RANKS: readonly Rank[]` | `['7','8','9','T','J','Q','K','A']`, от младшего к старшему |
| `SUITS: readonly Suit[]` | `['S','C','D','H']` — пики, трефы, бубны, черви |
| `NO_TRUMP: 'NT'` | псевдо-масть «без козыря» (только торговля) |
| `rankOrder(rank): number` | сила ранга 0..7 |
| `suitOrder(suit): number` | сила масти в торговле 0..4 (`NT` = 4) |
| `makeCard(rank, suit): Card` | конструктор карты |
| `cardId(card): CardId` | `AS`, `TH`, `7C` (§1.4) |
| `parseCard(id): Card` | разбор; бросает на некорректном формате |
| `parseCards(ids): Card[]` | разбор списка |
| `compareCards(a, b): number` | канонический порядок: `suitOrder`, затем `rankOrder` |
| `sortCards(cards): Card[]` | копия в каноническом порядке (вход не мутируется) |
| `sameCard(a, b): boolean` | равенство по значению |
| `createDeck(): Card[]` | новая колода 32 карты в каноническом порядке |

Каноническая сортировка **нормативна** — от неё зависит воспроизводимость seed-раздач.

### Перемешивание (`shuffle.ts`)

| Сигнатура | Назначение |
|---|---|
| `createRng(seed): Rng` | детерминированный ГПСЧ (`nextUint32`, `nextFloat`, `nextInt`) |
| `shuffled(cards, seed): Card[]` | перестановка Фишера–Йетса; вход не мутируется |
| `shuffleDeck(seed): Card[]` | перемешанная колода 32 карты |

`Seed` — строка или число. Одинаковый seed всегда даёт одинаковый результат;
`Math.random` не используется нигде.

### Контракты (`contract.ts`, §3.2, §9.2)

| Сигнатура | Назначение |
|---|---|
| `MIZER: Contract` | мизер как значение |
| `makeContract(level, suit): Contract` | контракт на взятки, `level ∈ 6..10`, `suit ∈ S,C,D,H,NT` |
| `parseContract(id): Contract` | `'6S'…'10NT'`, `'MIZER'` |
| `contractId(contract): ContractId` | обратное преобразование |
| `contractLevel(contract): Level \| null` | уровень; `null` для мизера |
| `contractTrump(contract): Suit \| null` | **козырь; `null` для БК и мизера** — это значение идёт в правила хода |
| `bidOrder(contract): number` | позиция на шкале 1..26; мизер = 16 |
| `compareContracts(a, b): number` | сравнение по шкале |
| `isHigherContract(candidate, current): boolean` | правило повышения §3.3 |
| `isAllowedFinalContract(candidate, won): boolean` | окончательный заказ §4.3 (мизер кабальный) |
| `gamePrice(contract): number` | 6→2, 7→4, 8→6, 9→8, 10→10, мизер→10 |
| `whistObligation(contract)` | `{ total, perDefenderWhenTwo }` по §5.3 |
| `ALL_CONTRACTS` | все 26 контрактов по возрастанию `bidOrder` |

Шкала: `6♠…8БК` (1..15) → `МИЗЕР` (16) → `9♠…10БК` (17..26). Стоимость игры
не зависит от масти козыря.

### Раздача (`deal.ts`, §2)

| Сигнатура | Назначение |
|---|---|
| `PLAYERS: readonly PlayerId[]` | `[0, 1, 2]`, нумерация по часовой стрелке |
| `firstHand(dealer)` / `secondHand` / `thirdHand` | роли рук; первая рука = `(dealer+1) % 3` |
| `handRole(player, dealer): 'first'\|'second'\|'third'` | старшинство руки в торговле |
| `handOrder(dealer): PlayerId[]` | порядок заявок и сдачи |
| `playerAfter(player): PlayerId` | следующий по часовой стрелке |
| `nextDealer(dealer): PlayerId` | ротация сдающего (`dealerRotation = sliding`) |
| `dealCards({ seed, dealer }): DealtCards` | перемешать по seed и сдать |
| `dealFromDeck(deck, dealer): DealtCards` | сдать из готовой колоды |

`DealtCards = { hands, widow, dealer, firstHand }`: по 10 карт каждому
(в канонической сортировке) + 2 карты прикупа.

**Порядок сдачи нормативен (§2.3):** 2 круга по 2 карты → **прикуп (карты №13 и №14)**
→ ещё 3 круга по 2 карты. Прикуп не откладывается первой или последней парой.

### Розыгрыш (`play.ts`, §6, §7, §8.2)

```ts
type PlayMode =
  | { kind: 'contract'; contract: Contract; declarer: PlayerId }
  | { kind: 'raspasy'; widow: readonly [Card, Card] };
```

| Сигнатура | Назначение |
|---|---|
| `createPlay(input): PlayState` | состояние розыгрыша; проверяет дубли карт |
| `legalMoves(state): readonly Card[]` | допустимые ходы игрока `state.toPlay` |
| `legalMoveIds(state): string[]` | то же в виде `CardId` — для UI и ботов |
| `isLegalMove(state, card): boolean` | предикат легальности |
| `applyMove(state, card): PlayState` | **новое** состояние; нелегальный ход бросает ошибку |
| `trickWinner(plays, trump, ledOverride?): PlayerId \| null` | победитель взятки |
| `isTerminal(state): boolean` | карт не осталось (§6.4) |
| `trickCounts(state)` / `totalTricks(state)` | взятки по игрокам / сумма |
| `currentTrumpSuit(state)` / `currentLedSuit(state)` / `currentTrickNumber(state)` | текущий контекст |
| `isMizerPlay(state)` / `isRaspasyPlay(state)` | предикаты режима |

`PlayState` содержит `mode`, `dealer`, `hands`, `leader`, `toPlay`, `currentTrick`,
`completedTricks`, `tricksWon`, `revealedWidowCard`.

**Алгоритм `legalMoves` (§6.2) — нормативный:**

```
первый ход во взятке          -> любая карта (в т.ч. козырь)
есть карты масти хода         -> только они        (бить старшей НЕ обязан)
козырный контракт и есть козыри -> только козыри   (обязанность козырять)
иначе                         -> любая карта       (снос)
```

Три места, где обычно ошибаются:

1. **`mustOvertake = off`** — обязанности бить старшей картой нет: под `KS` легальна `9S`.
2. Ветка «обязан козырять» **не срабатывает** на БК, мизере и распасах — козыря там нет.
3. Первый ход во взятке ничем не ограничен, включая выход с козыря.

**`trickWinner` (§6.3):** есть козыри — старший козырь; иначе старшая карта масти хода.
Карты не в масть и не козырные во взятии не участвуют никогда.

**Распасы (§8.2):** первые две взятки открывают карту прикупа — она **задаёт масть хода,
но взяток не берёт**; если масть прикупа не положил никто, взятку берёт ходивший первым.
Первые три взятки заходит первая рука, с четвёртой — взявший предыдущую.

### Сериализация (`serialize.ts`)

| Сигнатура | Назначение |
|---|---|
| `serializePlayState(state): PlayStateSnapshot` | снимок из строк и чисел |
| `deserializePlayState(snapshot): PlayState` | восстановление с валидацией |
| `toJson(state): string` / `fromJson(json): PlayState` | работа со строкой JSON |
| `SNAPSHOT_VERSION` | версия формата (`1`) |

Карты кодируются как `CardId`, контракты — как `ContractId`. При восстановлении
сверяются `toPlay` и `tricksWon`: несогласованный снимок отвергается с ошибкой.

## Что модуль намеренно НЕ делает

Оркестрация раздачи (фазы `DEAL → BIDDING → … → RESULT`), сбор заявок, снос,
объявление виста и подсчёт очков — вне ядра. Ядро даёт правила и состояние;
контракт с модулем расчёта (`DealOutcome`, приложение А.3) формирует движок раздачи.

## Тесты

`npm test` — 161 тест в 8 файлах:

| Файл | Что покрывает |
|---|---|
| `cards.test.ts` | ранги, масти, `CardId`, каноническая колода |
| `shuffle.test.ts` | детерминизм ГПСЧ, перестановочность перемешивания |
| `contract.test.ts` | вся таблица `bidOrder` 1..26, сравнение, цены, обязательства |
| `deal.test.ts` | нормативный порядок сдачи, позиция прикупа, роли рук |
| `play.test.ts` | правила хода, взятие, переходы, распасы |
| `serialize.test.ts` | round-trip, валидация битых снимков |
| `rules-cases.test.ts` | **табличные acceptance-кейсы: 19 legalMoves + 16 trickWinner = 35 ≥ 30** |
| `invariants.test.ts` | fuzz: 300 случайных раздач, инварианты §6 и §8.2 |

Нормативные сценарии `docs/rules.md`, реализованные как тесты: TS-01, TS-05, TS-06,
TS-08, TS-09, TS-10, TS-11, TS-13…TS-21.

`scripts/mutation_check.py` ломает по одному нормативному правилу (обязанность в масть,
козыряние, старшинство во взятке, позиция прикупа, место мизера в шкале) и проверяет,
что тесты это ловят. Файлы восстанавливаются байт-в-байт.
