"""Аудит покрытия сценариев спецификации TS-01..TS-45 тестами репозитория."""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

spec = open(os.path.join(ROOT, "docs", "rules.md"), encoding="utf-8").read()
spec_ids = sorted(set(re.findall(r"TS-\d+", spec)), key=lambda s: int(s[3:]))

src_ids = set()
per_module = {}
for dp, dn, fn in os.walk(os.path.join(ROOT, "src")):
    for f in fn:
        if not f.endswith(".ts"):
            continue
        p = os.path.join(dp, f)
        found = set(re.findall(r"TS-\d+", open(p, encoding="utf-8").read()))
        if found:
            rel = os.path.relpath(p, ROOT).replace(os.sep, "/")
            mod = rel.split("/")[1]
            per_module.setdefault(mod, set()).update(found)
            src_ids |= found

print("сценариев в спецификации:", len(spec_ids))
print("упомянуто в исходниках:  ", len(src_ids))
missing = [i for i in spec_ids if i not in src_ids]
print("НЕ ПОКРЫТО:", missing if missing else "нет — все сценарии упомянуты")
print()
for mod in sorted(per_module):
    ids = sorted(per_module[mod], key=lambda s: int(s[3:]))
    print(f"  {mod:9s} {len(ids):3d}: {', '.join(ids)}")
