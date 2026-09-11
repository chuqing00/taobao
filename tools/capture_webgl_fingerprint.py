# -*- coding: utf-8 -*-
"""
从真实 Chromium 抓取 fireeye SDK 采集的完整指纹，输出 ground-truth JSON，
用于重写 run_bx_ua_local.js 的 fakeWebGL / patchEnv。

采集点严格对标 access_log.txt 里 fireeye 读到的每一项：
  - WebGL1 / WebGL2 的 getParameter 全套
  - getSupportedExtensions / getExtension(...)
  - getShaderPrecisionFormat 全组合
  - WebGL 常量属性（MAX_TEXTURE_SIZE 等）
  - canvas 2d clearRect 后的 toDataURL
  - navigator/performance 特性
"""
import json
import sys

from playwright.sync_api import sync_playwright

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# fireeye 读到的 getParameter 参数号（来自 access_log.txt）
GETPARAM_KEYS = [
    3379, 3386, 33901, 33902, 34024, 34047, 34076,
    3410, 3411, 3412, 3413, 3414, 3415,
    34921, 34930, 35660, 35661,
    36347, 36348, 36349,
    37445, 37446,
    7936, 7937, 7938, 35724,
]

CONSTANT_NAMES = [
    "MAX_TEXTURE_SIZE", "MAX_TEXTURE_IMAGE_UNITS", "MAX_VERTEX_TEXTURE_IMAGE_UNITS",
    "MAX_VERTEX_UNIFORM_VECTORS", "MAX_TEXTURE_LOD_BIAS", "MAX_UNIFORM_BLOCK_SIZE",
    "MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS", "MAX_COMBINED_UNIFORM_BLOCKS",
    "MAX_UNIFORM_BUFFER_BINDINGS", "MAX_VARYING_VECTORS", "MAX_FRAGMENT_UNIFORM_VECTORS",
    "MAX_COMBINED_TEXTURE_IMAGE_UNITS", "MAX_CUBE_MAP_TEXTURE_SIZE", "MAX_RENDERBUFFER_SIZE",
    "MAX_VERTEX_ATTRIBS", "MAX_VERTEX_UNIFORM_COMPONENTS", "MAX_TEXTURE_MAX_ANISOTROPY_EXT",
    "COLOR_BUFFER_BIT", "DEPTH_BUFFER_BIT", "DEPTH_TEST", "LEQUAL", "ARRAY_BUFFER",
    "STATIC_DRAW", "TRIANGLE_STRIP", "FLOAT", "VERTEX_SHADER", "FRAGMENT_SHADER",
    "COMPILE_STATUS", "LINK_STATUS", "TEXTURE_2D", "RGBA", "UNSIGNED_BYTE",
    "FRAMEBUFFER", "TRIANGLES", "NEAREST",
]

SHADER_TYPES = [35632, 35633]  # VERTEX_SHADER, FRAGMENT_SHADER
PRECISIONS = [36336, 36337, 36338, 36339, 36340, 36341]  # LOW/MED/HIGH FLOAT, LOW/MED/HIGH INT

EXTENSIONS = ["WEBGL_debug_renderer_info", "EXT_texture_filter_anisotropic", "WEBGL_lose_context"]


def serialize(v):
    """把 WebGL 返回值转成可 JSON 序列化的形式"""
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, (list, tuple)):
        return [serialize(x) for x in v]
    if hasattr(v, "length") and not isinstance(v, (str, dict)):
        # typed array / array-like
        try:
            return ["<typed>", list(v)]
        except Exception:
            return ["<typed>", [str(v)]]
    try:
        return str(v)
    except Exception:
        return "<unserializable>"


def capture_webgl(gl):
    out = {"params": {}, "constants": {}, "extensions": [], "precision": {}, "attrs": None}

    # getParameter 全套
    for k in GETPARAM_KEYS:
        try:
            out["params"][str(k)] = serialize(gl.getParameter(k))
        except Exception as e:
            out["params"][str(k)] = "<err:%s>" % e

    # getParameter() 无参（fireeye 读到了 getParameter(undefined)）
    try:
        out["params"]["_undefined_"] = serialize(gl.getParameter())
    except Exception:
        out["params"]["_undefined_"] = "<err>"

    # 常量属性
    for name in CONSTANT_NAMES:
        try:
            v = gl[name]
            out["constants"][name] = serialize(v)
        except Exception:
            out["constants"][name] = "<err>"

    # getSupportedExtensions
    try:
        out["extensions"] = list(gl.getSupportedExtensions() or [])
    except Exception as e:
        out["extensions"] = ["<err:%s>" % e]

    # getExtension 目标
    for ext in EXTENSIONS:
        try:
            e = gl.getExtension(ext)
            out["ext_" + ext] = serialize(e)
        except Exception:
            out["ext_" + ext] = None

    # getShaderPrecisionFormat 全组合
    for st in SHADER_TYPES:
        for p in PRECISIONS:
            try:
                r = gl.getShaderPrecisionFormat(st, p)
                out["precision"]["%d_%d" % (st, p)] = serialize(r)
            except Exception:
                out["precision"]["%d_%d" % (st, p)] = None

    # getContextAttributes
    try:
        out["attrs"] = serialize(gl.getContextAttributes())
    except Exception:
        out["attrs"] = None

    return out


