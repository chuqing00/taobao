import asyncio
import base64
import csv
import json
import os
import re
import secrets
import subprocess
import threading
import time
import execjs
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from curl_cffi.requests import AsyncSession

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SIGN_DIR = os.path.join(BASE_DIR, "sign")
FINGERPRINT_DIR = os.path.join(BASE_DIR, "fingerprint")
CAPTCHA_DIR = os.path.join(BASE_DIR, "captcha")
DATA_DIR = os.path.join(BASE_DIR, "./data")
os.chdir(BASE_DIR)  # 统一工作目录，保证 execjs 子进程的相对/绝对路径一致

# ===== 阿里bx 补环境路径配置 =====
_ALI_BX_DIR = os.path.join(BASE_DIR, "./登录模块/阿里bx")
_GEN_BX_PARAMS_JS = os.path.join(_ALI_BX_DIR, "gen_bx_params.js")
_RUN_BX_UA_JS = os.path.join(_ALI_BX_DIR, "run_bx_ua_local.js")
_UMID_GENERATOR_JS = os.path.join(FINGERPRINT_DIR, "umid_generator.js")

# ===== noble-tls 作为备选 TLS 库（支持自定义 JA3/JA4/HTTP2 SETTINGS） =====
_noble_tls_available = False
try:
    import noble_tls
    _noble_tls_available = True
except ImportError:
    print("[noble-tls] 未安装，使用 curl_cffi 作为唯一 TLS 后端")

# ===== tls_client 作为第二备选 TLS 库（支持 chrome_120 JA3 指纹） =====
import sys
sys.path.insert(0, os.path.join(BASE_DIR, 'libs'))
_tls_client_available = False
try:
    from tls_client import Session as TlsSession
    _tls_client_available = True
except ImportError:
    pass


START_PAGE = 1  # 起始页
END_PAGE = 6  # 结束页
MAX_CONCURRENCY = 10  # 同时并发的关键词数量上限

call_n = 1

# API URL
API_URL = 'https://h5api.m.taobao.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/'

# 设备指纹（bx-ua / umidToken）：全项目共享一套，只生成一次，省去每个关键词约 60s 初始化
_bx_ua = None
_bx_umidtoken = None
_fp_lock = None  # 指纹生成锁（事件循环内惰性创建）

_LOGIN_COOKIES = {
    "t": "38aaaeabd7471026fc7e6c7a6ccbf17a",
    "cna": "+1aPIj4BmHEBASQOBABfats4",
    "lgc": "tb361471598081",
    "_tb_token_": "ed166eb7b8fe1",
    "cookie2": "UIHiLt3xD8xYTw%3D%3D",  # 从 uc1 的 cookie15 提取
    "unb": "2220821864222",
    "cookie17": "URm48syIZx9a",  # 从 uc1 的 cookie21 提取
    "_nk_": "tb361471598081",
    "sg": "12c",
    "csg": "9f4e3dfa",
    "uc1": "cookie15=UIHiLt3xD8xYTw%3D%3D&cookie14=UoYWNYDF8xeb0A%3D%3D&cookie21=URm48syIZx9a&existShop=false",
    "munb": "2220821864222",
    "3PcFlag": "1788362552556",
    "tracknick": "tb361471598081",
    "dnk": "tb361471598081",
    "existShop": "MTc4ODEzODAwNw%3D%3D",
    "aui": "2220821864222",
    "xlly_s": "1",
    "thw": "xx",
    "ockeqeudmj": "nj8mZis%3D",
    "_w_tb_nick": "tb361471598081",
    "WAPFDFDTGFG": "%2B4cMKKP%2B8PI%2BKK8dV5G5dN8kBIb7CKcRpQ%3D%3D",
    "_w_app_lg": "0",
    "last_slid_taobao_taobao_h5": "E864B97DA170F4C2E02B4A",
    "_cc_": "VT5L2FSpdA%3D%3D",
    "_l_g_": "Ug%3D%3D",
    "ntm": "1",
    "isg": "BIeH4rMqoYaazSa_ECS4UjtFFjtRjFtuxj1kMll145Y9yKKKbl6jv4mLboiWIDPm",
    "tfstk": "hRrnLdfO9_1zjOQOm4Y2ppW9-NIxQL2b3bKpzDPGE5Pbp4ezpPDzw565dDerZ7Vt17BIewaoq5PTJXP-vQjusfi-9kULrPVQ32BODiH4L6Y4te-raTlZUYIfCXwbdJiS4ddPkP7keAzKLbPr8fkZdf8y47uEbFlsFYREUHWgQfMr4QlrLGuZpYLyT7oPIRlsU0lza2WgQfMr4b77VJjGwqW2qBLQKUHsClDNNX9q6AMUjv034JlgJyhquuzLIJCHcRnIjSDY9G-3i8ybzVqk_sc7jRrUzROHYRLyrIw_YuIwGwBQhDy73FB5k9EaF8PwC9jVD834oSOhWiB3ryw4CI8bjiyLlSyfvT1Carqs0zRXyOq_q8y0qZCVniZLcOcvXagZNztOFX6GIEcS8AMEMOXMPUgECAcAIOY0F2ksLjC..",
}

# CSV 写入锁（多个关键词协程并发追加写同一文件）
_csv_lock = threading.Lock()


# ===== execjs 模块编译缓存（每个调用内部 spawn node，缓存 compile 结果以减少重复读文件） =====
_tfstk_js = None
_mtop_sign_js = None


def execjs_func(file_path):
    with open(file_path, mode='r', encoding='utf-8') as f:
        code = f.read()
    return execjs.compile(code)


def _get_tfstk_js():
    global _tfstk_js
    if _tfstk_js is None:
        _tfstk_js = execjs_func(os.path.join(SIGN_DIR, "tfstk_generator.js"))
    return _tfstk_js


