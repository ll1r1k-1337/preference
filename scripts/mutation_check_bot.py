"""Мутационная проверка бота: тесты обязаны падать при поломке его решений.

Каждая мутация точечно ломает одно правило принятия решений в src/bot
и должна быть поймана быстрыми тестами src/bot/__tests__ (без приёмочных:
они идут минутами, их прогоняет отдельный гейт).

Файлы читаются с newline='' и восстанавливаются байт-в-байт (Windows CRLF):
чтение по умолчанию схлопывает CRLF -> LF и «восстановление» переписало бы
каждую строку файла.
"""
import io
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MUTATIONS = [
    (
        "evaluate.ts",
        "§1.2: honor без верхнего соседа считается верной взяткой",
        "    if (contiguousFromTop) {\n      sure += 1;\n      return;\n    }",
        "    if (true) {\n      sure += 1;\n      return;\n    }",
    ),
    (
        "evaluate.ts",
        "§1.2: голому honor больше не нужно прикрытие",
        "    if (length >= index + 1) half += 1;",
        "    half += 1;",
    ),
    (
        "evaluate.ts",
        "козырная длина перестала давать бонус",
        "  return Math.max(0, trumpLength - 3) * 0.5;",
        "  return 0;",
    ),
    (
        "evaluate.ts",
        "§7: риск мизера всегда нулевой (любая рука «мизерная»)",
        "      if (ownBelow < missingBelow) risk += 1;",
        "      if (false) risk += 1;",
    ),
    (
        "bidding.ts",
        "§3.3: бот заявляет контракт выше возможностей руки",
        "    if (expectedTricks(input.hand, id, true) < level) continue;",
        "    if (false) continue;",
    ),
    (
        "bidding.ts",
        "§4.1: прикуп не учитывается в заявке (бот вечно пасует, партия — распасы)",
        "  return withWidow ? base + WIDOW_BONUS : base;",
        "  return base;",
    ),
    (
        "bidding.ts",
        "§3.7: мизер заявляется любой рукой",
        "      if (miserRisk(input.hand) <= MISER_RISK_THRESHOLD) return 'MIZER';",
        "      return 'MIZER';",
    ),
    (
        "bidding.ts",
        "§4.3: на равном уровне выбирается худший козырь вместо лучшего",
        "    if (level < bestLevel || (level === bestLevel && expected > bestExpected)) {",
        "    if (level < bestLevel || (level === bestLevel && expected < bestExpected)) {",
    ),
    (
        "discard.ts",
        "§4.2: козырь снова можно сносить",
        "  if (trump !== null && card.suit === trump) return 1000;",
        "  if (false) return 1000;",
    ),
    (
        "discard.ts",
        "§4.2: стопперы больше не сохраняются",
        "  if (isStopper) return 500 + rankOrder(card.rank);",
        "  if (false) return 500 + rankOrder(card.rank);",
    ),
    (
        "discard.ts",
        "§4.2: премия за ренонс отключена (снос по карте из разных мастей)",
        "        if (groups[a.suit].length === 2) score -= VOID_BONUS;",
        "        if (false) score -= VOID_BONUS;",
    ),
    (
        "discard.ts",
        "§7: на мизере сносятся не опасные, а безопасные карты",
        "    mizer ? -miserDanger(card, groups) : keepValue(card, groups, trump);",
        "    mizer ? miserDanger(card, groups) : keepValue(card, groups, trump);",
    ),
    (
        "whist.ts",
        "§5.3: обязательство обороны игнорируется — вистуют всегда",
        "  if (expected + MARGIN < required) return { whist: false };",
        "  if (false) return { whist: false };",
    ),
    (
        "whist.ts",
        "§5.3: норма не делится между двумя вистующими",
        "  const required = input.partnerWhisted ? obligation.perDefenderWhenTwo : obligation.total;",
        "  const required = obligation.total;",
    ),
    (
        "whist.ts",
        "§5.2: «всветлую» запрашивается и при вистующем партнёре",
        "    input.partnerWhisted ? { whist: true } : { whist: true, mode: 'light' };",
        "    { whist: true, mode: 'light' };",
    ),
    (
        "play.ts",
        "§6.3: взятка берётся максимальной картой вместо минимальной достаточной",
        "  if (beating.length > 0) return lowest(beating);",
        "  if (beating.length > 0) return highest(beating);",
    ),
    (
        "play.ts",
        "§8.1: на распасах бот заходит старшей картой",
        "    // Заход мелочью: чем ниже карта, тем меньше шансов остаться со взяткой.\n    return lowest(input.legal);",
        "    // Заход мелочью: чем ниже карта, тем меньше шансов остаться со взяткой.\n    return highest(input.legal);",
    ),
    (
        "play.ts",
        "§8.1: на распасах сбрасывается мелочь вместо старших карт",
        "  const safe = input.legal.filter((c) => !beatsCurrent(c, input));\n  // Сбрасываем самую ОПАСНУЮ из безопасных: избавляемся от старших карт,\n  // пока это ничего не стоит.\n  if (safe.length > 0) return highest(safe);",
        "  const safe = input.legal.filter((c) => !beatsCurrent(c, input));\n  // Сбрасываем самую ОПАСНУЮ из безопасных: избавляемся от старших карт,\n  // пока это ничего не стоит.\n  if (safe.length > 0) return lowest(safe);",
    ),
    (
        "play.ts",
        "§7: планка взятки не занижается, пока мизерист не сходил",
        "  if (targetYetToPlay) return lowest(input.legal);",
        "  if (targetYetToPlay) return highest(input.legal);",
    ),
    (
        "search.ts",
        "§6.2: сэмплирование игнорирует ренонсы соперников",
        "          (p === DEAD || !respectVoids || !input.voids[p as PlayerId].has(card.suit)),",
        "          (p === DEAD || true || !input.voids[p as PlayerId].has(card.suit)),",
    ),
    (
        "search.ts",
        "молчаливая недодача карт при сэмплировании больше не ловится",
        "  if (input.unseen.length < slotsTotal) {",
        "  if (false) {",
    ),
    (
        "bot.ts",
        "§4.2: бот подглядывает в чужой снос",
        "  if (seat === state.declarer) {\n    for (const id of state.discard) known.add(id);\n  }",
        "  if (true) {\n    for (const id of state.discard) known.add(id);\n  }",
    ),
    (
        "bot.ts",
        "§5.2: ответ партнёра читается из whisted вместо whist.decisions",
        "        (p) => p !== actor && state.whist?.decisions[p]?.whisted === true,",
        "        (p) => p !== actor && state.whisted[p] === true,",
    ),
    (
        "bot.ts",
        "§8.1: на распасах бот играет на взятие",
        "  if (state.contract === null) return 'avoid'; // распасы, §8.1",
        "  if (state.contract === null) return 'win'; // распасы, §8.1",
    ),
    (
        "bot.ts",
        "§7: мизерист играет на взятие, оборона его не ловит",
        "    return player === state.declarer ? 'avoid' : 'catch';",
        "    return 'win';",
    ),
]

