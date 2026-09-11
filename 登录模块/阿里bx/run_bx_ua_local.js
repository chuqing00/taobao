const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = __dirname;
const FILE_AWSC = path.join(ROOT, "启动.js");
const FILE_FY = path.join(ROOT, "fireyejs.js");
const FILE_UM = path.join(ROOT, "..", "fingerprint", "um.js");
const FILE_COLLINA = path.join(ROOT, "..", "fingerprint", "collina.js");

let Canvas = null;
try {
  Canvas = require("canvas");
} catch (_) {}
function parseArgs(argv) {
  return {
    url:
      argv.includes("--url")
        ? argv[argv.indexOf("--url") + 1]
        : `//h5api.m.taobao.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/?jsv=2.7.2&appKey=12574478&t=${Date.now()}&api=mtop.relationrecommend.wirelessrecommend.recommend`,
    json: argv.includes("--json"),
    record: argv.includes("--record"),
    distance: argv.includes("--distance")
      ? Number(argv[argv.indexOf("--distance") + 1])
      : 210,
    timeout: Number(process.env.FY_TIMEOUT || 20000),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeNativeLike(fn, name) {
  try {
    const native = `function ${name || fn.name || ""}() { [native code] }`;
    fn.toString = () => native;
  } catch (_) {}
  return fn;
}

function createEnvLogger(target, label, log) {
  if (!process.env.DEBUG_ENV) return target;
  return new Proxy(target, {
    get(t, p, r) {
      const v = Reflect.get(t, p, r);
      if (typeof p === "string" && !p.startsWith("_") && p !== "then") {
        log(`[get] ${label}.${p} => ${typeof v}`);
      }
      if (typeof v === "function") {
        return function (...args) {
          log(`[call] ${label}.${String(p)}(${args.map((a) => typeof a).join(",")})`);
          return v.apply(this === r ? t : this, args);
        };
      }
      return v;
    },
  });
}

function loadEnvProfile() {
  try {
    if (fs.existsSync(path.join(ROOT, "env_profile.json"))) {
      return JSON.parse(fs.readFileSync(path.join(ROOT, "env_profile.json"), "utf8")).env || {};
    }
  } catch (_) {}
  return {};
}

function patchEnv(window) {
  const log = (...a) => {
    if (process.env.DEBUG_ENV) console.error(...a);
  };
  const { navigator, document } = window;
  const profile = loadEnvProfile();

  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const defineNav = (k, getter) => {
    try {
      Object.defineProperty(navigator, k, { get: getter, configurable: true });
    } catch (_) {}
  };

  defineNav("userAgent", () => ua);
  defineNav("appVersion", () => ua.replace("Mozilla/", ""));
  defineNav("platform", () => profile.platform || "Win32");
  defineNav("vendor", () => "Google Inc.");
  defineNav("language", () => profile.language || "zh-CN");
  defineNav("languages", () => profile.languages || ["zh-CN", "zh", "en-US", "en"]);
  defineNav("webdriver", () => false);
  defineNav("hardwareConcurrency", () => profile.hardwareConcurrency || 8);
  defineNav("deviceMemory", () => profile.deviceMemory || 8);
  defineNav("maxTouchPoints", () => profile.maxTouchPoints || 0);
  defineNav("cookieEnabled", () => true);
  defineNav("doNotTrack", () => null);
  defineNav("pdfViewerEnabled", () => true);
  navigator.javaEnabled = makeNativeLike(() => false, "javaEnabled");

  // plugins / mimeTypes
  const pluginData = [
    { name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
    { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
    { name: "Chromium PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
    { name: "Microsoft Edge PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
    { name: "WebKit built-in PDF", filename: "internal-pdf-viewer", description: "Portable Document Format" },
  ];
  const plugins = pluginData.map((p, i) => {
    const o = { ...p, length: 1, 0: { type: "application/pdf", suffixes: "pdf", description: p.description } };
    o.item = (n) => (n === 0 ? o[0] : null);
    return o;
  });
  plugins.length = pluginData.length;
  plugins.item = (i) => plugins[i] || null;
  plugins.namedItem = (n) => plugins.find((p) => p.name === n) || null;
  plugins.refresh = () => {};
  defineNav("plugins", () => plugins);
  const mimes = [{ type: "application/pdf", suffixes: "pdf", description: "Portable Document Format", enabledPlugin: plugins[0] }];
  mimes.item = (i) => mimes[i] || null;
  mimes.namedItem = (t) => mimes.find((m) => m.type === t) || null;
  defineNav("mimeTypes", () => mimes);

  // screen
  const scr = (typeof profile !== "undefined" && profile.screen) || {};
  for (const [k, v] of Object.entries({
    width: scr.width || 1920,
    height: scr.height || 1080,
    availWidth: scr.availWidth || 1920,
    availHeight: scr.availHeight || 1040,
    colorDepth: scr.colorDepth || 24,
    pixelDepth: scr.pixelDepth || 24,
  })) {
    try {
      Object.defineProperty(window.screen, k, { get: () => v, configurable: true });
    } catch (_) {}
  }
  for (const [k, v] of Object.entries({
    devicePixelRatio: (profile && profile.devicePixelRatio) || 1,
    innerWidth: (profile && profile.innerWidth) || 1920,
    innerHeight: (profile && profile.innerHeight) || 937,
    outerWidth: scr.width || 1920,
    outerHeight: scr.height || 1040,
  })) {
    try {
      Object.defineProperty(window, k, { get: () => v, configurable: true });
    } catch (_) {}
  }
  window.__envWebgl = (profile && profile.webgl) || null;

  window.chrome = { runtime: {}, csi: () => ({}), loadTimes: () => ({}) };

  // storage quota
  const quota = {
    queryUsageAndQuota: makeNativeLike((ok) => ok && ok(1 << 20, 10 * (1 << 30)), "queryUsageAndQuota"),
    requestQuota: makeNativeLike((n, ok) => ok && ok(n), "requestQuota"),
  };
  defineNav("webkitTemporaryStorage", () => quota);
  defineNav("webkitPersistentStorage", () => quota);
  defineNav("storage", () => ({
    estimate: async () => ({ usage: 1 << 20, quota: 10 * (1 << 30) }),
    persist: async () => false,
    persisted: async () => false,
  }));
  defineNav("connection", () => ({
    effectiveType: "4g",
    rtt: 50,
    downlink: 10,
    saveData: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  defineNav("permissions", () => ({
    query: async () => ({ state: "prompt", onchange: null }),
  }));
  defineNav("mediaDevices", () => ({
    enumerateDevices: async () => [],
    getUserMedia: async () => {
      throw Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    },
  }));
  navigator.getBattery = makeNativeLike(async () => ({
    charging: true,
    chargingTime: 0,
    dischargingTime: Infinity,
    level: 0.99,
    addEventListener() {},
    removeEventListener() {},
  }), "getBattery");

  // navigator 高级特性（真实 Chrome 124，非 headless 才有，故这里显式补齐）
  defineNav("userAgentData", () => ({
    brands: [
      { brand: "Chromium", version: "124" },
      { brand: "Google Chrome", version: "124" },
      { brand: "Not-A.Brand", version: "99" },
    ],
    mobile: false,
    platform: "Windows",
    getHighEntropyValues: async (hints) => ({
      architecture: "x86",
      bitness: "64",
      fullVersionList: [
        { brand: "Chromium", version: "124.0.6367.61" },
        { brand: "Google Chrome", version: "124.0.6367.61" },
        { brand: "Not-A.Brand", version: "99.0.0.0" },
      ],
      mobile: false,
      model: "",
      platform: "Windows",
      platformVersion: "10.0.0",
      uaFullVersion: "124.0.6367.61",
    }),
    toJSON() { return { brands: this.brands, mobile: false, platform: "Windows" }; },
  }));
  navigator.requestMediaKeySystemAccess = makeNativeLike(function (keySystem, configs) {
    // 真实 Chrome 仅支持 Widevine（PlayReady/FairPlay/ClearKey 均拒绝）
    if (keySystem === "com.widevine.alpha") {
      return Promise.resolve({
        keySystem,
        getConfiguration: () => (Array.isArray(configs) && configs[0]) || {},
        createMediaKeys: () => Promise.resolve({ keySystem }),
      });
    }
    return Promise.reject(new (window.DOMException || Error)("Unsupported keySystem", "NotSupportedError"));
  }, "requestMediaKeySystemAccess");
  defineNav("wakeLock", () => ({
    request: async (type) => ({
      type,
      released: false,
      addEventListener() {},
      removeEventListener() {},
      release: async () => {},
    }),
  }));
  navigator.requestMIDIAccess = makeNativeLike(function (opts) {
    return Promise.reject(new (window.DOMException || Error)("The user denied permission", "NotAllowedError"));
  }, "requestMIDIAccess");

  // canvas
  const proto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
  if (proto) {
    proto.getContext = makeNativeLike(function (type, attrs) {
      if (type === "2d") {
        if (Canvas) {
          const w = this.width || 300;
          const h = this.height || 150;
          const c = Canvas.createCanvas(w, h);
          const ctx = c.getContext("2d");
          // avoid missing font crash noise
          const _fillText = ctx.fillText.bind(ctx);
          ctx.fillText = (text, x, y, ...rest) => {
            try {
              ctx.font = (ctx.font || "").replace(/no-real-font-\d+/g, "Sans");
              return _fillText(text, x, y, ...rest);
            } catch (_) {
              return undefined;
            }
          };
          this.toDataURL = makeNativeLike(function (t, q) {
            return c.toDataURL(t, q);
          }, "toDataURL");
          this.toBlob = makeNativeLike(function (cb, t, q) {
            c.toBuffer((err, buf) => {
              if (err) return cb(null);
              cb(new window.Blob([buf], { type: t || "image/png" }));
            });
          }, "toBlob");
          return ctx;
        }
        return fake2d(this);
      }
      if (String(type).includes("webgl")) return fakeWebGL(String(type) === "webgl2");
      return null;
    }, "getContext");
  }

  function makeAudioParam(v) {
    return {
      value: v,
      defaultValue: v,
      minValue: -3.4e38,
      maxValue: 3.4e38,
      setValueAtTime() { return this; },
      linearRampToValueAtTime() { return this; },
      exponentialRampToValueAtTime() { return this; },
      setTargetAtTime() { return this; },
      setValueCurveAtTime() { return this; },
      cancelScheduledValues() { return this; },
    };
  }
  function makeAudioNode(ctx) {
    return {
      context: ctx,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      connect() { return this; },
      disconnect() {},
      addEventListener() {},
      removeEventListener() {},
    };
  }
  function AudioContextBase() {
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.state = "running";
    this.baseLatency = 0.01;
    this.destination = Object.assign(makeAudioNode(this), {
      maxChannelCount: 2,
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    this.createOscillator = () =>
      Object.assign(makeAudioNode(this), {
        type: "triangle",
        frequency: makeAudioParam(10000),
        detune: makeAudioParam(0),
        start() {},
        stop() {},
      });
    this.createDynamicsCompressor = () =>
      Object.assign(makeAudioNode(this), {
        threshold: makeAudioParam(-50),
        knee: makeAudioParam(40),
        ratio: makeAudioParam(12),
        reduction: -20,
        attack: makeAudioParam(0),
        release: makeAudioParam(0.25),
      });
    this.createAnalyser = () =>
      Object.assign(makeAudioNode(this), {
        fftSize: 2048,
        frequencyBinCount: 1024,
        smoothingTimeConstant: 0.8,
        minDecibels: -100,
        maxDecibels: -30,
        getFloatFrequencyData(a) {
          if (a && a.length) for (let i = 0; i < a.length; i++) a[i] = -100 + (i % 13);
        },
        getByteFrequencyData(a) {
          if (a && a.length) for (let i = 0; i < a.length; i++) a[i] = i % 256;
        },
        getFloatTimeDomainData(a) {
          if (a && a.length) a.fill(0);
        },
        getByteTimeDomainData(a) {
          if (a && a.length) a.fill(128);
        },
      });
    this.createGain = () => Object.assign(makeAudioNode(this), { gain: makeAudioParam(1) });
    this.createScriptProcessor = () =>
      Object.assign(makeAudioNode(this), { onaudioprocess: null, bufferSize: 4096 });
    this.createBuffer = (channels, length, sampleRate) => {
      const chans = [];
      for (let c = 0; c < channels; c++) chans.push(new Float32Array(length));
      return {
        duration: length / sampleRate,
        length,
        numberOfChannels: channels,
        sampleRate,
        getChannelData(i) {
          return chans[i] || chans[0];
        },
        copyFromChannel() {},
        copyToChannel() {},
      };
    };
    this.createBufferSource = () =>
      Object.assign(makeAudioNode(this), {
        buffer: null,
        playbackRate: makeAudioParam(1),
        start() {},
        stop() {},
        onended: null,
      });
    this.decodeAudioData = (buf, ok) => {
      const b = this.createBuffer(1, 8, 44100);
      ok && ok(b);
      return Promise.resolve(b);
    };
    this.close = async () => {
      this.state = "closed";
    };
    this.resume = async () => {
      this.state = "running";
    };
    this.suspend = async () => {
      this.state = "suspended";
    };
  }
  window.AudioContext = window.webkitAudioContext = makeNativeLike(function AudioContext() {
    AudioContextBase.call(this);
  }, "AudioContext");
  window.OfflineAudioContext = window.webkitOfflineAudioContext = makeNativeLike(
    function OfflineAudioContext(channels, length, sampleRate) {
      AudioContextBase.call(this);
      this.sampleRate = sampleRate || 44100;
      this.length = length || 44100;
      this.numberOfChannels = channels || 1;
      this.startRendering = () => {
        const buf = this.createBuffer(this.numberOfChannels, this.length, this.sampleRate);
        // pseudo fingerprintable noise
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.01) * 0.1;
        const ev = { renderedBuffer: buf };
        this.oncomplete && this.oncomplete(ev);
        return Promise.resolve(buf);
      };
      this.oncomplete = null;
    },
    "OfflineAudioContext"
  );

  window.RTCPeerConnection = window.webkitRTCPeerConnection = makeNativeLike(function RTCPeerConnection() {
    this.onicecandidate = null;
    this.createDataChannel = () => ({ close() {}, send() {} });
    this.createOffer = async () => ({ type: "offer", sdp: "v=0\r\n" });
    this.setLocalDescription = async () => {};
    this.close = () => {};
    this.addEventListener = () => {};
  }, "RTCPeerConnection");

  window.matchMedia = makeNativeLike(function matchMedia(q) {
    return {
      matches: false,
      media: q,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    };
  }, "matchMedia");

  window.MutationObserver = window.MutationObserver || class { observe() {} disconnect() {} takeRecords() { return []; } };
  window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 16));
  window.cancelAnimationFrame = window.cancelAnimationFrame || clearTimeout;

  if (!window.performance.timing) {
    window.performance.timing = { navigationStart: Date.now() - 1200 };
  }
  if (!window.performance.memory) {
    window.performance.memory = {
      jsHeapSizeLimit: 3760000000,
      totalJSHeapSize: 10000000,
      usedJSHeapSize: 10000000,
    };
  }
  if (typeof window.performance.getEntries !== "function") {
    window.performance.getEntries = makeNativeLike(() => [], "getEntries");
    window.performance.getEntriesByName = makeNativeLike(() => [], "getEntriesByName");
    window.performance.getEntriesByType = makeNativeLike(() => [], "getEntriesByType");
  }
  if (!window.performance.navigation) {
    window.performance.navigation = {
      type: 1,
      redirectCount: 0,
      toJSON() { return { type: 1, redirectCount: 0 }; },
    };
  }

  // crypto
  if (!window.crypto) window.crypto = {};
  if (!window.crypto.getRandomValues) {
    window.crypto.getRandomValues = makeNativeLike((arr) => {
      for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() * 256) | 0;
      return arr;
    }, "getRandomValues");
  }

  // IndexedDB light stub
  if (!window.indexedDB) {
    window.indexedDB = {
      open() {
        const req = {
          result: {
            objectStoreNames: { contains: () => false },
            createObjectStore() {
              return { createIndex() {} };
            },
            transaction() {
              return {
                objectStore() {
                  return {
                    put() { return {}; },
                    get() { return { result: undefined }; },
                  };
                },
              };
            },
            close() {},
          },
          onerror: null,
          onsuccess: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => {
          req.onsuccess && req.onsuccess({ target: req });
        });
        return req;
      },
    };
  }

  // Safe Function.toString for our natives
  const _toString = Function.prototype.toString;
  Function.prototype.toString = function () {
    if (this && this.__nativeName) return `function ${this.__nativeName}() { [native code] }`;
    return _toString.call(this);
  };

  return log;
}

function fake2d(canvas) {
  return {
    canvas,
    fillStyle: "#000",
    strokeStyle: "#000",
    font: "14px Arial",
    textBaseline: "alphabetic",
    globalCompositeOperation: "source-over",
    fillRect() {},
    clearRect() {},
    strokeRect() {},
    fillText() {},
    strokeText() {},
    measureText(t) {
      return { width: String(t || "").length * 7 };
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    rect() {},
    clip() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    getImageData(x, y, w, h) {
      return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h };
    },
    putImageData() {},
    drawImage() {},
  };
}

function fakeWebGL(isWebGL2) {
  const envGl =
    (typeof global !== "undefined" && global.window && global.window.__envWebgl) ||
    (typeof window !== "undefined" && window.__envWebgl) ||
    {};
  // 与 env_profile.json 声明设备保持一致（AMD Radeon 780M）
  const vendor = envGl.vendor || "Google Inc. (AMD)";
  const renderer =
    envGl.renderer || "ANGLE (AMD, AMD Radeon 780M Graphics (0x00001900) Direct3D11 vs_5_0 ps_5_0, D3D11)";
  const version = isWebGL2
    ? (envGl.version2 || "WebGL 2.0 (OpenGL ES 3.0 Chromium)")
    : (envGl.version || "WebGL 1.0 (OpenGL ES 2.0 Chromium)");

  // getParameter 真实值（来自真实 Chrome / ANGLE D3D11 ground truth 抓取）
  const params = {
    3379: 16384,                              // MAX_TEXTURE_SIZE
    3386: new Int32Array([32767, 32767]),     // MAX_VIEWPORT_DIMS
    33901: new Float32Array([1.0, 1024.0]),   // ALIASED_LINE_WIDTH_RANGE
    33902: new Float32Array([1.0, 1.0]),      // ALIASED_POINT_SIZE_RANGE
    34024: 16384,                             // MAX_RENDERBUFFER_SIZE
    34047: null,                              // MAX_TEXTURE_MAX_ANISOTROPY_EXT(非 getParameter 语义)
    34076: 16384,                             // MAX_VERTEX_TEXTURE_IMAGE_UNITS
    3410: 8,                                  // MAX_COMBINED_TEXTURE_IMAGE_UNITS(WebGL2)
    3411: 8,                                  // MAX_CUBE_MAP_TEXTURE_SIZE(WebGL2)
    3412: 8,                                  // MAX_FRAGMENT_UNIFORM_VECTORS(WebGL2)
    3413: 8,                                  // MAX_VERTEX_UNIFORM_VECTORS(WebGL2)
    3414: 24,                                 // MAX_TEXTURE_IMAGE_UNITS(WebGL2)
    3415: 0,                                  // MAX_VARYING_VECTORS(WebGL2)
    34921: 16,                                // MAX_VERTEX_ATTRIBS
    34930: 16,                                // MAX_TEXTURE_IMAGE_UNITS
    35660: 16,                                // MAX_VERTEX_TEXTURE_IMAGE_UNITS
    35661: 32,                                // MAX_COMBINED_TEXTURE_IMAGE_UNITS
    36347: 4096,                              // MAX_VERTEX_UNIFORM_VECTORS
    36348: 30,                                // MAX_VARYING_VECTORS
    36349: 1024,                              // MAX_FRAGMENT_UNIFORM_VECTORS
    37445: vendor,                            // UNMASKED_VENDOR_WEBGL
    37446: renderer,                          // UNMASKED_RENDERER_WEBGL
    7936: "WebKit",                           // VENDOR
    7937: "WebKit WebGL",                     // RENDERER
    7938: version,                            // VERSION
  };
  if (isWebGL2) {
    params[35724] = "WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)"; // SHADING_LANGUAGE_VERSION
    params[34045] = 2;      // MAX_TEXTURE_LOD_BIAS
    params[35376] = 65536;  // MAX_UNIFORM_BLOCK_SIZE
    params[35377] = 212992; // MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS
    params[35374] = 24;     // MAX_COMBINED_UNIFORM_BLOCKS
    params[35375] = 24;     // MAX_UNIFORM_BUFFER_BINDINGS
  }

  // WebGL 常量（fireeye 以属性读取，如 gl.MAX_TEXTURE_SIZE）
  const constants = {
    MAX_TEXTURE_SIZE: 3379,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
    MAX_VERTEX_UNIFORM_VECTORS: 36347,
    DEPTH_TEST: 0x0b71,
    LEQUAL: 0x0203,
    COLOR_BUFFER_BIT: 0x00004000,
    DEPTH_BUFFER_BIT: 0x00000100,
    TRIANGLE_STRIP: 5,
    TRIANGLES: 4,
    FLOAT: 0x1406,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    NEAREST: 0x2600,
    FRAMEBUFFER: 0x8d40,
    COMPLETE: 0x8cd5,
  };
  if (isWebGL2) {
    Object.assign(constants, {
      MAX_TEXTURE_LOD_BIAS: 34045,
      MAX_UNIFORM_BLOCK_SIZE: 35376,
      MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS: 35377,
      MAX_COMBINED_UNIFORM_BLOCKS: 35374,
      MAX_UNIFORM_BUFFER_BINDINGS: 35375,
    });
  }

  // 真实扩展列表（ANGLE D3D11，WebGL1 与 WebGL2 不同）
  const ext1 = [
    "ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_clip_control",
    "EXT_color_buffer_half_float", "EXT_depth_clamp", "EXT_disjoint_timer_query",
    "EXT_float_blend", "EXT_frag_depth", "EXT_polygon_offset_clamp",
    "EXT_shader_texture_lod", "EXT_texture_compression_bptc",
    "EXT_texture_compression_rgtc", "EXT_texture_filter_anisotropic",
    "EXT_texture_mirror_clamp_to_edge", "EXT_sRGB", "KHR_parallel_shader_compile",
    "OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives",
    "OES_texture_float", "OES_texture_float_linear", "OES_texture_half_float",
    "OES_texture_half_float_linear", "OES_vertex_array_object",
    "WEBGL_blend_func_extended", "WEBGL_color_buffer_float",
    "WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb",
    "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_depth_texture",
    "WEBGL_draw_buffers", "WEBGL_lose_context", "WEBGL_multi_draw",
    "WEBGL_polygon_mode",
  ];
  const ext2 = [
    "EXT_clip_control", "EXT_color_buffer_float", "EXT_color_buffer_half_float",
    "EXT_conservative_depth", "EXT_depth_clamp", "EXT_disjoint_timer_query_webgl2",
    "EXT_float_blend", "EXT_polygon_offset_clamp", "EXT_render_snorm",
    "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc",
    "EXT_texture_filter_anisotropic", "EXT_texture_mirror_clamp_to_edge",
    "EXT_texture_norm16", "KHR_parallel_shader_compile",
    "NV_shader_noperspective_interpolation", "OES_draw_buffers_indexed",
    "OES_sample_variables", "OES_shader_multisample_interpolation",
    "OES_texture_float_linear", "OVR_multiview2", "WEBGL_blend_func_extended",
    "WEBGL_clip_cull_distance", "WEBGL_compressed_texture_s3tc",
    "WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info",
    "WEBGL_debug_shaders", "WEBGL_lose_context", "WEBGL_multi_draw",
    "WEBGL_polygon_mode", "WEBGL_provoking_vertex", "WEBGL_stencil_texturing",
  ];
  const extensions = isWebGL2 ? ext2 : ext1;

  // getShaderPrecisionFormat 真实值：float -> 127/127/23，int -> 31/30/0
  const floatPrec = { rangeMin: 127, rangeMax: 127, precision: 23 };
  const intPrec = { rangeMin: 31, rangeMax: 30, precision: 0 };
  const PRECISION = {
    36336: floatPrec, 36337: floatPrec, 36338: floatPrec,
    36339: intPrec, 36340: intPrec, 36341: intPrec,
  };

  return {
    canvas: { width: 300, height: 150 },
    drawingBufferWidth: 300,
    drawingBufferHeight: 150,
    ...constants,
    getExtension(name) {
      if (name === "WEBGL_debug_renderer_info") {
        return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
      }
      if (name === "EXT_texture_filter_anisotropic") {
        return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047, TEXTURE_MAX_ANISOTROPY_EXT: 34046 };
      }
      return { loseContext() {}, restoreContext() {} };
    },
    getParameter(p) {
      if (p in params) return params[p];
      if (p === 3386) return new Int32Array([32767, 32767]);
      return 0;
    },
    getSupportedExtensions() {
      return extensions.slice();
    },
    getShaderPrecisionFormat(st, p) {
      return PRECISION[p] || floatPrec;
    },
    getContextAttributes() {
      return {
        alpha: true, antialias: true, depth: true,
        desynchronized: false, failIfMajorPerformanceCaveat: false,
        powerPreference: "default", premultipliedAlpha: true,
        preserveDrawingBuffer: false, stencil: false, xrCompatible: false,
      };
    },
    createBuffer() { return {}; },
    bindBuffer() {},
    bufferData() {},
    createProgram() { return {}; },
    createShader() { return {}; },
    shaderSource() {},
    compileShader() {},
    attachShader() {},
    linkProgram() {},
    useProgram() {},
    getShaderParameter() { return true; },
    getProgramParameter() { return true; },
    getShaderInfoLog() { return ""; },
    getProgramInfoLog() { return ""; },
    getAttribLocation() { return 0; },
    getUniformLocation() { return {}; },
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    uniform1f() {},
    uniform2f() {},
    uniform1i() {},
    drawArrays() {},
    drawElements() {},
    clearColor() {},
    clear() {},
    viewport() {},
    enable() {},
    disable() {},
    depthFunc() {},
    blendFunc() {},
    colorMask() {},
    depthMask() {},
    createTexture() { return {}; },
    bindTexture() {},
    texParameteri() {},
    texImage2D() {},
    createFramebuffer() { return {}; },
    bindFramebuffer() {},
    framebufferTexture2D() {},
    checkFramebufferStatus() { return 0x8cd5; },
    readPixels(x, y, w, h, f, t, pixels) {
      if (pixels && pixels.length) for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 17) & 255;
    },
    flush() {},
    finish() {},
    isContextLost() { return false; },
    getError() { return 0; },
  };
}

function hookScriptLoader(window, document) {
  // Hook appendChild / insertBefore to catch script injection without breaking createElement
  const runLocal = (el) => {
    const src = el.getAttribute("src") || el.src || "";
    if (!src || el.__fyLoaded) return false;
    let code = null;
    if (/fireyejs\.js/i.test(src)) code = fs.readFileSync(FILE_FY, "utf8");
    else if (/\/awsc\.js/i.test(src)) code = fs.readFileSync(FILE_AWSC, "utf8");
    else if (/WebUMID/i.test(src)) {
      // 加载 um.js 模块，使 fyObj.getUidToken 能生成有效的 umidToken
      try {
        code = fs.readFileSync(FILE_UM, "utf8");
        console.error("[bx] 加载 um.js 模块 (" + code.length + " bytes)");
      } catch (e) {
        console.error("[bx] um.js 加载失败:", e.message);
        el.__fyLoaded = true;
        queueMicrotask(() => el.onload && el.onload());
        return true;
      }
    }
    else if (/collina/i.test(src)) {
      try {
        code = fs.readFileSync(FILE_COLLINA, "utf8");
        console.error("[bx] 加载 collina.js 模块 (" + code.length + " bytes)");
      } catch (e) {
        console.error("[bx] collina.js 加载失败:", e.message);
        el.__fyLoaded = true;
        queueMicrotask(() => el.onload && el.onload());
        return true;
      }
    }
    else if (/baxiaCommon|算法_01|\/et\/|\/nc\//i.test(src)) {
      el.__fyLoaded = true;
      queueMicrotask(() => el.onload && el.onload());
      return true;
    } else {
      return false;
    }
    el.__fyLoaded = true;
    try {
      window.eval(code);
      queueMicrotask(() => el.onload && el.onload());
    } catch (e) {
      console.error("[eval]", src, e.message);
      queueMicrotask(() => el.onerror && el.onerror(e));
    }
    return true;
  };

  const patch = (proto, method) => {
    const raw = proto[method];
    proto[method] = function (child, ...rest) {
      const ret = raw.call(this, child, ...rest);
      try {
        if (child && child.tagName === "SCRIPT") runLocal(child);
      } catch (_) {}
      return ret;
    };
  };
  patch(document.body.constructor.prototype.__proto__ || window.Node.prototype, "appendChild");
  patch(window.Node.prototype, "insertBefore");

  // also watch src assignment via setAttribute
  const rawSet = window.Element.prototype.setAttribute;
  window.Element.prototype.setAttribute = function (name, value) {
    const ret = rawSet.call(this, name, value);
    if (this.tagName === "SCRIPT" && String(name).toLowerCase() === "src") {
      // when later appended, runLocal will fire; if already in DOM, run now
      if (this.parentNode) runLocal(this);
    }
    return ret;
  };

  // property src setter on HTMLScriptElement
  const desc = Object.getOwnPropertyDescriptor(window.HTMLScriptElement.prototype, "src");
  if (desc && desc.set) {
    Object.defineProperty(window.HTMLScriptElement.prototype, "src", {
      configurable: true,
      enumerable: true,
      get: desc.get,
      set(v) {
        desc.set.call(this, v);
        if (this.parentNode) runLocal(this);
      },
    });
  }

  return runLocal;
}

/**
 * 合成滑块拖拽事件（mousedown -> 若干 mousemove -> mouseup），
 * 触发 fy SDK 的行为轨迹录制（startRecord 后）。轨迹使用 easeIn/easeOut 曲线。
 */
async function dispatchSlideTrajectory(window, document, distance) {
  const MouseEvent = window.MouseEvent;
  const startX = 62;
  const startY = 201.66;
  const totalSteps = 70;
  const stepDelay = 8; // 每步 8ms

  const fire = (type, x, y, buttons) => {
    const ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x,
      screenY: y,
      buttons,
      button: type === "mouseup" ? 0 : 0,
    });
    document.dispatchEvent(ev);
  };

  fire("mousedown", startX, startY, 1);

  for (let i = 1; i <= totalSteps; i++) {
    const p = i / totalSteps;
    let eased;
    if (p < 0.2) eased = 2 * p * p;
    else if (p < 0.8) eased = 0.2 + 0.6 * p;
    else eased = 0.8 + 0.2 * (1 - (1 - p) * (1 - p));
    const x = startX + distance * eased;
    const y = startY + (Math.random() - 0.5) * 2;
    fire("mousemove", x, y, 1);
    await sleep(stepDelay);
  }

  fire("mousemove", startX + distance, startY, 1);
  fire("mouseup", startX + distance, startY, 0);
}

async function generateBxParams(options = {}) {
  const args = {
    url:
      options.url ||
      `//h5api.m.taobao.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/?jsv=2.7.2&appKey=12574478&t=${Date.now()}&api=mtop.relationrecommend.wirelessrecommend.recommend`,
    record: !!options.record,
    distance: options.distance != null ? Number(options.distance) : 210,
    timeout:
      options.timeout != null
        ? Number(options.timeout)
        : Number(process.env.FY_TIMEOUT || 20000),
  };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => {
    if (process.env.DEBUG_ENV) console.error("[jsdom]", e.message);
  });

  const dom = new JSDOM(
    `<!doctype html><html><head><meta charset="utf-8"><title>淘宝网 - 淘！我喜欢</title></head><body><div id="app"></div></body></html>`,
    {
      url: "https://www.taobao.com/search?q=test",
      referrer: "https://www.taobao.com/",
      pretendToBeVisual: true,
      runScripts: "dangerously",
      resources: "usable",
      virtualConsole,
    }
  );

  const { window } = dom;
  global.window = window;
  global.self = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.location = window.location;
  global.HTMLElement = window.HTMLElement;
  global.Node = window.Node;

  patchEnv(window);
  hookScriptLoader(window, window.document);

  // ===== DEBUG_ENV: 采集点探针（代理记录 SDK 对所有环境对象的访问）=====
  if (process.env.DEBUG_ENV) {
    const accessLog = [];
    const seen = new Set();
    const rec = (label, p, extra) => {
      const key = label + "." + String(p);
      if (!seen.has(key)) {
        seen.add(key);
        accessLog.push(key + (extra ? " " + extra : ""));
      }
    };
    const fmt = (v) => {
      const t = typeof v;
      if (v === null || v === undefined) return t;
      if (t === "string") return "string \"" + v.slice(0, 60) + "\"";
      if (t === "number" || t === "boolean") return t + " " + v;
      if (t === "function") return "function";
      if (Array.isArray(v)) return "array[" + v.length + "]";
      if (t === "object") return "object";
      return t;
    };
    const wrap = (obj, label) => {
      if (obj == null || (typeof obj !== "object" && typeof obj !== "function")) return obj;
      try {
        return new Proxy(obj, {
          get(t, p, r) {
            let v;
            try { v = Reflect.get(t, p, r); } catch (e) { return undefined; }
            rec(label, p, fmt(v));
            if (typeof v === "function") {
              return function (...args) {
                rec(label, p + "(" + args.map(fmt).join(",") + ")");
                return v.apply(t, args);
              };
            }
            return v;
          },
          apply(t, thisArg, args) {
            rec(label, "(new)(" + args.map(fmt).join(",") + ")");
            return Reflect.apply(t, thisArg, args);
          },
          construct(t, args) {
            rec(label, "(construct)(" + args.map(fmt).join(",") + ")");
            return Reflect.construct(t, args);
          },
        });
      } catch (e) { return obj; }
    };

    const wNav = wrap(window.navigator, "navigator");
    const wDoc = wrap(window.document, "document");
    const wWin = wrap(window, "window");
    const wScreen = wrap(window.screen, "screen");
    const wHist = wrap(window.history, "history");
    const wLoc = wrap(window.location, "location");
    const wPerf = wrap(window.performance, "performance");
    try { Object.defineProperty(window, "navigator", { value: wNav, configurable: true }); } catch (e) {}
    try { Object.defineProperty(window, "document", { value: wDoc, configurable: true }); } catch (e) {}
    try { Object.defineProperty(window, "screen", { value: wScreen, configurable: true }); } catch (e) {}
    try { Object.defineProperty(window, "history", { value: wHist, configurable: true }); } catch (e) {}
    try { Object.defineProperty(window, "location", { value: wLoc, configurable: true }); } catch (e) {}
    try { Object.defineProperty(window, "performance", { value: wPerf, configurable: true }); } catch (e) {}
    global.navigator = wNav; global.document = wDoc; global.window = wWin;
    global.screen = wScreen; global.history = wHist; global.location = wLoc; global.performance = wPerf;

    // 探针：canvas.getContext 类型 + 返回的 context 方法调用（捕捉 canvas/webgl 具体绘制行为）
    const cproto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
    if (cproto && cproto.getContext) {
      const origGC = cproto.getContext;
      cproto.getContext = function (type, attrs) {
        rec("canvas", "getContext(" + fmt(type) + ")");
        const ctx = origGC.call(this, type, attrs);
        if (ctx && typeof ctx === "object") {
          return new Proxy(ctx, {
            get(t, p, r) {
              let v;
              try { v = Reflect.get(t, p, r); } catch (e) { return undefined; }
              if (p === "canvas" || p === "drawingBufferWidth" || p === "drawingBufferHeight") return v;
              rec("  ctx[" + String(type).slice(0, 4) + "]", String(p) + " " + fmt(v));
              if (typeof v === "function") {
                return function (...args) {
                  rec("  ctx[" + String(type).slice(0, 4) + "]", String(p) + "(" + args.map(fmt).join(",") + ")");
                  let rv;
                  try { rv = v.apply(t, args); } catch (e) { rv = undefined; }
                  return rv;
                };
              }
              return v;
            },
          });
        }
        return ctx;
      };
    }
    // 探针：AudioContext / OfflineAudioContext / RTCPeerConnection 构造
    for (const [k, label] of [["AudioContext", "window.AudioContext"], ["webkitAudioContext", "window.webkitAudioContext"], ["OfflineAudioContext", "window.OfflineAudioContext"], ["RTCPeerConnection", "window.RTCPeerConnection"], ["webkitRTCPeerConnection", "window.webkitRTCPeerConnection"]]) {
      try {
        const C = window[k];
        if (typeof C === "function") {
          window[k] = new Proxy(C, {
            construct(t, args) { rec(label, "new(" + args.map(fmt).join(",") + ")"); return Reflect.construct(t, args); },
            apply(t, thisArg, args) { rec(label, "call(" + args.map(fmt).join(",") + ")"); return Reflect.apply(t, thisArg, args); },
          });
        }
      } catch (e) {}
    }

    const dumpAccess = () => {
      const out = "===== ACCESS LOG (" + accessLog.length + " unique) =====\n" + accessLog.join("\n") + "\n";
      try { fs.writeFileSync(path.join(ROOT, "access_log.txt"), out, "utf8"); } catch (e) {}
      console.error(out);
    };
    global.__dumpAccess = dumpAccess;
    process.on("exit", dumpAccess);
  }

  // load AWSC entry
  window.eval(fs.readFileSync(FILE_AWSC, "utf8"));
  if (!window.AWSC || !window.AWSC.configFYEx) {
    throw new Error("AWSC 启动失败");
  }

  // Prefer sync-ish: when use("fy") loads script, our hook evals local fireyejs
  const mod = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("configFYEx timeout — fireye 未完成 init")), args.timeout);
    window.AWSC.configFYEx(
      (m) => {
        clearTimeout(t);
        resolve(m);
      },
      {
        location: "cn",
        MaxMTLog: 20,
        MaxNGPLog: 10,
        MaxKSLog: 5,
        MaxFocusLog: 3,
      },
      args.timeout
    );
  });

  await sleep(300);

  // 加载并初始化 um 模块，使 fyObj.getUidToken 能返回有效 umidToken
  let umidToken = null;
  if (window.AWSC.configFY && mod.fyObj) {
    try {
      const umResult = await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          console.error("[bx] configFY timeout — um 模块未完成初始化");
          resolve(null);
        }, 15000);
        window.AWSC.configFY(
          (r) => {
            clearTimeout(t);
            resolve(r);
          },
          { appName: "default", serviceLocation: "cn" },
          null,
          15000
        );
      });
      if (umResult && umResult.umidToken && !String(umResult.umidToken).startsWith("default")) {
        umidToken = umResult.umidToken;
        console.error("[bx] umidToken 生成成功: " + umidToken );
      } else {
        console.error("[bx] umidToken 生成失败: " + (umResult ? String(umResult.umidToken) : "null"));
      }
    } catch (e) {
      console.error("[bx] configFY 异常:", e.message);
    }
  }

  const reqUrl = args.url;

  // ===== 可选 --record：startRecord + 合成滑块轨迹，产出带行为轨迹的 fyToken(n) 与 _rand =====
  let slideRecord = null;
  if (args.record && mod.fyObj && typeof mod.fyObj.startRecord === "function") {
    try {
      mod.fyObj.startRecord();
      await dispatchSlideTrajectory(window, document, args.distance);
      const slideCfg = {
        location: "cn",
        MaxMTLog: 300,
        MTInterval: 4,
        MinMTDwnLog: 30,
        MaxKSLog: 14,
        MaxFocusLog: 6,
        MaxNGPLog: 200,
        NGPInterval: 4,
        Enable: 3,
        _umopt_npfp: 1,
        reqUrl,
      };
      const fyToken = mod.fyObj.getFYToken(slideCfg);
      let _rand = null;
      try {
        if (window.crypto && typeof window.crypto.genRandomValues === "function") {
          _rand = window.crypto.genRandomValues(fyToken);
        }
      } catch (e) {
        _rand = "ERR:" + e.message;
      }
      slideRecord = {
        fyToken,
        _rand: _rand == null ? null : String(_rand),
        cryptoKeys: Object.keys(window.crypto || {}),
      };
      console.error(
        "[slide] startRecord+轨迹 => fyToken(" +
          String(fyToken).length +
          ") _rand=" +
          (_rand == null ? "null" : String(_rand))
      );
    } catch (e) {
      console.error("[slide] 录制异常:", e.message);
    }
  }

  const tryCall = () => {
    const n = {
      location: "cn",
      MaxMTLog: 20,
      MaxNGPLog: 10,
      MaxKSLog: 5,
      MaxFocusLog: 3,
      reqUrl,
      loadTime: 120,
      timeout: 2000,
    };
    if (mod.fyObj && typeof mod.fyObj.getFYToken === "function") {
      // 尝试通过 fyObj.getUidToken 获取 umidToken（需要在同一环境中已初始化 um 模块）
      let fyUmidToken = null;
      if (mod.fyObj.getUidToken) {
        try {
          fyUmidToken = mod.fyObj.getUidToken(n);
          if (fyUmidToken && !String(fyUmidToken).startsWith("default")) {
            console.error("[bx] fyObj.getUidToken 成功: " + String(fyUmidToken));
          }
        } catch (e) {
          console.error("[bx] fyObj.getUidToken 异常:", e.message);
        }
      }
      return {
        "bx-ua": mod.fyObj.getFYToken(n),
        "bx-umidtoken": fyUmidToken || umidToken || (mod.fyObj.getUidToken ? mod.fyObj.getUidToken(n) : null),
        via: "fyObj",
      };
    }
    return {
      "bx-ua": mod.getFYToken(reqUrl),
      "bx-umidtoken": umidToken || (mod.getUidToken ? mod.getUidToken() : null),
      via: "wrapper",
    };
  };

  let result;
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      result = tryCall();
      if (result["bx-ua"] && !String(result["bx-ua"]).startsWith("defaultFY")) break;
      lastErr = result["bx-ua"];
      await sleep(400);
    } catch (e) {
      lastErr = e;
      await sleep(400);
    }
  }

  const ok =
    result &&
    result["bx-ua"] &&
    !String(result["bx-ua"]).startsWith("defaultFY") &&
    String(result["bx-ua"]).length > 20;

  const out = {
    ok: !!ok,
    via: result && result.via,
    reqUrl,
    "bx-ua": result && result["bx-ua"],
    "bx-umidtoken": result && result["bx-umidtoken"],
    lengths: {
      ua: result && result["bx-ua"] ? String(result["bx-ua"]).length : 0,
      umid: result && result["bx-umidtoken"] ? String(result["bx-umidtoken"]).length : 0,
    },
    error: ok ? null : String(lastErr && (lastErr.stack || lastErr.message || lastErr)),
    fyKeys: mod.fyObj ? Object.keys(mod.fyObj) : Object.keys(mod),
    slide: slideRecord,
    tip: ok
      ? "本地已出参。若服务端拒绝，需继续对比浏览器环境差异（canvas/字体/WebGL/时序）。"
      : "仍失败：用 DEBUG_ENV=1 重跑看缺哪些 API，或把报错栈发我继续补。",
  };

  // 关闭 jsdom 环境，释放 pretendToBeVisual 等内部定时器，避免外部 require 调用后进程不退出
  try {
    window.close();
  } catch (_) {}

  return out;
}


async function main() {
  const args = parseArgs(process.argv);
  const out = await generateBxParams({
    url: args.url,
    record: args.record,
    distance: args.distance,
    timeout: args.timeout,
  });
  const ok = out.ok;

  if (args.json) console.log(JSON.stringify(out, null, 2));
  else if (!ok) {
    console.error("生成失败:", out.error);
    console.error(JSON.stringify({ fyKeys: out.fyKeys, tip: out.tip }, null, 2));
    process.exit(3);
  } else {
    console.log("via:", out.via);
    console.log("bx-ua:");
    console.log(out["bx-ua"]);
    console.log("");
    console.log("bx-umidtoken:");
    console.log(out["bx-umidtoken"]);
    console.log("");
    console.log("lengths:", out.lengths);
    console.log(out.tip);
  }

  process.exit(ok ? 0 : 3);
}

module.exports = {
  generateBxParams,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