def _get_mtop_sign_js():
    global _mtop_sign_js
    if _mtop_sign_js is None:
        _mtop_sign_js = execjs_func(os.path.join(SIGN_DIR, "mtop_sign_execjs.js"))
    return _mtop_sign_js



def get_bx_et(url):
    """生成 bx_et 指纹参数，降低风控触发概率"""
    js = _get_tfstk_js()
    return js.call("getEtSign", url)


def gen_isg():
    """生成 isg cookie 值"""
    js = execjs_func(os.path.join(SIGN_DIR, "isg_generator.js"))
    return js.call("genIsgFresh")


def gen_tfstk():
    """生成 tfstk cookie 值"""
    url = 'https://h5api.m.taobao.com/h5/mtop.taobao.trade.get/1.0/'
    js = execjs_func(os.path.join(SIGN_DIR, "tfstk_generator.js"))
    return js.call("getTfstk", url)


def gen_sign(token, data):
    """生成 mtop 签名，返回 (sign, timestamp, appKey)"""
    js = _get_mtop_sign_js()
    obj = js.call("getMtopSign", token, data)
    return obj["sign"], obj["timestamp"], obj["appKey"]


def get_bx_params_sync(context_url=None):
    """调用阿里bx 补环境 Node.js 脚本生成 bx-ua 和 bx-umidtoken（阻塞，只执行一次）

    通过 jsdom + canvas 补全浏览器环境（navigator/screen/WebGL/AudioContext/crypto等），
    调用 AWSC SDK (fireyejs.js) 生成与真实浏览器一致的设备指纹。
    """
    global _bx_ua, _bx_umidtoken
    if _bx_ua:
        return _bx_ua, _bx_umidtoken

    try:
        if context_url:
            parsed = urlparse(context_url)
            path_norm = re.sub(r'/+', '/', parsed.path)
            req_url = f"//{parsed.hostname}{path_norm}?{parsed.query}"
        else:
            req_url = f"//h5api.m.taobao.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/?jsv=2.7.2&appKey=12574478&t={int(time.time()*1000)}&api=mtop.relationrecommend.wirelessrecommend.recommend"

        result = subprocess.run(
            ["node", _GEN_BX_PARAMS_JS, "--json", "--url", req_url],
            capture_output=True, text=True, timeout=60,
            encoding='utf-8', errors='replace',
            cwd=_ALI_BX_DIR
        )

        stdout = result.stdout.strip()
        data = None
        try:
            data = json.loads(stdout)
        except json.JSONDecodeError:
            m = re.search(r'\{(?:[^{}]|\{[^{}]*\})*\}', stdout)
            if m:
                try:
                    data = json.loads(m.group(0))
                except json.JSONDecodeError:
                    pass

        if data and data.get('ok'):
            _bx_ua = data.get('bx-ua', '')
            _bx_umidtoken = data.get('bx-umidtoken', '')
            return _bx_ua, _bx_umidtoken

    except subprocess.TimeoutExpired:
        print(f"[bx-params] 超时（60s）")
    except Exception as e:
        print(f"[bx-params] 异常: {e}")
        import traceback
        traceback.print_exc()

    return None, None


def get_slide_token_sync(dist, context_url=None):
    """生成带行为轨迹的 fyToken（slidedata.n）。

    调用 run_bx_ua_local.js --record，在补环境 fireye SDK 中：
      1) fyObj.startRecord() 开启轨迹录制
      2) 派发 mousedown -> mousemove*N -> mouseup 合成滑块事件（距离=dist）
      3) fyObj.getFYToken(紫云 config) 产出带轨迹的 fyToken，即 slidedata 的 n 字段
    返回 {n, umidToken, bx_ua}；失败返回 None。
    """
    print(f"[slide-token] 生成带轨迹 fyToken（距离={dist}px）...")
    try:
        if context_url:
            parsed = urlparse(context_url)
            path_norm = re.sub(r'/+', '/', parsed.path)
            req_url = f"//{parsed.hostname}{path_norm}?{parsed.query}"
        else:
            req_url = f"//h5api.m.taobao.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/?jsv=2.7.2&appKey=12574478&t={int(time.time()*1000)}&api=mtop.relationrecommend.wirelessrecommend.recommend"

        result = subprocess.run(
            ["node", _RUN_BX_UA_JS, "--json", "--record", "--distance", str(int(dist)), "--url", req_url],
            capture_output=True, text=True, timeout=90,
            encoding='utf-8', errors='replace',
            cwd=_ALI_BX_DIR
        )
        stdout = result.stdout.strip()
        data = None
        try:
            data = json.loads(stdout)
        except json.JSONDecodeError:
            m = re.search(r'\{(?:[^{}]|\{[^{}]*\})*\}', stdout)
            if m:
                try:
                    data = json.loads(m.group(0))
                except json.JSONDecodeError:
                    pass

        slide = data.get('slide') if data else None
        if data and data.get('ok') and slide and slide.get('fyToken'):
            token = {
                'n': slide.get('fyToken', ''),
                'umidToken': data.get('bx-umidtoken', ''),
                'bx_ua': data.get('bx-ua', ''),
            }
            print(f"[slide-token] n 长度={len(token['n'])}, umidToken 长度={len(token['umidToken'])}")
            return token

        print(f"[slide-token] 生成失败")
        if result.stdout:
            print(f"[slide-token] stdout: {result.stdout[:300]}")
        if result.stderr:
            print(f"[slide-token] stderr: {result.stderr[:300]}")
    except subprocess.TimeoutExpired:
        print(f"[slide-token] 超时（90s）")
    except Exception as e:
        print(f"[slide-token] 异常: {e}")
        import traceback
        traceback.print_exc()

    return None


