/**
 * umidToken 生成器 - 使用 jsdom 模拟浏览器环境运行 AWSC SDK
 * 
 * 使用方法:
 *   node umid_generator.js
 *   输出 JSON: { "umidToken": "...", "ua": "..." }
 *   ua: collina.js 浏览器指纹 (用于 bx-ua 请求头)
 *   umidToken: UMID 设备指纹
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// 读取本地文件
const umJs = fs.readFileSync(path.join(__dirname, 'um.js'), 'utf8');
const collinaJs = fs.readFileSync(path.join(__dirname, 'collina.js'), 'utf8');
const awscJs = fs.readFileSync(path.join(__dirname, 'awsc.js'), 'utf8');

// 创建 jsdom 环境
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://h5api.m.taobao.com/',
    referrer: 'https://www.taobao.com/',
    contentType: 'text/html',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
});

const { window } = dom;
const { document, navigator } = window;

// 增强 navigator 模拟
Object.defineProperties(navigator, {
    userAgent: {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        configurable: true
    },
    platform: { value: 'Win32', configurable: true },
    language: { value: 'zh-CN', configurable: true },
    languages: { value: ['zh-CN', 'zh'], configurable: true },
    hardwareConcurrency: { value: 8, configurable: true },
    deviceMemory: { value: 8, configurable: true },
    maxTouchPoints: { value: 0, configurable: true },
    vendor: { value: 'Google Inc.', configurable: true },
    appVersion: {
        value: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        configurable: true
    },
    appName: { value: 'Netscape', configurable: true },
    cookieEnabled: { value: true, configurable: true },
    onLine: { value: true, configurable: true },
    webdriver: { value: false, configurable: true },
});

// 模拟 screen
window.screen = {
    width: 1920, height: 1080,
    availWidth: 1920, availHeight: 1040,
    colorDepth: 24, pixelDepth: 24,
};

// 模拟 performance
window.performance = {
    timing: { navigationStart: Date.now() - 1000 },
    now: () => Date.now() - 1000,
    getEntriesByType: () => [],
    getEntries: () => [],
};

// 全局对象
global.window = window;
global.document = document;
global.navigator = navigator;
global.location = window.location;
global.self = window;
global.parent = window;
global.top = window;

// 拦截脚本加载，替换为本地文件
const originalCreateElement = document.createElement.bind(document);
document.createElement = function (tagName) {
    const el = originalCreateElement(tagName);
    if (tagName.toLowerCase() === 'script') {
        const origSetAttr = el.setAttribute.bind(el);
        el.setAttribute = function (name, value) {
            if (name === 'src' && value) {
                if (value.includes('um.js') || value.includes('WebUMID')) {
                    try { eval(umJs); } catch (e) { }
                    setTimeout(() => { if (el.onload) el.onload(); }, 10);
                    return;
                }
                if (value.includes('collina.js') || value.includes('uab')) {
                    try { eval(collinaJs); } catch (e) { }
                    setTimeout(() => { if (el.onload) el.onload(); }, 10);
                    return;
                }
            }
            origSetAttr(name, value);
        };
    }
    return el;
};

// 加载 AWSC SDK
let done = false;
let result = { ua: '', umidToken: '' };

try {
    eval(awscJs);
} catch (e) {
    // 忽略 console.log 输出导致的错误
}

if (window.AWSC && window.AWSC.configFY) {
    window.AWSC.configFY(
        function (fyObj) {
            if (done) return;
            if (fyObj && fyObj.umidToken && !fyObj.umidToken.includes('defaultToken')) {
                done = true;
                result = {
                    ua: fyObj.getUA ? fyObj.getUA() : '',
                    umidToken: fyObj.umidToken || '',
                };
                console.log(JSON.stringify(result));
                process.exit(0);
            }
        },
        { appName: 'default', serviceLocation: 'cn' }
    );

    // 超时保护
    setTimeout(() => {
        if (!done) {
            done = true;
            console.log(JSON.stringify(result));
            process.exit(1);
        }
    }, 15000);
} else {
    console.log(JSON.stringify({ ua: '', umidToken: '', error: 'AWSC not found' }));
    process.exit(1);
}