import re, json, os
html = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'captcha', 'punish_page.html'), encoding='utf-8').read()
idx = html.find('window._config_ =')
print('idx', idx)
idx2 = html.find('{', idx)
depth = 0
ins = False
esc = False
cfg = None
for i in range(idx2, len(html)):
    c = html[i]
    if esc:
        esc = False
        continue
    if c == '\\':
        esc = True
        continue
    if c == '"' and not esc:
        ins = not ins
        continue
    if ins:
        continue
    if c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            js = html[idx2:i + 1]
            try:
                cfg = json.loads(js)
            except Exception as e:
                print('JSON err', e)
            break
if cfg:
    print('--- KEYS ---')
    for k in sorted(cfg.keys()):
        v = cfg[k]
        if isinstance(v, str):
            print(f"{k}: {v[:120]}")
        else:
            print(f"{k}: {v}")