def get_umid_token_sync():
    try:
        result = subprocess.run(
            ["node", _UMID_GENERATOR_JS],
            capture_output=True, text=True, timeout=30,
            encoding='utf-8', errors='replace',
            cwd=BASE_DIR
        )
        stdout = result.stdout.strip()
        data = None
        for line in stdout.split('\n'):
            line = line.strip()
            if line.startswith('{') and '"umidToken"' in line:
                try:
                    data = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue
        if data:
            umid = data.get('umidToken', '')
            if umid and 'default' not in umid.lower():
                return umid
        print(f"[umid] 解析失败: {stdout[:200]}")
    except subprocess.TimeoutExpired:
        print(f"[umid] 超时（30s）")
    except Exception as e:
        print(f"[umid] 异常: {e}")

    return None


async def ensure_fingerprint(context_url=None):
    """保证设备指纹已生成（全局共享一套，仅首次执行 ~60s 的 Node 补环境）"""
    global _bx_ua, _bx_umidtoken, _fp_lock
    if _bx_ua:
        return _bx_ua, _bx_umidtoken
    if _fp_lock is None:
        _fp_lock = asyncio.Lock()
    async with _fp_lock:
        if _bx_ua:
            return _bx_ua, _bx_umidtoken
        _bx_ua, _bx_umidtoken = await asyncio.to_thread(get_bx_params_sync, context_url)
        return _bx_ua, _bx_umidtoken


def extract_x5sec_config(text):
    """从响应中提取 x5sec 配置数据（window._config_），使用括号计数精准匹配 JSON"""
    start_marker = 'window._config_ ='
    idx = text.find(start_marker)
    if idx == -1:
        return None
    idx = text.find('{', idx)
    if idx == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for i in range(idx, len(text)):
        c = text[i]
        if escape:
            escape = False
            continue
        if c == '\\':
            escape = True
            continue
        if c == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                json_str = text[idx:i + 1]
                try:
                    config = json.loads(json_str)
                    for k, v in config.items():
                        if isinstance(v, str):
                            config[k] = re.sub(r'[\u0060\u02cb\u2018\u2019\u201c\u201d\u2032\u2033]', '', v)
                    return config
                except json.JSONDecodeError:
                    pass
                return None
    return None


def call_x5sec_sign(action, **kwargs):
    """调用 Node.js x5sec_sign_execjs.js 生成签名参数（阻塞）"""
    config = {"action": action}
    config.update(kwargs)
    config_json = json.dumps(config, ensure_ascii=False)
    try:
        result = subprocess.run(
            ["node", os.path.join(CAPTCHA_DIR, "x5sec_sign_execjs.js"), config_json],
            capture_output=True, text=True, timeout=30,
            encoding='utf-8', errors='replace',
            cwd=BASE_DIR
        )
        for line in result.stdout.strip().split('\n'):
            try:
                parsed = json.loads(line)
                if isinstance(parsed, dict) and ('params' in parsed or 'error' in parsed):
                    return parsed
            except json.JSONDecodeError:
                continue
        if result.stderr:
            print(f"[x5sec签名] Node.js stderr: {result.stderr[:200]}")
    except Exception as e:
        print(f"[x5sec签名] 异常: {e}")
    return None


async def get_cna(session):
    """获取 cna cookie（异步网络请求）"""
    url = 'https://log.mmstat.com/eg.js'
    res = await session.get(url)
    cna = None
    if hasattr(res.cookies, 'get'):
        cna = res.cookies.get("cna")
    if not cna:
        set_cookie = res.headers.get('set-cookie', '')
        m = re.search(r'cna=([^;]+)', set_cookie)
        if m:
            cna = m.group(1)
    return cna


async def get_token(session, page, search_input):
    """获取 _m_h5_tk token（异步网络请求），并设置相关 cookie"""
    global call_n
    data = {
        "jsv": "2.7.2",
        "appKey": "12574478",
        "t": int(time.time() * 1000),
        "api": "mtop.taobao.pc.growth.p4p.shop.query",
        "v": "1.0",
        "timeout": "10000",
        "type": "jsonp",
        "dataType": "jsonp",
        "callback": "mtopjsonp" + str(call_n),
        "data": {
            "linkUrl": f"https://uland.taobao.com/sem/tbsearch?keyword={search_input}&localImgKey=&page={page}&q={search_input}&tab=all"}
    }
    call_n += 1
    res2 = await session.get(
        url="https://h5api.m.taobao.com/h5/mtop.taobao.pc.growth.p4p.shop.query/1.0/",
        params=data
    )

    _m_h5_tk = None
    _m_h5_tk_enc = None
    for c in res2.cookies:
        if hasattr(c, 'name'):
            name, val = c.name, c.value
        elif '=' in str(c):
            name, val = str(c).split('=', 1)
        else:
            continue
        if name == '_m_h5_tk':
            _m_h5_tk = val
        elif name == '_m_h5_tk_enc':
            _m_h5_tk_enc = val

    if not _m_h5_tk:
        set_cookie = res2.headers.get('set-cookie', '')
        m = re.search(r'_m_h5_tk=([^;]+)', set_cookie)
        if m:
            _m_h5_tk = m.group(1)
        m2 = re.search(r'_m_h5_tk_enc=([^;]+)', set_cookie)
        if m2:
            _m_h5_tk_enc = m2.group(1)

    if not _m_h5_tk:
        raise Exception("无法获取 _m_h5_tk cookie")

    token = _m_h5_tk.split('_')[0]
    session.cookies.set("_m_h5_tk", _m_h5_tk, domain=".taobao.com", path="/")
    session.cookies.set("_m_h5_tk_enc", _m_h5_tk_enc, domain=".taobao.com", path="/")
    return token