JS = """
() => {
  const c1 = document.createElement('canvas'); c1.width = 300; c1.height = 150;
  const gl1 = c1.getContext('webgl');
  const c2 = document.createElement('canvas'); c2.width = 300; c2.height = 150;
  const gl2 = c2.getContext('webgl2');

  const nav = {};
  nav.userAgent = navigator.userAgent;
  nav.platform = navigator.platform;
  nav.hardwareConcurrency = navigator.hardwareConcurrency;
  nav.deviceMemory = navigator.deviceMemory;
  nav.maxTouchPoints = navigator.maxTouchPoints;
  nav.language = navigator.language;
  nav.languages = navigator.languages;
  nav.vendor = navigator.vendor;
  nav.webdriver = navigator.webdriver;
  nav.userAgentData = navigator.userAgentData ? {
      brands: navigator.userAgentData.brands, mobile: navigator.userAgentData.mobile, platform: navigator.userAgentData.platform
  } : null;
  nav.hasMediaKeySystemAccess = typeof navigator.requestMediaKeySystemAccess;
  nav.hasWakeLock = typeof navigator.wakeLock;
  nav.hasRequestMIDIAccess = typeof navigator.requestMIDIAccess;
  nav.hasGetBattery = typeof navigator.getBattery;
  nav.plugins = (navigator.plugins ? Array.from(navigator.plugins).map(p => p.name + '|' + p.filename) : null);
  nav.mimeTypes = (navigator.mimeTypes ? Array.from(navigator.mimeTypes).map(m => m.type) : null);

  const perf = {};
  perf.memory = performance.memory ? {
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      usedJSHeapSize: performance.memory.usedJSHeapSize
  } : null;
  perf.hasGetEntries = typeof performance.getEntries;
  perf.hasGetEntriesByName = typeof performance.getEntriesByName;
  perf.hasGetEntriesByType = typeof performance.getEntriesByType;
  perf.hasNavigation = typeof performance.navigation;
  perf.timeOrigin = performance.timeOrigin;
  perf.timingKeys = performance.timing ? Object.keys(performance.timing) : null;

  const scr = { width: screen.width, height: screen.height, availWidth: screen.availWidth,
      availHeight: screen.availHeight, colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth,
      dpr: window.devicePixelRatio, innerWidth: window.innerWidth, innerHeight: window.innerHeight };

  // canvas 2d 指纹（fireeye 只 clearRect 64x64 后 toDataURL）
  const cc = document.createElement('canvas'); cc.width = 64; cc.height = 64;
  const cctx = cc.getContext('2d');
  cctx.clearRect(0, 0, 64, 64);
  const canvas2dDataURL = cc.toDataURL();

  const histLen = history.length;

  return {
      webgl1: gl1 ? {
          params: (function(){ const o={}; const keys=[3379,3386,33901,33902,34024,34047,34076,3410,3411,3412,3413,3414,3415,34921,34930,35660,35661,36347,36348,36349,37445,37446,7936,7937,7938];
              keys.forEach(k=>{ try{ o[k]=gl1.getParameter(k); }catch(e){ o[k]='<err>'; } }); return o; })(),
          extensions: gl1.getSupportedExtensions ? Array.from(gl1.getSupportedExtensions()) : null,
          precision: (function(){ const o={}; [35632,35633].forEach(st=>[36336,36337,36338,36339,36340,36341].forEach(p=>{
              try{ const r=gl1.getShaderPrecisionFormat(st,p); o[st+'_'+p]=r?{rangeMin:r.rangeMin,rangeMax:r.rangeMax,precision:r.precision}:null; }catch(e){ o[st+'_'+p]=null; } })); return o; })(),
          constants: (function(){ const o={}; ['MAX_TEXTURE_SIZE','MAX_TEXTURE_IMAGE_UNITS','MAX_VERTEX_TEXTURE_IMAGE_UNITS','MAX_VERTEX_UNIFORM_VECTORS','MAX_TEXTURE_LOD_BIAS','MAX_UNIFORM_BLOCK_SIZE','MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS','MAX_COMBINED_UNIFORM_BLOCKS','MAX_UNIFORM_BUFFER_BINDINGS','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT','DEPTH_TEST','LEQUAL'].forEach(n=>{ try{ o[n]=gl1[n]; }catch(e){ o[n]='<err>'; } }); return o; })(),
          attrs: gl1.getContextAttributes ? gl1.getContextAttributes() : null,
          debugInfo: (function(){ const e=gl1.getExtension('WEBGL_debug_renderer_info'); return e?{vendor:gl1.getParameter(e.UNMASKED_VENDOR_WEBGL), renderer:gl1.getParameter(e.UNMASKED_RENDERER_WEBGL)}:null; })(),
          aniso: (function(){ const e=gl1.getExtension('EXT_texture_filter_anisotropic'); return e?e.MAX_TEXTURE_MAX_ANISOTROPY_EXT:null; })(),
      } : null,
      webgl2: gl2 ? {
          params: (function(){ const o={}; const keys=[3379,3386,33901,33902,34024,34047,34076,3410,3411,3412,3413,3414,3415,34921,34930,35660,35661,36347,36348,36349,37445,37446,7936,7937,7938,35724];
              keys.forEach(k=>{ try{ o[k]=gl2.getParameter(k); }catch(e){ o[k]='<err>'; } }); return o; })(),
          extensions: gl2.getSupportedExtensions ? Array.from(gl2.getSupportedExtensions()) : null,
          precision: (function(){ const o={}; [35632,35633].forEach(st=>[36336,36337,36338,36339,36340,36341].forEach(p=>{
              try{ const r=gl2.getShaderPrecisionFormat(st,p); o[st+'_'+p]=r?{rangeMin:r.rangeMin,rangeMax:r.rangeMax,precision:r.precision}:null; }catch(e){ o[st+'_'+p]=null; } })); return o; })(),
          constants: (function(){ const o={}; ['MAX_TEXTURE_SIZE','MAX_TEXTURE_IMAGE_UNITS','MAX_VERTEX_TEXTURE_IMAGE_UNITS','MAX_VERTEX_UNIFORM_VECTORS','MAX_TEXTURE_LOD_BIAS','MAX_UNIFORM_BLOCK_SIZE','MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS','MAX_COMBINED_UNIFORM_BLOCKS','MAX_UNIFORM_BUFFER_BINDINGS','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT','DEPTH_TEST','LEQUAL'].forEach(n=>{ try{ o[n]=gl2[n]; }catch(e){ o[n]='<err>'; } }); return o; })(),
          attrs: gl2.getContextAttributes ? gl2.getContextAttributes() : null,
      } : null,
      navigator: nav,
      performance: perf,
      screen: scr,
      historyLength: histLen,
      canvas2dDataURL: canvas2dDataURL.slice(0, 200),
  };
}
"""


