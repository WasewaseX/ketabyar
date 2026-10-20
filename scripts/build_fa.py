# -*- coding: utf-8 -*-
"""Builds src/i18n/fa.json from the 4 translation parts, mirroring en.json structure."""
import json, sys
sys.path.insert(0, '/home/z/my-project/ketabyar/scripts')
from fa_part1 import PART1
from fa_part2 import PART2
from fa_part3 import PART3
from fa_part4 import PART4

FA = {}
for p in (PART1, PART2, PART3, PART4):
    FA.update(p)

en = json.load(open('/home/z/my-project/ketabyar/src/i18n/en.json', encoding='utf-8'))

FA_QUOTES = [
    {"text": "دانش جست‌وجو می‌شود، خود به سراغ تو نمی‌آید", "source": "امام مالک بن انس"},
    {"text": "اتاقی بدون کتاب، بدنی بدون جان است", "source": "شیشرون"},
    {"text": "مرکب عالم از خون شهید پاکیزه‌تر است", "source": "حدیث نبوی"},
    {"text": "آن که می‌خواند، پیش از مرگ هزار زندگی می‌کند", "source": "جرج آر. آر. مارتین"},
    {"text": "هیچ دوستی وفادارتر از کتاب نیست", "source": "ارنست همینگوی"},
    {"text": "دانش نوری است که خداوند در دل می‌افکند", "source": "امام شافعی"},
    {"text": "خواندن، گفت‌وگو با فرهیخته‌ترین ذهن‌هاست", "source": "رنه دکارت"},
    {"text": "کتاب‌ها بسیارند و وقت کم", "source": "فرانک زاپا"},
    {"text": "کتابخانه، گنجینهٔ درمان‌های جان است", "source": "کتیبهٔ کهن"},
    {"text": "هر کس بر راهی در پی دانش رود، خداوند راه بهشت را بر او هموار کند", "source": "حدیث نبوی"},
]

missing = []
def walk(node, prefix=''):
    out = {}
    for k, v in node.items():
        path = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            out[k] = walk(v, path)
        elif k == 'dailyQuotes' and isinstance(v, list):
            out[k] = FA_QUOTES
        else:
            if path in FA:
                out[k] = FA[path]
            elif isinstance(v, str):
                missing.append(path)
                out[k] = v  # fallback to English for now
            else:
                out[k] = v
    return out

fa = walk(en)

# extra keys the Persian edition adds (not present in en.json)
fa.setdefault('commandPalette', {}).setdefault('actions', {})
fa['commandPalette']['actions']['langFa'] = FA['commandPalette.actions.langFa']
fa['commandPalette']['actions']['langFaSub'] = FA['commandPalette.actions.langFaSub']
fa.setdefault('languages', {})['persian'] = FA['languages.persian']

json.dump(fa, open('/home/z/my-project/ketabyar/src/i18n/fa.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

def count(d):
    n = 0
    for v in d.values():
        n += count(v) if isinstance(v, dict) else 1
    return n

print('fa.json written | total keys:', count(fa))
print('MISSING (falling back to English):', len(missing))
for m in missing[:80]:
    print('  -', m)