async def assemble_params(sign, t, cna, page, keyword):
    """组装请求参数（含 callback 编号与 bx_et 指纹），返回 (params, data_json)"""
    global call_n
    n = call_n
    call_n += 1
    bx_et = await asyncio.to_thread(get_bx_et, API_URL)

    params = {
        "jsv": "2.7.2",
        "appKey": 12574478,
        "t": t,
        "sign": sign,
        "api": "mtop.relationrecommend.wirelessrecommend.recommend",
        "v": "2.0",
        "type": "jsonp",
        "dataType": "jsonp",
        "callback": "mtopjsonp" + str(n),
        "bx_et": bx_et,
    }
    data = {
        "appId": "43356",
        "params": {
            "device": "HMA-AL00",
            "isBeta": "false",
            "grayHair": "false",
            "from": "nt_history",
            "brand": "HUAWEI",
            "info": "wifi",
            "index": "4",
            "rainbow": "",
            "schemaType": "auction",
            "elderHome": "false",
            "isEnterSrpSearch": "true",
            "newSearch": "false",
            "network": "wifi",
            "subtype": "",
            "hasPreposeFilter": "false",
            "prepositionVersion": "v2",
            "client_os": "Android",
            "gpsEnabled": "false",
            "searchDoorFrom": "srp",
            "debug_rerankNewOpenCard": "false",
            "homePageVersion": "v7",
            "searchElderHomeOpen": "false",
            "search_action": "initiative",
            "sugg": "_4_1",
            "sversion": "13.6",
            "style": "list",
            "ttid": "600000@taobao_pc_10.7.0",
            "needTabs": "true",
            "areaCode": "CN",
            "vm": "nw",
            "countryNum": "156",
            "m": "pc_sem",
            "page": page,
            "n": 48,
            "q": keyword,
            "qSource": "history",
            "pageSource": "",
            "tab": "all",
            "pageSize": 48,
            "totalPage": 100,
            "totalResults": 4800,
            "sourceS": "0",
            "sort": "_coefp",
            "bcoffset": "",
            "ntoffset": "",
            "filterTag": "",
            "service": "",
            "prop": "",
            "loc": "",
            "start_price": "null",
            "end_price": "null",
            "startPrice": "null",
            "endPrice": "null",
            "itemIds": "null",
            "p4pIds": "null",
            "categoryp": "",
            "myCNA": cna
        }
    }
    data_json = json.dumps(data, separators=(',', ':'))
    return params, data_json


def handle_data(text):
    """解析 mtop JSONP 响应，过滤掉非 dict 类型的无效元素（如反爬占位符 'ok'）"""
    obj = re.compile(r'mtopjsonp(\d+)(\((?P<data>.*)\))', re.S)
    result = obj.search(text)
    if not result:
        return None

    data = result.group("data")
    try:
        parsed = json.loads(data)
        raw_items = parsed.get("data", {}).get("itemsArray", [])
        valid_items = [item for item in raw_items if isinstance(item, dict)]
        if not valid_items:
            return None
        return valid_items
    except json.JSONDecodeError:
        return None


async def try_slide_submit(session, x5sec_config, bx_ua, bx_umidtoken, ua, submit_prefix, base_url, target_x=None, punish_url=None):
    """尝试新版 /slide 提交（slidedata 方案），成功返回 True 并设置 x5sec cookie。

    复刻 punishpage.min.js 中 l(e,t) + request() 的完整链路：
      URL = {host}{PATH}/_____tmd_____/slide
      参数 = slidedata, x5secdata, ppt, _rand, landscape, ts, fireyeVersion, pageVersion, v
      头部 = bx-et(对完整URL签名), bx-pp(POW), bx-ua, bx-umidtoken

    slidedata.n = 带行为轨迹的 fyToken（由 fyObj.startRecord + 合成事件 + getFYToken 生成），
    若 target_x 与 punish_url 给出，则用真实轨迹；否则回退到 bx_ua。
    """
    # 1. 生成带轨迹的 fyToken（n）—— 距离 = target_x（滑块拖拽距离）
    #    同一份 fireye SDK 实例内产出 n / bx_ua / umidToken，保证三者一致。
    n_token = None
    slide_bx_ua = bx_ua
    slide_umid = bx_umidtoken
    if target_x is not None:
        slide_token = await asyncio.to_thread(get_slide_token_sync, target_x, punish_url)
        if slide_token:
            if slide_token.get('n'):
                n_token = slide_token['n']
            if slide_token.get('bx_ua') and 'default' not in slide_token['bx_ua'].lower():
                slide_bx_ua = slide_token['bx_ua']
            if slide_token.get('umidToken') and 'default' not in slide_token['umidToken'].lower():
                slide_umid = slide_token['umidToken']

    slide_sign = await asyncio.to_thread(
        call_x5sec_sign,
        'sign_slide',
        x5secConfig=x5sec_config,
        ua=slide_bx_ua,
        umidToken=slide_umid,
        n=n_token,
        landscape=1,
        scene='register',
        language='cn',
    )
    if not slide_sign or not slide_sign.get('fullUrl'):
        return False

    slide_headers = {
        'Referer': f"{submit_prefix}/_____tmd_____/punish",
        'Origin': base_url,
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="124", "Chromium";v="124"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'User-Agent': ua,
    }
    headers = slide_sign.get('headers', {})
    if headers.get('bx-et'):
        slide_headers['bx-et'] = headers['bx-et']
    if headers.get('bx-pp'):
        slide_headers['bx-pp'] = headers['bx-pp']
    if slide_bx_ua and 'default' not in slide_bx_ua.lower():
        slide_headers['bx-ua'] = slide_bx_ua
    if slide_umid and 'default' not in slide_umid.lower():
        slide_headers['bx-umidtoken'] = slide_umid

    full_url = slide_sign['fullUrl']
    resp = await session.get(full_url, headers=slide_headers, timeout=15)

    x5sec_cookies = resp.headers.get('set-cookie', '')
    if x5sec_cookies:
        for part in x5sec_cookies.split(','):
            for cookie_part in part.split(';'):
                if '=' in cookie_part and 'x5sec' in cookie_part.lower():
                    name, value = cookie_part.strip().split('=', 1)
                    session.cookies.set(name, value, domain='.taobao.com', path='/')
                    return True
    return False


