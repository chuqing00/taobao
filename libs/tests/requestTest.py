import re

import pyhttpx
import time
import json
from pprint import pprint as pp
import time
import random
import os
import requests
import aiohttp
import asyncio
headers={
'Host': '*',
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
'Pragma': 'no-cache',
'Cache-Control': 'no-cache',
'sec-ch-ua-platform': '"Windows"',
'sec-ch-ua-mobile': '?0',
#'Accept': '*/*',
'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',

'Accept-Encoding': 'gzip, deflate, br',
'Accept-Language': 'zh,zh-CN;q=0.9,en;q=0.8',

}
headers1 = {

#'Host': '*',
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:99.0) Gecko/20100101 Firefox/99.0',
'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
'Accept-Encoding': 'gzip, deflate, br',
'Connection': 'keep-alive',
'Upgrade-Insecure-Requests': '1',
'Sec-Fetch-Dest': 'document',
'Sec-Fetch-Mode': 'navigate',
'Sec-Fetch-Site': 'same-origin',
'Sec-Fetch-User': '?1',
'Pragma': 'no-cache',
'Cache-Control': 'no-cache',

}

def main():

    sess = pyhttpx.HttpSession(http2=False,
                               browser_type='chrome',
                               )
    url='https://tls.peet.ws/api/all'
    proxies = {
        'https': 'http://username:password@host:port'
    }

    r = sess.get(url, headers=headers)
    print(r.status_code)

if __name__ == '__main__':
    main()

























