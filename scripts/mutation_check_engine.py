"""Мутационная проверка движка раздачи: тесты обязаны падать при поломке фаз.

Каждая мутация точечно ломает одно нормативное правило §3–§8 в src/engine
и должна быть поймана тестами src/engine/__tests__.

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
        "bidding.ts",
        "§3.3: заявка не обязана быть строго старше (принимается равная)",
        "  if (highest !== null && !isHigherContract(candidate, highest)) {",
        "  if (false && highest !== null && !isHigherContract(candidate, highest)) {",
    ),
    (
        "bidding.ts",
        "§3.7: мизер перестал быть кабальным",
        "  if (isMizer(candidate) && hasNamedContract(history, player)) {",
        "  if (false && isMizer(candidate) && hasNamedContract(history, player)) {",
    ),
    (
        "bidding.ts",
        "§3.6: «здесь» доступно и младшей руке",
        "  if (ROLE_RANK[handRole(player, dealer)] >= ROLE_RANK[handRole(state.highestBidder, dealer)]) {",
        "  if (false) {",
    ),
    (
        "bidding.ts",
        "§3.5: торговля завершается, пока активных участников двое",
        "  if (state.active.length === 1 && state.highestBid !== null && state.highestBidder !== null) {",
        "  if (state.active.length <= 2 && state.highestBid !== null && state.highestBidder !== null) {",
    ),
    (
        "widow.ts",
        "§4.2: снос не проверяет количество карт",
        "  if (ids.length !== 2) {",
        "  if (false) {",
    ),
    (
        "widow.ts",
        "§4.2: снос принимает карту не из руки",
        "    if (!handIds.has(id)) {",
        "    if (false) {",
    ),
    (
        "widow.ts",
        "§4.3: окончательный заказ может быть ниже выигравшей заявки",
        "  if (!isAllowedFinalContract(candidate, won)) {",
        "  if (false) {",
    ),
    (
        "widow.ts",
        "§4.3: мизер перестал быть кабальным на окончательном заказе",
        "  if (isMizer(won) && !isMizer(candidate)) {",
        "  if (false) {",
    ),
    (
        "whist.ts",
        "§5.2: при двух вистующих разрешён вист всветлую",
        "  if (mode === 'light' && someoneElseWhisted) {",
        "  if (false) {",
    ),
    (
        "whist.ts",
        "§7.4: мизер разыгрывается втёмную",
        "  if (isMizer(contract)) return 'light';",
        "  if (isMizer(contract)) return 'dark';",
    ),
    (
        "whist.ts",
        "§5.2: при висте всветлую вистующий не ходит за пасовавшего",
        "  if (mode === 'light' && whisters.length === 1) {",
        "  if (false) {",
    ),
    (
        "whist.ts",
        "§5.3: единственный вистующий отвечает не за всю норму обороны",
        "    result[whisters[0] as PlayerId] = obligation.total;",
        "    result[whisters[0] as PlayerId] = obligation.perDefenderWhenTwo;",
    ),
    (
        "engine.ts",
        "§4.4: игра «на своих» не распознаётся — розыгрыш всё равно начинается",
        "  if (!someoneWhisted) {",
        "  if (false) {",
    ),
    (
        "engine.ts",
        "§2.4/§5.2: ходом управляет владелец карт, а не вистующий всветлую",
        "      const controller = state.controlledBy[owner] ?? owner;",
        "      const controller = owner;",
    ),
]


def run_tests() -> bool:
    """True, если тесты движка зелёные."""
    result = subprocess.run(
        ["npx.cmd", "vitest", "run", "src/engine", "--reporter=dot"],
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
    print(f"baseline (src/engine): {'зелёные' if baseline_ok else 'КРАСНЫЕ'}")
    if not baseline_ok:
        print("Базовый прогон уже красный — мутационная проверка бессмысленна.")
        return 1

    for filename, description, old, new in MUTATIONS:
        path = ROOT / "src" / "engine" / filename
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