async def solve_x5sec(session, x5sec_config, punish_url, state):
    print("滑块punish_url======>",punish_url)
    """解决滑块验证，获取 x5sec cookie（在调用方协程的 session 上执行）"""
    def strip_bt(s):
        return re.sub(r'[\u0060\u02cb\u2018\u2019\u201c\u201d\u2032\u2033]', '', s or '')

    # 确保 bx-ua 设备指纹已刷新（复用全局指纹，此处一般已就绪）
    if not _bx_ua:
        await ensure_fingerprint(context_url=punish_url if punish_url else None)

    token = strip_bt(x5sec_config.get('NCTOKENSTR', ''))
    app_key = strip_bt(x5sec_config.get('NCAPPKEY', ''))

    x5secdata = strip_bt(x5sec_config.get('SECDATA', ''))
    if not x5secdata and punish_url:
        punish_url = strip_bt(punish_url)
        qs = parse_qs(urlparse(punish_url).query)
        x5secdata = strip_bt(qs.get('x5secdata', [''])[0])

    host = strip_bt(x5sec_config.get('HOST', 'h5api.m.taobao.com'))
    host = host.replace(':443', '')
    base_url = f"https://{host}"

    path_prefix = strip_bt(x5sec_config.get('PATH', ''))
    submit_prefix = f"{base_url}{path_prefix}"

    nonce = strip_bt(x5sec_config.get('nonce', ''))

    bx_ua = _bx_ua or ''
    bx_umidtoken = _bx_umidtoken or ''
    ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

    try:
        # ===== 步骤1: 获取滑块题目（需要 bx-ua/bx-umidtoken 头部，否则 bx 返回 304） =====
        import random as _random

        captcha_url = f"{submit_prefix}/_____tmd_____/newslidecaptcha"
        v_val = str(_random.random()).replace('.', '')

        captcha_params = {
            'token': token,
            'appKey': app_key,
            'x5secdata': x5secdata,
            'v': v_val,
        }
        if nonce:
            captcha_params['nonce'] = nonce

        if punish_url:
            captcha_referer = punish_url
        else:
            captcha_referer = f"{submit_prefix}/_____tmd_____/punish"
        captcha_headers = {
            'Referer': captcha_referer,
            'Origin': base_url,
            'Accept': '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'User-Agent': ua,
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="124", "Chromium";v="124"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
        }
        if bx_ua:
            captcha_headers['bx-ua'] = bx_ua
        if bx_umidtoken:
            captcha_headers['bx-umidtoken'] = bx_umidtoken

        print(f"[滑块验证] captcha_params: {json.dumps(captcha_params, ensure_ascii=False)}")

        resp = await session.get(captcha_url, params=captcha_params, headers=captcha_headers, timeout=15)
        q = resp.json()
        print(f"[滑块验证] 响应: {json.dumps(q, ensure_ascii=False)[:500]}")

        if 'data' not in q or not q['data']:
            code = q.get('code', q.get('result', {}).get('code', 'unknown'))
            print(f"[滑块验证] 获取题目失败, code={code}")
            return False

        question = q
        print(f"[滑块验证] 成功获取题目!")

        encrypt_token = question['data']['encryptToken']
        bg_url = question['data']['ques']
        puzzle_url = question['data']['imageData']
        print(f"[滑块验证] encryptToken={encrypt_token}")

        # ===== 步骤2: 下载图片 =====
        print(f"[滑块验证] 下载背景图...")
        bg_img = (await session.get(bg_url, timeout=15)).content
        print(f"[滑块验证] 下载拼图块...")
        puzzle_img = (await session.get(puzzle_url, timeout=15)).content
        print(f"[滑块验证] 背景图: {len(bg_img)} bytes, 拼图块: {len(puzzle_img)} bytes")

        # ===== 步骤3: Node.js 图片分析 + 轨迹生成 =====
        task_json = json.dumps({
            "action": "analyze",
            "bgImageBase64": base64.b64encode(bg_img).decode('ascii'),
            "puzzleBase64": base64.b64encode(puzzle_img).decode('ascii'),
        })

        print(f"[滑块验证] 调用 Node.js 图片分析...")
        result = await asyncio.to_thread(
            subprocess.run,
            ["node", os.path.join(CAPTCHA_DIR, "slide_solver_execjs.js"), task_json],
            capture_output=True, text=True, timeout=60,
            encoding='utf-8', errors='replace',
            cwd=BASE_DIR
        )
        print(f"[滑块验证] Node.js stdout:\n{result.stdout}")
        if result.stderr:
            print(f"[滑块验证] Node.js stderr:\n{result.stderr}")

        analysis = None
        for line in result.stdout.strip().split('\n'):
            try:
                parsed = json.loads(line)
                if isinstance(parsed, dict) and 'targetX' in parsed:
                    analysis = parsed
                    break
            except json.JSONDecodeError:
                continue

        if not analysis:
            print("[滑块验证] 未能解析图片分析结果")
            return False

        target_x = analysis['targetX']
        trajectory = analysis['trajectory']
        print(f"[滑块验证] 目标位置: {target_x}px, 轨迹: {trajectory['time']}ms, {len(trajectory['points'])}点")

        # ===== 步骤3.5: 优先尝试新版 /slide 提交（slidedata 方案） =====
        if await try_slide_submit(session, x5sec_config, bx_ua, bx_umidtoken, ua, submit_prefix, base_url, target_x=target_x, punish_url=punish_url):
            state['solved'] = True
            print("[滑块验证] /slide 提交成功!")
            return True
        print("[滑块验证] /slide 未返回 x5sec cookie，回退 newslidevalidate")

        # ===== 步骤4: 提交验证（带完整签名） =====
        validate_sign_result = await asyncio.to_thread(
            call_x5sec_sign,
            'sign_validate',
            x5secConfig=x5sec_config,
            ua=bx_ua,
            umidToken=bx_umidtoken,
            time=trajectory['time'],
            width=trajectory['width'],
            per=trajectory['per'],
            encryptToken=encrypt_token,
        )

        validate_url = f"{submit_prefix}/_____tmd_____/newslidevalidate"
        validate_params = validate_sign_result['params'] if validate_sign_result else {
            'token': token, 'appKey': app_key, 'encryptToken': encrypt_token,
            'x5secdata': x5secdata, 'time': trajectory['time'],
            'width': trajectory['width'], 'per': trajectory['per'],
            '_rand': secrets.token_hex(16),
        }

        validate_headers = {
            'Referer': f"{submit_prefix}/_____tmd_____/punish",
            'Origin': base_url,
            'Accept': '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="124", "Chromium";v="124"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'User-Agent': ua,
        }
        if validate_sign_result and validate_sign_result.get('headers'):
            if validate_sign_result['headers'].get('bx-et'):
                validate_headers['bx-et'] = validate_sign_result['headers']['bx-et']
            if validate_sign_result['headers'].get('bx-pp'):
                validate_headers['bx-pp'] = validate_sign_result['headers']['bx-pp']

        print(f"[滑块验证] GET {validate_url}...")
        print(f"[滑块验证] params: {json.dumps(validate_params, ensure_ascii=False)[:300]}")
        resp = await session.get(validate_url, params=validate_params, headers=validate_headers, timeout=15)
        print(f"[滑块验证] 验证响应: {resp.text[:500]}")

        for c in resp.cookies:
            if hasattr(c, 'name') and c.value:
                session.cookies.set(c.name, c.value, domain=c.domain or '.taobao.com', path=c.path or '/')
                print(f"[滑块验证] 设置 cookie: {c.name}={c.value}")

        x5sec_cookies = resp.headers.get('set-cookie', '')
        if x5sec_cookies:
            for part in x5sec_cookies.split(','):
                for cookie_part in part.split(';'):
                    if '=' in cookie_part and 'x5sec' in cookie_part.lower():
                        name, value = cookie_part.strip().split('=', 1)
                        session.cookies.set(name, value, domain=".taobao.com", path="/")
                        state['solved'] = True
                        print(f"[滑块验证] 设置 cookie: {name}={value}")

        if state['solved']:
            print("[滑块验证] 解决成功!")
            return True

        if 'x5sec' in resp.text.lower():
            print("[滑块验证] 响应中包含 x5sec，尝试提取...")
            state['solved'] = True
            return True

        print(f"[滑块验证] 未找到 x5sec cookie, 验证失败")
        return False

    except Exception as e:
        print(f"[滑块验证] 异常: {e}")
        import traceback
        traceback.print_exc()
        return False


