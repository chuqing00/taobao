const fs = require('fs');
const path = require('path');
const vm = require('vm');
// 构建浏览器沙箱
function createSandbox() {
    const sandbox = {
        document: {
            cookie: '', cookieEnabled: true, hidden: false, mozHidden: false,
            visibilityState: 'visible', readyState: 'complete',
            referrer: '', title: '', characterSet: 'UTF-8',
            documentElement: { clientWidth: 1920, clientHeight: 1080, style: {} },
            body: {
                clientWidth: 1920, clientHeight: 1080, style: {},
                appendChild() { }, insertBefore() { },
                addEventListener() { }, removeEventListener() { }, attachEvent() { }
            },
            getElementsByTagName(tag) {
                if (tag === 'head') return [{ appendChild() { }, insertBefore() { }, addEventListener() { }, removeEventListener() { }, attachEvent() { } }];
                if (tag === 'base') return [];
                return [];
            },
            createElement(tag) {
                const el = {
                    tagName: tag, style: {},
                    setAttribute() { }, getAttribute() { return null; },
                    appendChild() { }, addEventListener() { }, removeEventListener() { },
                    attachEvent() { }, dispatchEvent() { }, focus() { }
                };
                if (tag === 'input') { el.type = 'hidden'; el.name = ''; el.value = ''; }
                if (tag === 'canvas') {
                    el.getContext = function (type) {
                        if (type === 'webgl') return { getExtension() { return { loseContext() { } }; } };
                        return null;
                    };
                }
                return el;
            },
            addEventListener() { }, removeEventListener() { }, attachEvent() { },
            createEvent() { return { initEvent() { } }; }, dispatchEvent() { }
        },
        console: console, setTimeout, clearTimeout, setInterval, clearInterval,
        encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN,
        JSON, Math, Date, RegExp, Object, Array, Function, String, Number, Boolean,
        Error, Promise, Symbol, Map, Set, WeakMap,
        Uint8Array, Uint16Array, Int8Array, Int16Array, Int32Array,
        Float32Array, Float64Array, ArrayBuffer, DataView,
        location: {
            href: 'https://www.taobao.com/', hostname: 'www.taobao.com',
            protocol: 'https:', search: '', hash: '',
            host: 'www.taobao.com', pathname: '/', port: '',
            origin: 'https://www.taobao.com'
        },
        navigator: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            platform: 'Win32', language: 'zh-CN', systemLanguage: 'zh-CN',
            vendor: 'Google Inc.', webdriver: false, maxTouchPoints: 0,
            appVersion: '5.0',
            getBattery() { return Promise.resolve({ charging: true, level: 1 }); },
            plugins: { length: 5 }, mimeTypes: { length: 5 }
        },
        screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
        history: { length: 1, pushState() { }, replaceState() { } },
        Image: class Image { constructor() { this.src = ''; } },
        localStorage: {
            _data: {},
            getItem(k) { return this._data[k] || null; },
            setItem(k, v) { this._data[k] = String(v); },
            removeItem(k) { delete this._data[k]; }
        },
        performance: { timing: { navigationStart: Date.now() }, now() { return Date.now(); } },
        MutationObserver: class MutationObserver { constructor() { } observe() { } disconnect() { } },
        DeviceOrientationEvent: class DeviceOrientationEvent { },
        DeviceMotionEvent: class DeviceMotionEvent { },
        XMLHttpRequest: class XMLHttpRequest { constructor() { this.readyState = 0; } open() { } send() { } setRequestHeader() { } },
        HTMLScriptElement: class HTMLScriptElement { }, HTMLFormElement: class HTMLFormElement { },
        Element: class Element { }, HTMLElement: class HTMLElement { },
        HTMLInputElement: class HTMLInputElement { }, HTMLAnchorElement: class HTMLAnchorElement { },
        HTMLAreaElement: class HTMLAreaElement { }, MSGesture: undefined,
        callPhantom: undefined, _sufei_data2: undefined, _sufei_log: 0.001,
        chrome: { runtime: {} }, safari: undefined, opr: undefined,
        indexedDB: undefined, openDatabase: undefined,
        webkitRequestFileSystem: undefined, requestFileSystem: undefined,
        fetch() { return Promise.reject(new Error('fetch not available')); },
        postMessage() { }, addEventListener() { }, removeEventListener() { },
        attachEvent() { }, dispatchEvent() { }, getComputedStyle() { return {}; },
        matchMedia() { return { matches: false }; },
        requestAnimationFrame(cb) { setTimeout(cb, 16); },
        cancelAnimationFrame(id) { clearTimeout(id); },
        btoa(s) { return Buffer.from(s, 'binary').toString('base64'); },
        atob(s) { return Buffer.from(s, 'base64').toString('binary'); },
        escape, unescape
    };
    sandbox.self = sandbox;
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.global = sandbox;
    return sandbox;
}

// 初始化沙箱
let _sandbox = null;
let _initialized = false;

// 定位 et_f_iife.js：优先同目录；PyExecJS(execjs) 经 stdin 执行时 __dirname 可能为 '.'，
// 此时回退到进程 CWD（项目根）下的 sign/ 目录。
const ET_IIFE_PATH = (() => {
    const candidates = [
        path.join(__dirname, 'et_f_iife.js'),
        path.join(process.cwd(), 'sign', 'et_f_iife.js'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return candidates[0];
})();

function init() {
    if (_initialized) return;
    _sandbox = createSandbox();
    vm.createContext(_sandbox);
    const iifeCode = fs.readFileSync(ET_IIFE_PATH, 'utf-8');
    vm.runInContext(iifeCode, _sandbox, { timeout: 30000 });
    _initialized = true;
}

function getTfstk(url) {
    init();
    return _sandbox.__etModule.getETToken(url || 'https://www.taobao.com/');
}

function getEtSign(url) {
    init();
    return _sandbox.etSign(url || 'https://www.taobao.com/');
}

module.exports = { getTfstk, getEtSign, init };

const url = 'https://h5api.m.taobao.com/h5/mtop.taobao.trade.get/1.0/';
console.log('tfstk:', getTfstk(url));
