#!/usr/bin/env bash
# Стабильный порядок ключей в messages/*.json: сортирует рекурсивно по алфавиту.
# Параллельные правки разных ключей перестают конфликтовать, когда строки всегда в одном порядке.
# Запускать из корня рабочей копии перед коммитом, если правили messages/*.json.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
python3 - "$root" <<'PY'
import json, sys, os

def sort_recursive(obj):
    if isinstance(obj, dict):
        return {k: sort_recursive(obj[k]) for k in sorted(obj.keys())}
    return obj

def is_sorted(obj):
    if isinstance(obj, dict):
        keys = list(obj.keys())
        if keys != sorted(keys): return False
        return all(is_sorted(v) for v in obj.values())
    return True

root = sys.argv[1]
changed = []
for name in sorted(os.listdir(os.path.join(root, 'messages'))):
    if not name.endswith('.json'): continue
    path = os.path.join(root, 'messages', name)
    with open(path) as f: data = json.load(f)
    if is_sorted(data):
        print(f'  {name}: уже отсортирован')
        continue
    sorted_data = sort_recursive(data)
    with open(path, 'w') as f:
        json.dump(sorted_data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    changed.append(name)
    print(f'  {name}: отсортирован')
if changed:
    print(f'Изменено: {", ".join(changed)} — добавьте в коммит (git add messages/)')
else:
    print('Все файлы уже отсортированы')
PY