async def fetch_x5sec_challenge(session, punish_url, state):
    """GET punish URL 获取 x5sec 挑战页，提取配置后调用 solve_x5sec"""
    if state['solved']:
        return True

    punish_url = re.sub(r'[\u0060\u02cb\u2018\u2019\u201c\u201d\u2032\u2033]', '', punish_url)

    if not punish_url.startswith('http'):
        punish_url = 'https://h5api.m.taobao.com' + punish_url

    if not _bx_ua:
        await ensure_fingerprint(context_url=punish_url)

    for stale_cookie in ('x5secdata', 'x5sectag', 'x5sec'):
        try:
            session.cookies.delete(stale_cookie)
        except Exception:
            pass

    print(f"[x5sec] 请求 punish 页面: {punish_url}")

    try:
        resp = await session.get(punish_url, timeout=15)
        html = resp.text
        print(f"[x5sec] punish 响应长度: {len(html)}")

        for c in resp.cookies:
            if hasattr(c, 'name') and c.value:
                print(f"[x5sec] punish 页面设置 cookie: {c.name}={c.value[:50]}")
                try:
                    session.cookies.set(c.name, c.value, domain=c.domain or '.taobao.com', path=c.path or '/')
                except Exception:
                    pass

        set_cookie_header = resp.headers.get('set-cookie', '')
        if set_cookie_header:
            for m in re.finditer(r'([^=;,]+)=([^;,]+)', set_cookie_header):
                cookie_name = m.group(1).strip()
                cookie_val = m.group(2).strip()
                if cookie_name.lower() in ('path', 'domain', 'expires', 'max-age', 'httponly', 'secure', 'samesite', 'version', 'comment'):
                    continue
                try:
                    session.cookies.set(cookie_name, cookie_val, domain='.taobao.com', path='/')
                except Exception:
                    pass

        if 'window._config_' in html:

            x5sec_config = extract_x5sec_config(html)
            if x5sec_config:
                secdata = x5sec_config.get('SECDATA', '')
                if secdata:
                    session.cookies.set('x5secdata', secdata, domain='.taobao.com', path='/')
                sectag = x5sec_config.get('NCTOKENSTR', '')[:32]
                if sectag:
                    session.cookies.set('x5sectag', sectag, domain='.taobao.com', path='/')

                return await solve_x5sec(session, x5sec_config, punish_url, state)
            else:
                print("[x5sec] 无法从 punish 页面提取配置")
        else:
            print(f"[x5sec] punish 页面不包含 window._config_, 前200字符: {html[:200]}")
    except Exception as e:
        print(f"[x5sec] 请求 punish 页面异常: {e}")
        import traceback
        traceback.print_exc()

    return False


