# Аудит кодовой базы: игровая логика vs журнал/подсчёт

> Контекст: приложение для Преферанса (конвенция «Сочи», 3 игрока).
> Цель — оставить только функциональность журнала (пульки), убрав игровую логику.

## Обозначения категорий

| Категория      | Смысл |
|----------------|-------|
| `game_logic`   | Раздача карт, ходы, торговля, определение взяток, AI-бот, игровой цикл |
| `journal`      | Запись результатов, подсчёт очков/пульки, история партий, ввод имён, таблица счёта |
| `shared`       | UI-каркас, навигация, хранение данных, настройки, точка входа |

---

## 1. Модуль `src/core/` — `game_logic`

Ядро правил: карты, колода, раздача, розыгрыш. Чистые функции, никакого UI.

| Файл | Категория | Назначение |
|------|-----------|------------|
| `cards.ts` | game_logic | Карты, ранги, масти, колода 32 карты, каноническая сортировка |
| `contract.ts` | game_logic | Контракты (6♠…10БК + мизер), шкала торговли, стоимость игры, вистовые обязательства |
| `deal.ts` | game_logic | Раздача карт (5 кругов по 2 + прикуп), роли рук, ротация сдающего |
| `play.ts` | game_logic | Розыгрыш: взятки, легальные ходы, победитель взятки, иммутабельные переходы |
| `shuffle.ts` | game_logic | Детерминированный ГПСЧ (FNV-1a + mulberry32), Фишер–Йетс перемешивание по seed |
| `serialize.ts` | game_logic | Сериализация/десериализация состояния розыгрыша (JSON-снимок) |
| `index.ts` | game_logic | Реэкспорт публичного API ядра |
| `README.md` | game_logic | Документация модуля |

**Тесты:** `__tests__/cards.test.ts`, `contract.test.ts`, `deal.test.ts`, `invariants.test.ts`, `play.test.ts`, `rules-cases.test.ts`, `serialize.test.ts`, `shuffle.test.ts`

---

## 2. Модуль `src/engine/` — `game_logic`

Конечный автомат одной раздачи: фазы DEAL→BIDDING→…→PLAY→RESULT. Обрабатывает команды игроков, генерирует события.

| Файл | Категория | Назначение |
|------|-----------|------------|
| `engine.ts` | game_logic | Главный dispatch: обработка команд, переходы между фазами |
| `types.ts` | game_logic | Типы: Phase, DealState, Command, EngineEvent, EngineError |
| `bidding.ts` | game_logic | Торговля: заявки, «здесь», пас, правила §3 |
| `outcome.ts` | game_logic | Результат раздачи — контракт данных DealOutcome (связь с scoring) |
| `whist.ts` | game_logic | Вистовые заявки, режим обороны (тёмная/светлая), раскрытие карт |
| `widow.ts` | game_logic | Прикуп, снос, окончательный заказ контракта |
| `index.ts` | game_logic | Реэкспорт публичного API движка |
| `README.md` | game_logic | Документация модуля |

**Тесты:** `__tests__/bidding.test.ts`, `integration.test.ts`, `lifecycle.test.ts`, `play-phase.test.ts`, `whist.test.ts`, `widow.test.ts`, `scenarios.ts`, `golden-deals.json`

---

## 3. Модуль `src/bot/` — `game_logic`

AI-бот: оценка руки, стратегия торговли/сноса/виста, эвристики розыгрыша, Monte-Carlo поиск.

| Файл | Категория | Назначение |
|------|-----------|------------|
| `bot.ts` | game_logic | Главная функция бота: (DealState, seat) → Command; уровни easy/normal/hard |
| `evaluate.ts` | game_logic | Оценка руки: сила масти, ожидаемые взятки, риск мизера |
| `bidding.ts` | game_logic | Стратегия торговли: выбор заявки по оценке руки |
| `discard.ts` | game_logic | Стратегия сноса: выбор двух карт под контракт/мизер |
| `play.ts` | game_logic | Эвристики хода: по целям «брать»/«не брать»/«ловить» |
| `whist.ts` | game_logic | Решение обороны: вистовать или пас, режим всветлую/втёмную |
| `search.ts` | game_logic | Monte-Carlo поиск: детерминизация невидимых рук, симуляция |
| `match.ts` | game_logic | Каркас матча ботов (для fuzz-тестов и бенчмарков) |
| `index.ts` | game_logic | Реэкспорт публичного API бота |
| `README.md` | game_logic | Документация модуля |

