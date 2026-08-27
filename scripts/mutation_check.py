"""Мутационная проверка: тесты обязаны падать при поломке нормативных правил.

Каждая мутация точечно ломает одно правило §6 и должна быть поймана тестами.
Файлы читаются с newline='' и восстанавливаются байт-в-байт (Windows CRLF).
"""
import io
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MUTATIONS = [
    (
        "play.ts",
        "обязанность ходить в масть отключена",
        "  const inSuit = hand.filter((c) => c.suit === led);\n  if (inSuit.length > 0) return inSuit;",
        "  const inSuit = hand.filter((c) => c.suit === led);\n  if (inSuit.length > 0) return hand;",
    ),
    (
        "play.ts",
        "обязанность козырять отключена",
        "    const trumps = hand.filter((c) => c.suit === trump);\n    if (trumps.length > 0) return trumps;",
        "    const trumps = hand.filter((c) => c.suit === trump);\n    if (trumps.length > 0) return hand;",
    ),
    (
        "play.ts",
        "введена обязанность бить старшей (mustOvertake = on)",
        "  const inSuit = hand.filter((c) => c.suit === led);\n  if (inSuit.length > 0) return inSuit;",
        "  const inSuit = hand.filter((c) => c.suit === led);\n  if (inSuit.length > 0) return [inSuit[inSuit.length - 1] as Card];",
    ),
    (
        "play.ts",
        "козырь перестал бить масть хода",
        "  if (trumpSuit !== null) {\n    const trumps = plays.filter((p) => p.card.suit === trumpSuit);",
        "  if (false && trumpSuit !== null) {\n    const trumps = plays.filter((p) => p.card.suit === trumpSuit);",
    ),
    (
        "play.ts",
        "взятку берёт младшая карта масти хода",
        "  return inSuit.reduce((best, p) =>\n    rankOrder(p.card.rank) > rankOrder(best.card.rank) ? p : best,\n  ).player;",
        "  return inSuit.reduce((best, p) =>\n    rankOrder(p.card.rank) < rankOrder(best.card.rank) ? p : best,\n  ).player;",
    ),
    (
        "play.ts",
        "распасы: третьей взяткой ходит победитель второй, а не первая рука",
        "  if (trickNumber <= 3 || previousWinner === null) return firstHand(dealer);",
        "  if (trickNumber <= 2 || previousWinner === null) return firstHand(dealer);",
    ),
    (
        "deal.ts",
        "прикуп откладывается первой парой карт",
        "  dealRound(); // круг 1 — карты 1..6\n  dealRound(); // круг 2 — карты 7..12\n  widow.push(...take(WIDOW_SIZE)); // прикуп — карты 13..14",
        "  widow.push(...take(WIDOW_SIZE)); // прикуп — карты 1..2\n  dealRound(); // круг 1\n  dealRound(); // круг 2",
    ),
    (
        "contract.ts",
        "мизер сдвинут в шкале торговли",
        "  if (contract.kind === 'mizer') return 16;",
        "  if (contract.kind === 'mizer') return 21;",
    ),
    (
        "contract.ts",
        "уровни 9-10 не сдвинуты вставкой мизера",
        "  return contract.level >= 9 ? base + 1 : base;",
        "  return base;",
    ),
]


def run_tests() -> bool:
    """True, если тесты зелёные."""
    result = subprocess.run(
        # Мутации ломают правила ЯДРА — гоняем тесты, которые их проверяют.
        # Полный прогон сюда тянуть нельзя: приёмка dist/ работает по собранному
        # бандлу и на мутацию исходников не реагирует, а стоит ~9 с на прогон.
        ["npx.cmd", "vitest", "run", "src/core", "src/engine", "src/game", "--reporter=dot"],
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
    print(f"baseline: {'зелёные' if baseline_ok else 'КРАСНЫЕ'}")
    if not baseline_ok:
        print("Базовый прогон уже красный — мутационная проверка бессмысленна.")
        return 1

    for filename, description, old, new in MUTATIONS:
        path = ROOT / "src" / "core" / filename
        with io.open(path, "r", encoding="utf-8", newline="") as fh:
            original = fh.read()

        needle = old.replace("\n", "\r\n") if "\r\n" in original else old
        replacement = new.replace("\n", "\r\n") if "\r\n" in original else new

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