async def send_request(session, url, params, data_json, state):
    """发送请求，自动检测并处理 x5sec 风控"""
    req_headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if _bx_ua and 'default' not in _bx_ua.lower():
        req_headers['bx-ua'] = _bx_ua

    response = await session.post(url, params=params, data={"data": data_json}, headers=req_headers)
    text = response.text
    print("[send_request] 响应: " + text)

    # 检测 x5sec 风控方式1: 响应直接是 window._config_ HTML 页面
    if 'window._config_' in text:
        print(f"检测到window._config_响应")
        x5sec_config = extract_x5sec_config(text)
        if x5sec_config and not state['solved']:
            if await solve_x5sec(session, x5sec_config, url, state):
                return await send_request(session, url, params, data_json, state)

    # 检测 x5sec 风控方式2: JSONP 响应中包含 FAIL_SYS_USER_VALIDATE + punish URL
    if 'FAIL_SYS_USER_VALIDATE' in text:
        print(f"检测到 FAIL_SYS_USER_VALIDATE，触发滑块挑战")
        if not state['solved']:
            obj = re.search(r'mtopjsonp\d+\((?P<data>.*)\)', text, re.S)
            if obj:
                try:
                    parsed = json.loads(obj.group("data"))
                    punish_url = parsed.get("data", {}).get("url", "")
                    if punish_url:
                        punish_url = punish_url.strip('`')
                        print(f"[风控] 提取到 punish URL")
                        if await fetch_x5sec_challenge(session, punish_url, state):
                            print("[风控] 滑块已解决，重试请求...")
                            return await send_request(session, url, params, data_json, state)
                except json.JSONDecodeError:
                    print("[风控] 解析 punish URL 失败")

    return handle_data(text)