**Тесты:** `__tests__/acceptance.test.ts`, `bidding.test.ts`, `bot.test.ts`, `discard.test.ts`, `evaluate.test.ts`, `play.test.ts`, `search.test.ts`, `whist.test.ts`

---

## 4. Модуль `src/scoring/` — `journal`

Расчёт очков: пуля, гора, висты. Полностью автономный модуль — **не импортирует ничего из `core`, `engine`, `bot`, `game` или `ui`**. Определяет собственные типы (`PlayerId = string`, `ContractId`, `DealOutcome`).

| Файл | Категория | Назначение |
|------|-----------|------------|
| `types.ts` | journal | Публичные типы: PlayerId, ContractId, DealOutcome, ScoreDelta, Scoreboard |
| `config.ts` | journal | Реестр правил расчёта (§10), таблицы стоимости, вариативные параметры |
| `delta.ts` | journal | Сборка ScoreDelta[] с нормализацией (§А.3) |
| `scoreboard.ts` | journal | Табло партии (пуля, гора, висты), итоговая роспись §9.9 |
| `contract.ts` | journal | Расчёт игры на взятки: пуля, гора, висты, ремизы (§9.3–§9.6) |
| `raspasy.ts` | journal | Расчёт распасов: прогрессия, штрафные взятки, премия за 0 (§8.3–§8.5) |
| `american-help.ts` | journal | «Американская помощь»: пуля закрыта → очки уходят сопернику (§9.8) |
| `index.ts` | journal | Реэкспорт публичного API расчёта |

**Тесты:** `__tests__/american-help.test.ts`, `contract-made.test.ts`, `contract-remise.test.ts`, `finalize.test.ts`, `helpers.ts`, `miser.test.ts`, `options.test.ts`, `party.test.ts`, `raspasy.test.ts`

---

## 5. Модуль `src/game/` — смешанный

Оркестрация: связывает engine, bot и scoring в единый игровой цикл.

| Файл | Категория | Назначение |
|------|-----------|------------|
| `party.ts` | journal | Слой партии: ведёт пульку, записывает результаты, строит лист (Sheet), сохранение в localStorage |
| `flow.ts` | game_logic | Продвижение раздачи: автоматический проброс служебных фаз (DEAL→BIDDING, PASSOUT→PLAY) |
| `bot.ts` | game_logic | Адаптер бота для партии: кэш экземпляров, parseBotLevel, уровни сложности |
| `session.ts` | shared | Контроллер: создание/восстановление сессии, отправка команд, цикл ботов, запись раздачи |

**Тесты:** `__tests__/sheet.test.ts` (journal), `bot-wiring.test.ts` (game_logic)

---

## 6. Модуль `src/ui/` — `shared`

Отрисовка: чистые функции (состояние → HTMLElement). Правил не содержит.

| Файл | Категория | Назначение |
|------|-----------|------------|
| `actions.ts` | shared | Панели действий человека: торговля, снос, вист, итог раздачи |
| `render.ts` | shared | Отрисовка стола, руки, листа записи (пульки), истории ходов |
| `styles.css` | shared | Стили приложения |
| `README.md` | shared | Документация модуля |

**Тесты:** `__tests__/dist-e2e.test.ts`, `ui-e2e.test.ts`

---

## 7. Точка входа

| Файл | Категория | Назначение |
|------|-----------|------------|
| `src/main.ts` | shared | Точка входа UI: вход/выход сессии, клик по картам, цикл ботов, перерисовка |

---

## 8. Корневые файлы проекта

| Файл | Категория | Назначение |
|------|-----------|------------|
| `index.html` | shared | HTML-каркас: заголовок, диалог правил, контейнер #app |
| `package.json` | shared | Зависимости: vite, vitest, typescript — всё dev-only |
| `tsconfig.json` | shared | Конфигурация TypeScript |
| `vite.config.ts` | shared | Конфигурация Vite (сборщик) |
| `vitest.config.ts` | shared | Конфигурация Vitest (тесты) |
| `README.md` | shared | Описание проекта |
| `CHANGELOG.md` | shared | Журнал изменений |
| `LICENSE` | shared | Лицензия MIT |
| `.gitignore` | shared | Игнорируемые файлы |
| `.release-please-manifest.json` | shared | Версия для release-please |
| `release-please-config.json` | shared | Конфигурация release-please |

