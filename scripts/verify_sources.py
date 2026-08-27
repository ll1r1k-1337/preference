"""Сверка src/core, src/engine, src/scoring с эталонными воркспейсами.

Мутационный скрипт был убит на середине прогона; он мог оставить
изменённый исходник. Эталон — воркспейсы t_7665ed90 / t_7ea02876,
которые побайтово совпадали между собой на старте интеграции.
"""
import hashlib
import os

ROOT = r"C:/Users/Huawei/AppData/Local/hermes/kanban/boards/preference/workspaces"
MINE = os.path.join(ROOT, "t_d4b78b86")
REF = os.path.join(ROOT, "t_7ea02876")  # содержит core+engine+scoring+bot


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


bad = []
checked = 0
for base in ("src/core", "src/engine", "src/scoring", "src/bot"):
    ref_dir = os.path.join(REF, base)
    for dp, dn, fn in os.walk(ref_dir):
        for f in fn:
            rp = os.path.join(dp, f)
            rel = os.path.relpath(rp, REF).replace(os.sep, "/")
            mp = os.path.join(MINE, rel)
            if not os.path.exists(mp):
                bad.append(("ОТСУТСТВУЕТ", rel))
                continue
            checked += 1
            if sha(rp) != sha(mp):
                bad.append(("ОТЛИЧАЕТСЯ", rel))

print("сверено файлов:", checked)
if not bad:
    print("OK: все исходники совпадают с эталоном")
else:
    for kind, rel in bad:
        print(f"  {kind}: {rel}")
