import json

import requests
import execjs
import subprocess
import os

BASE = os.path.dirname(os.path.abspath(__file__))


def get_bx_params():
    proc = subprocess.run(
        ["node", "gen_bx_ua.js"],
        cwd=BASE,  # 必须在 登录模块 目录下运行，require 路径才正确
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"node 执行失败: {proc.stderr}")
    return json.loads(proc.stdout.strip())


def r_js(file):
    with open(file=file, encoding='utf-8', mode='r') as f:
        jsCode = f.read()
    js = execjs.compile(jsCode)
    return js


headers = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "bx-v": "2.5.31",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded",
    "origin": "https://login.taobao.com",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": "https://login.taobao.com/havanaone/login/login.htm?bizName=taobao&spm=a21bo.jianhua/a.754894437.1.5af92a89W78Cuc&f=top&redirectURL=https%3A%2F%2Fwww.taobao.com%2F",
    "sec-ch-ua": "Chromium;v=152, Not?A_Brand;v=24, Google Chrome;v=152",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "Windows",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
}
cookies = {
    "XSRF-TOKEN": "7c030da8-eb63-476d-87cc-bcb0b481763e",
    "_samesite_flag_": "true",
    "cookie2": "1aa4ba173b6557d760e370f9d1f067df",
    "t": "c4c9d9960b7bd4e5eaf16494561cdd8f",
    "_tb_token_": "54ad55b75b13b",
    "cna": "ayAoI4dsoRkBASQJilUXA4uY",
    "arms_uid": "ea572fbc-f538-4762-a9a1-8fd4497daa2c",
    "sca": "282c858b",
    "thw": "xx",
    "xlly_s": "1",
    "3PcFlag": "1788959616808",
    "isg": "BL29arBri30wvy8nUQTMUxYwzBm3WvGshE92o38DSZRDttzoR6qLfJplYOrwNglk"
}
url = 'https://login.taobao.com/havanaone/loginLegacy/password/login.do'
params = {
    "bizEntrance": "taobao_pc",
    "bizName": "taobao"
}
u = "chuqing.zcj@gmail.com"
pw = "123123"
encrypy_pw = r_js("./gen_pw.js").call("fn", "123123")
bx_params = get_bx_params()
bx_et = r_js("gen_bx_et.js").call("gen_bxet")
# print(bx_et)

data = (
    f'loginId={u}&password2={encrypy_pw}&keepLogin=false&isIframe=false&banThirdPartyCookie=false&documentReferer=https://www.taobao.com/&defaultView=password&ua=&umidGetStatusVal=&screenPixel=1280x720&navlanguage=zh-CN&navUserAgent=Mozilla%2F5.0%20%28Windows%20NT%2010.0%3B%20Win64%3B%20x64%29%20AppleWebKit%2F537.36%20%28KHTML%2C%20like%20Gecko%29%20Chrome%2F152.0.0.0%20Safari%2F537.36&navPlatform=Win32&hitRSA2048Gray=true&bizEntrance=taobao_pc&bizName=taobao&renderRefer=https%3A%2F%2Fwww.taobao.com%2F&_csrf=4181bfd25583b861f0225168fbc79c11&returnUrl=https%3A%2F%2Fwww.taobao.com%2F&lang=zh_CN&umidToken=&umidTag=NOT_INIT&weiBoMpBridge=&jsVersion=0.10.36&deviceId=ayAoI4dsoRkBASQJilUXA4uY&pageTraceId=213e083417889595745121137e9e6d&bx-ua={bx_params["bx_ua"]}&bx-umidtoken={bx_params["bx-umidtoken"]}&bx_et={bx_et}&x-pipu2=%7Bnbzk%60yvnlfkdpwl%7C!f5g99%2C9(x%2Bhn3j%2C%24%60)(gh%7Bnjefbhjqin%7Bmcswkjq%7Bo%7Boqr').encode(
    'utf-8', 'surrogateescape')
response = requests.post(url, headers=headers, cookies=cookies, params=params, data=data)
print(response.text)
if "被挤爆啦" in response.text:
    print("有验证码")