# Быстрые тесты бота: приёмочные (минуты) в мутационный цикл не входят.
TEST_ARGS = [
    "npx.cmd",
    "vitest",
    "run",
    "src/bot/__tests__/evaluate.test.ts",
    "src/bot/__tests__/bidding.test.ts",
    "src/bot/__tests__/discard.test.ts",
    "src/bot/__tests__/whist.test.ts",
    "src/bot/__tests__/play.test.ts",
    "src/bot/__tests__/search.test.ts",
    "src/bot/__tests__/bot.test.ts",
    "--reporter=dot",
]


def run_tests() -> bool:
    """True, если быстрые тесты бота зелёные."""
    result = subprocess.run(
        TEST_ARGS,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode == 0


def main() -> int:
    failures = []

    baseline_ok = run_tests()
    print(f"baseline (src/bot): {'зелёные' if baseline_ok else 'КРАСНЫЕ'}")
    if not baseline_ok:
        print("Базовый прогон уже красный — мутационная проверка бессмысленна.")
        return 1

    for filename, description, old, new in MUTATIONS:
        path = ROOT / "src" / "bot" / filename
        with io.open(path, "r", encoding="utf-8", newline="") as fh:
            original = fh.read()

        crlf = "\r\n" in original
        needle = old.replace("\n", "\r\n") if crlf else old
        replacement = new.replace("\n", "\r\n") if crlf else new

        if needle not in original:
            failures.append(f"{filename}: не найден фрагмент для мутации «{description}»")
            print(f"[SKIP] {description}: фрагмент не найден")
            continue

        mutated = original.replace(needle, replacement, 1)
        with io.open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(mutated)

        try:
            caught = not run_tests()
        finally:
            with io.open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(original)
            with io.open(path, "r", encoding="utf-8", newline="") as fh:
                assert fh.read() == original, f"Файл {filename} не восстановлен байт-в-байт"

        status = "ПОЙМАНА" if caught else "НЕ ПОЙМАНА"
        print(f"[{status}] {filename}: {description}")
        if not caught:
            failures.append(f"{filename}: мутация «{description}» не поймана тестами")

    print()
    if failures:
        print(f"ПРОВАЛ: {len(failures)} из {len(MUTATIONS)} мутаций не пойманы")
        for item in failures:
            print(f"  - {item}")
        return 1

    print(f"OK: все {len(MUTATIONS)} мутаций пойманы тестами")
    return 0


if __name__ == "__main__":
    sys.exit(main())
