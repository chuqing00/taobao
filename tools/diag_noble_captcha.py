
import asyncio
import json
import re
import time
from urllib.parse import urlparse, parse_qs

import noble_tls
from noble_tls import Session, Client

# 复用 send.py 的纯函数（加密/签名/bx-ua 生成）。import 会创建 curl_cffi session，无害。
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import send as S

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

BASE_HEADERS = {
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent': UA,
    'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="124", "Chromium";v="124"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
}


def set_cookie(ns, name, value, domain='.taobao.com', path='/'):
    ns.cookies.set(name, value, domain=domain, path=path)


async def noble_get_token(ns):
    """对标 send.get_token，但用 noble-tls 请求"""
    data = {
        "jsv": "2.7.2",
        "appKey": "12574478",
        "t": int(time.time() * 1000),
        "api": "mtop.taobao.pc.growth.p4p.shop.query",
        "v": "1.0",
        "timeout": "10000",
        "type": "jsonp",
        "dataType": "jsonp",
        "callback": "mtopjsonp1",
        "data": {
            "linkUrl": f"https://uland.taobao.com/sem/tbsearch?keyword={S.SEARCH_KEYWORD}&localImgKey=&page=1&q={S.SEARCH_KEYWORD}&tab=all"
        }
    }
    r = await ns.get(
        "https://h5api.m.taobao.com/h5/mtop.taobao.pc.growth.p4p.shop.query/1.0/",
        params=data, timeout=15)
    token = None
    for c in r.cookies:
        if c.name == '_m_h5_tk':
            token = c.value.split('_')[0]
            set_cookie(ns, '_m_h5_tk', c.value)
        elif c.name == '_m_h5_tk_enc':
            set_cookie(ns, '_m_h5_tk_enc', c.value)
    if not token:
        tok = ns.cookies.get('_m_h5_tk')
        if tok:
            token = tok.split('_')[0]
    return token


async def main():
    ns = Session(client=Client.CHROME_124)
    ns.headers.update(BASE_HEADERS)

    # 1. 拿 cna
    print('[diag] 获取 cna ...')
    r = await ns.get('https://log.mmstat.com/eg.js', timeout=15)
    cna = ns.cookies.get('cna')
    if not cna:
        for c in r.cookies:
            if c.name == 'cna':
                cna = c.value
    set_cookie(ns, 'cna', cna or '')
    print(f'[diag] cna={cna}')

    # 2. mtop_partitioned_detect
    set_cookie(ns, 'mtop_partitioned_detect', '1')

    # 3. isg（execjs）
    isg = S.get_isg()
    set_cookie(ns, 'isg', isg or '')
    print(f'[diag] isg={isg[:30] if isg else "N/A"}...')

    # 4. tfstk（execjs）
    tfstk = S.get_tfstk()
    set_cookie(ns, 'tfstk', tfstk or '')
    print(f'[diag] tfstk={tfstk[:30] if tfstk else "N/A"}...')

    # 5. umid / bx-ua（阿里bx 补环境）
    S.get_umid()
    bx_ua = S._bx_ua or ''
    bx_umidtoken = S._bx_umidtoken or ''
    if bx_umidtoken:
        set_cookie(ns, '_umid', bx_umidtoken)
        set_cookie(ns, 'umidToken', bx_umidtoken)
    print(f'[diag] bx-ua len={len(bx_ua)}, umid={bx_umidtoken[:20] if bx_umidtoken else "N/A"}...')

    # 6. token
    print('[diag] 获取 token ...')
    token = await noble_get_token(ns)
    print(f'[diag] token={token}')

    # 7. 组装第1页请求并发送
    print('[diag] 请求第1页 ...')
    _, data_json = S.assemble_params("placeholder", 0, cna, page=1)
    sign, sign_t, _ = S.get_sign(token, data_json)
    qp, data_json = S.assemble_params(sign, sign_t, cna, page=1)

    req_headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if bx_ua and 'default' not in bx_ua.lower():
        req_headers['bx-ua'] = bx_ua

    r = await ns.post(
        S.API_URL, params=qp, data={"data": data_json},
        headers=req_headers, timeout=15)
    text = r.text
    print(f'[diag] 第1页长度={len(text)}, 前100={text[:100]}')

    if 'FAIL_SYS_USER_VALIDATE' not in text:
        print('[diag] 第1页未触发风控（可能直接返回数据），检查 text:', text[:300])
        await ns.close()
        return

    # 8. 提取 punish URL
    m = re.search(r'mtopjsonp\d+\((?P<data>.*)\)', text, re.S)
    punish_url = None
    if m:
        parsed = json.loads(m.group("data"))
        punish_url = parsed.get("data", {}).get("url", "")
        punish_url = punish_url.strip('`')
    print(f'[diag] punish_url={punish_url[:100] if punish_url else "N/A"}...')

    # 9. 请求 punish 页面，提取 token + SECDATA
    print('[diag] 请求 punish 页面 ...')
    r = await ns.get(punish_url, timeout=15)
    html = r.text
    print(f'[diag] punish len={len(html)}, 响应头 keys={list(r.headers.keys())}')
    cfg = S.extract_x5sec_config(html)
    if not cfg:
        print('[diag] 无法提取 punish 配置')
        await ns.close()
        return
    nctoken = cfg.get('NCTOKENSTR', '')
    appkey = cfg.get('NCAPPKEY', '')
    secdata = cfg.get('SECDATA', '')
    print(f'[diag] token={nctoken}, appKey={appkey}')

    # 10. 用 punish URL 上下文重新生成 bx-ua
    S._bx_ua = None
    S._bx_umidtoken = None
    S.get_umid(context_url=punish_url)
    bx_ua = S._bx_ua or ''
    bx_umidtoken = S._bx_umidtoken or ''
    print(f'[diag] 新 bx-ua len={len(bx_ua)}, umid={bx_umidtoken[:20] if bx_umidtoken else "N/A"}...')

    # 11. 请求 newslidecaptcha（对标 solve_x5sec 的 captcha 请求）
    import random
    v_val = str(random.random()).replace('.', '')
    captcha_url = f"https://h5api.m.taobao.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/_____tmd_____/newslidecaptcha"
    captcha_params = {
        'token': nctoken,
        'appKey': appkey,
        'x5secdata': secdata,
        'v': v_val,
        'extra': '',
    }
    captcha_headers = {
        'Referer': punish_url,
        'Origin': 'https://h5api.m.taobao.com',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': UA,
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="124", "Chromium";v="124"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
    }
    if bx_ua and 'default' not in bx_ua.lower():
        captcha_headers['bx-ua'] = bx_ua
    if bx_umidtoken and 'default' not in bx_umidtoken.lower():
        captcha_headers['bx-umidtoken'] = bx_umidtoken

    print('[diag] 请求 newslidecaptcha ...')
    r = await ns.get(captcha_url, params=captcha_params, headers=captcha_headers, timeout=15)
    body = r.text
    print(f'[diag] captcha 响应: {body[:500]}')

    if '"from bx"' in body or ('304' in body and 'bx' in body):
        print('\n[结论] noble-tls 仍被 bx 拦截（304 from bx）=> 根因不是 TLS 指纹，而是 bx-ua 设备指纹或 IP 信誉')
    elif 'encryptToken' in body or '"data"' in body:
        print('\n[结论] noble-tls 成功获取题目 => TLS 指纹是根因，可切换到 noble-tls')
    else:
        print('\n[结论] 返回了其它内容，需人工分析：' + body[:300])

    await ns.close()


if __name__ == '__main__':
    asyncio.run(main())