async def init_session(session, keyword):
    """初始化单个 session：设置请求头、获取 cookie/token 和共享设备指纹，返回 (token, cna)"""
    session.headers = {
        "accept": "*/*",
        "accept-encoding": "gzip, deflate",
        "accept-language": "zh-CN,zh;q=0.9",
        "cache-control": "no-cache",
        "origin": "https://uland.taobao.com",
        "pragma": "no-cache",
        "referer": "https://uland.taobao.com/sem/tbsearch?_input_charset=utf-8&bc_fl_src=tbsite_RfDql8UI&channelSrp=360Somama&clk1=8388c5765e41ec06dfbb468db789132b&commend=all&ie=utf8&initiative_id=tbindexz_20170306&keyword=%E9%9E%8B%E5%AD%90&localImgKey=&page=1&preLoadOrigin=https%3A%2F%2Fwww.taobao.com&q=%E9%9E%8B%E5%AD%90&qhclickid=7a1afde590b6f88c&refpid=mm_26632360_8858797_29866178&search_type=item&source=suggest&sourceId=tb.index&spm=tbpc.pc_sem_alimama%2Fa.search_history.d4&ssid=s5-e&suggest_query=&tab=all&wq=",
        "sec-ch-ua": '"Not=A?Brand";v="99", "Google Chrome";v="124", "Chromium";v="124"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "Windows",
        "sec-fetch-dest": "script",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
    # 先访问 taobao.com 获取 _umid cookie（服务端设备标识）
    try:
        r = await session.get("https://www.taobao.com", timeout=15)
        for c in r.cookies:
            if hasattr(c, 'name') and c.value:
                if c.name in ('_umid', 'cookie2', 't', 'unb', 'cookie17'):
                    session.cookies.set(c.name, c.value, domain=c.domain or '.taobao.com', path=c.path or '/')
        set_cookie = r.headers.get('set-cookie', '')
        for m in re.finditer(r'(_umid|cookie2|t)=([^;]+)', set_cookie):
            session.cookies.set(m.group(1), m.group(2), domain=".taobao.com", path="/")
    except Exception as e:
        print(f"获取 _umid 失败: {e}")

    cna = await get_cna(session)
    session.cookies.set("cna", cna, domain=".taobao.com", path="/")
    session.cookies.set("mtop_partitioned_detect", "1", domain=".taobao.com", path="/")

    isg = await asyncio.to_thread(gen_isg)
    session.cookies.set("isg", isg, domain=".taobao.com", path="/")

    tfstk = await asyncio.to_thread(gen_tfstk)
    session.cookies.set("tfstk", tfstk, domain=".taobao.com", path="/")

    # 复用全局共享设备指纹（仅首次 ~60s）
    bx_ua, bx_umidtoken = await ensure_fingerprint()
    if bx_umidtoken and 'default' not in bx_umidtoken.lower():
        session.cookies.set("_umid", bx_umidtoken, domain=".taobao.com", path="/")
        session.cookies.set("umidToken", bx_umidtoken, domain=".taobao.com", path="/")
    else:
        umid = await asyncio.to_thread(get_umid_token_sync)
        if umid:
            session.cookies.set("_umid", umid, domain=".taobao.com", path="/")
            session.cookies.set("umidToken", umid, domain=".taobao.com", path="/")

    # 注入手动登录获取的登录态 cookie（避免 baxia hellobixi 登录重定向）
    if _LOGIN_COOKIES:
        for name, value in _LOGIN_COOKIES.items():
            if value:
                session.cookies.set(name, value, domain=".taobao.com", path="/")

    token = await get_token(session, 1, keyword)
    return token, cna


async def fetch_page(session, token, cna, page, keyword, state):
    """请求单页数据，返回有效商品列表（已过滤无效元素）"""
    _, data_json = await assemble_params("placeholder", 0, cna, page=page, keyword=keyword)
    sign, sign_t, _ = await asyncio.to_thread(gen_sign, token, data_json)
    query_params, data_json = await assemble_params(sign, sign_t, cna, page=page, keyword=keyword)
    resp = await send_request(session, API_URL, query_params, data_json, state)
    return resp


async def refresh_token(session, keyword):
    """刷新 _m_h5_tk token，用于绕过软限流"""
    return await get_token(session, 1, keyword)


def save_csv(item_list):
    file_path = Path(os.path.join(DATA_DIR, "data.csv"))
    file_exists = file_path.exists()

    with _csv_lock:
        with open(os.path.join(DATA_DIR, "data.csv"), "a", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["店铺", "标题", "价格"])
            for item in item_list:
                writer.writerow([item["shopInfo"], item["title"], item["price"]])
    print(f"写入完成: {len(item_list)} 条")


async def crawl_keyword(keyword):
    """抓取单个关键词的全部页（独立 session，复用全局设备指纹）"""
    state = {"solved": False}
    async with AsyncSession(impersonate="chrome124") as session:
        token, cna = await init_session(session, keyword)
        print(f"搜索关键词: {keyword}, 页数: {START_PAGE} ~ {END_PAGE}")

        consecutive_empty = 0
        total_token_refreshes = 0
        MAX_TOKEN_REFRESHES = 3

        for page in range(START_PAGE, END_PAGE + 1):
            print(f"\n===== [{keyword}] 正在请求第 {page} 页 =====")
            resp = await fetch_page(session, token, cna, page, keyword, state)

            if resp is None or len(resp) == 0:
                consecutive_empty += 1
                if total_token_refreshes < MAX_TOKEN_REFRESHES:
                    token = await refresh_token(session, keyword)
                    total_token_refreshes += 1
                    resp = await fetch_page(session, token, cna, page, keyword, state)
                    if resp and len(resp) > 0:
                        consecutive_empty = 0

                if resp is None or len(resp) == 0:
                    if consecutive_empty >= 3:
                        break
                    continue

            item_list = []
            consecutive_empty = 0
            for i in resp:
                item_dict = {
                    "shopInfo": i.get("shopInfo", {}).get("title", "N/A"),
                    "title": re.sub(r'<[^>]+>', '', i.get("title", "")),
                    "price": i.get("price", "N/A")
                }
                item_list.append(item_dict)
            print(item_list)
            save_csv(item_list)


async def main(keywords):
    """多关键词并发入口：用信号量限制并发上限"""
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def worker(kw):
        async with semaphore:
            await crawl_keyword(kw)

    await asyncio.gather(*(worker(kw) for kw in keywords))


if __name__ == '__main__':
    arr = [
        "连衣裙",
        "阔腿裤", "运动裤", "半身裙", "旗袍", "汉服", "睡衣", "家居服", "内衣", "男士内裤",
        "文胸", "袜子", "打底裤", "帽子", "围巾", "手套", "皮带", "发带", "发夹",
        "老爹鞋", "帆布鞋", "皮鞋", "马丁靴", "运动鞋", "凉鞋", "拖鞋", "高跟鞋", "雪地靴",
        "双肩包", "斜挎包", "手提包", "钱包", "腰包", "行李箱", "帆布包",
        #
        # "面膜", "口红", "粉底液", "眼影", "睫毛膏", "腮红", "散粉", "卸妆油", "爽肤水", "精华液",
        # "面霜", "眼霜", "防晒霜", "身体乳", "护手霜", "香水", "眉笔", "化妆刷", "洗脸巾",
        # "牙膏", "牙刷", "漱口水", "洗发水", "护发素", "沐浴露", "脱毛膏", "梳子", "头绳",

        "饼干", "糖果", "果冻", "辣条", "薯片", "坚果", "牛肉干", "巧克力", "蛋糕", "面包",
        "螺蛳粉", "方便面", "大米", "面粉", "食用油", "酱油", "醋", "辣椒酱", "茶叶",
        "红茶", "绿茶", "乌龙茶", "咖啡", "奶茶粉", "蜂蜜", "红枣", "枸杞", "葡萄干",
        "海味干货", "罐头", "酒水", "酸奶", "牛奶", "水果干", "肉脯",

        "床上四件套", "被子", "床垫", "枕头", "床单", "被套", "窗帘", "地毯", "沙发套",
        "收纳箱", "收纳盒", "衣架", "晾衣架", "垃圾桶", "拖把", "扫把", "抹布", "洗洁精",
        "洗衣液", "肥皂", "纸巾", "抽纸", "卷纸", "保鲜膜", "保鲜盒", "水杯", "保温杯",
        "玻璃杯", "陶瓷碗", "炒锅", "汤锅", "菜刀", "菜板", "锅铲", "刀具套装", "烧水壶",
        "电饭煲", "空气炸锅", "吹风机", "电风扇", "加湿器", "取暖器", "台灯", "壁灯", "装饰画",

        "手机", "平板电脑", "笔记本电脑", "键盘", "鼠标", "耳机", "蓝牙耳机", "音箱", "充电宝",
        "手机壳", "数据线", "充电器", "U盘", "硬盘", "摄像头", "手环", "智能手表", "游戏机",
        "鼠标垫", "散热器", "录音笔", "相机", "拍立得",

        "纸尿裤", "拉拉裤", "婴儿奶粉", "奶瓶", "婴儿衣服", "童装", "儿童鞋子", "玩具",
        "积木", "手办", "玩偶", "绘本", "书包", "文具", "蜡笔", "画板", "婴儿推车",
        "孕妇装", "隔尿垫", "辅食", "儿童手表",

        "猫粮", "狗粮", "猫砂", "宠物零食", "狗绳", "宠物窝", "宠物玩具", "猫抓板",
        "宠物沐浴露", "鱼缸", "鱼食",

        "瑜伽服", "运动内衣", "跑步鞋", "羽毛球拍", "乒乓球拍", "篮球", "足球", "跳绳",
        "哑铃", "瑜伽垫", "登山包", "冲锋衣", "帐篷", "睡袋", "雨伞", "遮阳帽", "泳装",

        "车载支架", "车载香薰", "坐垫", "方向盘套", "汽车脚垫", "玻璃水", "后备箱收纳",

        "项链", "手链", "耳环", "戒指", "珍珠饰品", "银饰", "玉坠", "墨镜", "平光眼镜",

        "拼图", "手账", "笔记本", "钢笔", "颜料", "乐器配件", "海报", "盲盒", "拼豆",

        "花盆", "营养土", "种子", "肥料", "园艺工具", "仿真花", "绿植盆栽"
    ]
    asyncio.run(main(arr))