---

## 9. Скрипты и вспомогательные файлы

| Файл | Категория | Назначение |
|------|-----------|------------|
| `scripts/check-price-consistency.ts` | journal | Проверка согласованности цен в scoring и core |
| `scripts/check-scoring-contract.ts` | journal | Проверка расчёта контрактов |
| `scripts/check_spec_coverage.py` | shared | Проверка покрытия спецификации тестами |
| `scripts/find-discard-seed.ts` | game_logic | Поиск seed для фазы сноса |
| `scripts/find-raspasy-seed.ts` | game_logic | Поиск seed для распасов |
| `scripts/find-seeds.ts` | game_logic | Поиск seed'ов для конкретных сценариев |
| `scripts/make-golden.ts` | game_logic | Генерация golden-снимков раздач |
| `scripts/mutation_check.py` | shared | Мутационное тестирование |
| `scripts/mutation_check_bot.py` | game_logic | Мутационное тестирование бота |
| `scripts/mutation_check_engine.py` | game_logic | Мутационное тестирование движка |
| `scripts/verify_sources.py` | shared | Верификация исходников |
| `docs/rules.md` | shared | Правила Преферанса (§1–§10, приложения) |
| `public/docs/rules.md` | shared | Копия правил для раздачи из UI |

---

## 10. Зависимости journal-компонентов от game_logic

### `src/scoring/` → ничего

Модуль `scoring` **полностью автономен**. Не импортирует ни из `core`, ни из `engine`, ни из `bot`. Определяет собственные типы. Это ключевое для выделения: модуль можно использовать как есть, подавая ему данные вручную.

### `src/game/party.ts` (journal) → game_logic

| Импорт | Откуда | Зачем |
|--------|--------|-------|
| `nextDealer` | `core/deal` | Ротация сдающего после каждой раздачи |
| `PlayerId` (тип) | `core/deal` | Типизация мест за столом (0, 1, 2) |
| `createDeal` | `engine/engine` | Создание новой раздачи (`startDeal`) |
| `DealOutcome` (тип) | `engine/outcome` | Приём результата раздачи от движка |
| `DealState` (тип) | `engine/types` | Типизация состояния раздачи |
| `BotLevel`, `DEFAULT_BOT_LEVEL`, `parseBotLevel` | `game/bot` | Уровень сложности ботов |

> **Вывод:** для журнала-без-игры из `party.ts` нужно убрать `startDeal` (он создаёт раздачу через engine) и заменить `DealOutcome` движка на собственный тип ввода. Функция `nextDealer` тривиальна (одна строка: `(dealer + 1) % 3`). Зависимость от `BotLevel` исчезает вместе с ботами.

### `src/game/session.ts` (shared) → game_logic

Сессия — контроллер всего приложения. Импортирует из engine (Command, DealState, EngineEvent), game/bot (decide, resetBots), game/flow (settle, step). Без game_logic сессию нужно переписать: останется только запись результатов, ввод имён и лист.

---

## 11. Сводка по категориям

| Категория | Файлов (без тестов) | Модули |
|-----------|---------------------|--------|
| `game_logic` | 22 | `core/*`, `engine/*`, `bot/*`, `game/flow.ts`, `game/bot.ts` |
| `journal` | 9 | `scoring/*`, `game/party.ts` |
| `shared` | 12 | `ui/*`, `main.ts`, `game/session.ts`, корневые конфигурации |
| `unknown` | 0 | — |

---

## 12. Рекомендация для выделения журнала

Журнал (пулька) требует:
1. **`src/scoring/`** целиком — автономный, готов к использованию.
2. **`src/game/party.ts`** — ведение партии и лист записи, но с удалением зависимости от `engine.createDeal` и `game/bot`. Функции `recordDeal`, `buildSheet`, `saveParty/loadParty` сохраняются. Нужен новый механизм ввода `DealOutcome` (из UI вместо engine).
3. **Новый UI** — экраны для: ввода имён игроков, ручного ввода результата раздачи (контракт, взятки, вист/пас), отображения пульки.
4. **Удалить:** `core/`, `engine/`, `bot/`, `game/flow.ts`, `game/bot.ts`. Из `session.ts` — логику ботов и команд.