def main():
    out = {}
    with sync_playwright() as p:
        # 用系统 Chrome（真实 GPU/WebGL），新 headless 模式支持 GPU
        browser = p.chromium.launch(channel="chrome", headless=False, args=["--headless=new"])
        context = browser.new_context(
            user_agent=UA, viewport={"width": 1463, "height": 867},
            device_scale_factor=1.75, locale="zh-CN", timezone_id="Asia/Shanghai",
        )
        page = context.new_page()
        # 用一个空白页即可，WebGL 指纹与页面内容无关
        page.goto("about:blank")
        result = page.evaluate(JS)
        browser.close()

    # 用 Python 再做一次可序列化规整（page.evaluate 已返回 JSON 兼容对象）
    with open("webgl_ground_truth.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("=== WebGL1 UNMASKED ===")
    print(json.dumps(result.get("webgl1", {}).get("debugInfo"), ensure_ascii=False))
    print("\n=== WebGL1 关键 params ===")
    w1 = result.get("webgl1", {}).get("params", {})
    for k in ["37445", "37446", "7936", "7937", "7938", "3379", "3386", "34930", "35660", "36347", "3410", "3414", "3415"]:
        print(f"  getParameter({k}) = {w1.get(k)}")
    print("\n=== WebGL1 constants (属性) ===")
    print(json.dumps(result.get("webgl1", {}).get("constants"), ensure_ascii=False))
    print("\n=== WebGL1 precision ===")
    print(json.dumps(result.get("webgl1", {}).get("precision"), ensure_ascii=False))
    print("\n=== navigator.userAgentData ===")
    print(json.dumps(result.get("navigator", {}).get("userAgentData"), ensure_ascii=False))
    print("\n=== navigator feature 类型 ===")
    nav = result.get("navigator", {})
    for k in ["hasMediaKeySystemAccess", "hasWakeLock", "hasRequestMIDIAccess", "hasGetBattery"]:
        print(f"  {k} = {nav.get(k)}")
    print("\n=== performance ===")
    print(json.dumps(result.get("performance"), ensure_ascii=False))
    print("\n=== screen ===")
    print(json.dumps(result.get("screen"), ensure_ascii=False))
    print("\n已保存到 webgl_ground_truth.json")


if __name__ == "__main__":
    main()
