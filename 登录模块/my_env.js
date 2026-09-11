(function () {
    'use strict';
    var nodeCrypto = require('crypto');
    var cookieJar = {};
    /* ===================== document ===================== */
    var documentShim = {};

    Object.defineProperty(documentShim, 'cookie', {
        get: function () {
            var out = [];
            for (var k in cookieJar) {
                if (Object.prototype.hasOwnProperty.call(cookieJar, k)) {
                    out.push(k + '=' + cookieJar[k]);
                }
            }
            return out.join('; ');
        },
        set: function (val) {
            var segs = String(val).split(';');
            var first = segs[0];
            var eq = first.indexOf('=');
            var name = (eq >= 0 ? first.slice(0, eq) : first).trim();
            var value = eq >= 0 ? first.slice(eq + 1).trim() : '';
            var expired = false;
            for (var i = 1; i < segs.length; i++) {
                var s = segs[i].trim();
                var low = s.toLowerCase();
                if (low.indexOf('expires=') === 0) {
                    if (new Date(s.slice(8)).getTime() < Date.now()) expired = true;
                } else if (low.indexOf('max-age=0') === 0) {
                    expired = true;
                }
            }
            if (expired) delete cookieJar[name];
            else cookieJar[name] = value;
        }
    });

    function makeElement(tag) {
        var el = {
            tagName: (tag || 'div').toUpperCase(),
            nodeName: (tag || 'div').toUpperCase(),
            style: {},
            children: [],
            attributes: {},
            width: 0,
            height: 0,
            innerHTML: '',
            setAttribute: function (k, v) {
                el.attributes[k] = String(v);
            },
            getAttribute: function (k) {
                return el.attributes[k];
            },
            removeAttribute: function (k) {
                delete el.attributes[k];
            },
            appendChild: function (c) {
                el.children.push(c);
                return c;
            },
            removeChild: function (c) {
                var i = el.children.indexOf(c);
                if (i >= 0) el.children.splice(i, 1);
                return c;
            },
            insertBefore: function (c, ref) {
                var i = ref ? el.children.indexOf(ref) : -1;
                if (i < 0) el.children.push(c);
                else el.children.splice(i, 0, c);
                return c;
            },
            getContext: function (type) {
                var t = String(type || '2d').toLowerCase();
                if (t === 'webgl' || t === 'experimental-webgl' || t === 'webgl2' || t === 'experimental-webgl2') {
                    return makeWebGLContext();
                }
                return makeContext2D();
            },
            toDataURL: function () {
                return 'data:image/png;base64,';
            },
            addEventListener: function () {
            },
            removeEventListener: function () {
            },
            attachEvent: function () {
            },
            detachEvent: function () {
            },
            getElementsByTagName: function () {
                return [];
            },
            getElementsByClassName: function () {
                return [];
            },
            getBoundingClientRect: function () {
                return {top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0};
            }
        };
        return el;
    }

    function makeContext2D() {
        // 供 canvas 指纹检测使用的最小 2D 上下文 mock。
        var grad = {
            addColorStop: function () {
            }
        };
        return {
            canvas: null,
            fillStyle: '#000000',
            strokeStyle: '#000000',
            lineWidth: 1,
            font: '10px sans-serif',
            textBaseline: 'alphabetic',
            textAlign: 'start',
            globalAlpha: 1,
            globalCompositeOperation: 'source-over',
            fillRect: function () {
            },
            strokeRect: function () {
            },
            clearRect: function () {
            },
            fillText: function () {
            },
            strokeText: function () {
            },
            measureText: function (t) {
                return {width: (t ? String(t).length : 0) * 6};
            },
            beginPath: function () {
            },
            closePath: function () {
            },
            moveTo: function () {
            },
            lineTo: function () {
            },
            bezierCurveTo: function () {
            },
            quadraticCurveTo: function () {
            },
            arc: function () {
            },
            arcTo: function () {
            },
            rect: function () {
            },
            fill: function () {
            },
            stroke: function () {
            },
            clip: function () {
            },
            save: function () {
            },
            restore: function () {
            },
            scale: function () {
            },
            rotate: function () {
            },
            translate: function () {
            },
            transform: function () {
            },
            setTransform: function () {
            },
            createLinearGradient: function () {
                return grad;
            },
            createRadialGradient: function () {
                return grad;
            },
            createPattern: function () {
                return null;
            },
            drawImage: function () {
            },
            getImageData: function () {
                return {data: [], width: 0, height: 0};
            },
            putImageData: function () {
            }
        };
    }

    function makeWebGLContext() {
        // 供 WebGL 指纹检测使用的最小上下文 mock。
        var debugExt = {
            UNMASKED_VENDOR_WEBGL: 37445,
            UNMASKED_RENDERER_WEBGL: 37446
        };

        var extensions = [
            'ANGLE_instanced_arrays',
            'EXT_blend_minmax',
            'EXT_color_buffer_half_float',
            'EXT_disjoint_timer_query',
            'EXT_texture_filter_anisotropic',
            'OES_element_index_uint',
            'OES_standard_derivatives',
            'OES_texture_float',
            'OES_texture_float_linear',
            'OES_texture_half_float',
            'OES_texture_half_float_linear',
            'OES_vertex_array_object',
            'WEBGL_compressed_texture_s3tc',
            'WEBGL_debug_renderer_info',
            'WEBGL_debug_shaders',
            'WEBGL_depth_texture',
            'WEBGL_draw_buffers',
            'WEBGL_lose_context'
        ];

        var params = {
            7936: 'Google Inc.',
            7937: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
            7938: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
            35724: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)',
            37445: 'Google Inc. (NVIDIA)',
            37446: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
            34076: 80,
            34921: 16,
            36347: 4096,
            36348: 16,
            36349: 16,
            35660: 16,
            35661: 8,
            3379: 8192,
            34024: 8192,
            34930: 8192,
            3410: 8,
            3411: 8,
            3412: 8,
            3413: 8,
            3414: 24,
            3415: 8,
            33901: [1, 1024],
            33902: [1, 1],
            3386: [16384, 16384],
            7939: 1,
            7940: 1,
            7941: 1,
            7942: 1
        };

        return {
            canvas: null,
            drawingBufferWidth: 300,
            drawingBufferHeight: 150,
            VENDOR: 7936,
            RENDERER: 7937,
            VERSION: 7938,
            SHADING_LANGUAGE_VERSION: 35724,
            MAX_TEXTURE_SIZE: 3379,
            MAX_VIEWPORT_DIMS: 3386,
            MAX_VERTEX_ATTRIBS: 34921,
            MAX_TEXTURE_IMAGE_UNITS: 35660,
            MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35661,
            ALIASED_LINE_WIDTH_RANGE: 33902,
            ALIASED_POINT_SIZE_RANGE: 33901,
            RED_BITS: 3410,
            GREEN_BITS: 3411,
            BLUE_BITS: 3412,
            ALPHA_BITS: 3413,
            DEPTH_BITS: 3414,
            STENCIL_BITS: 3415,
            COLOR_BUFFER_BIT: 16384,
            DEPTH_BUFFER_BIT: 256,
            STENCIL_BUFFER_BIT: 1024,
            DEPTH_TEST: 2929,
            CULL_FACE: 2884,
            BLEND: 3042,
            LEQUAL: 515,
            LESS: 513,
            ONE: 1,
            ZERO: 0,
            SRC_ALPHA: 770,
            ONE_MINUS_SRC_ALPHA: 771,
            FRAGMENT_SHADER: 35632,
            VERTEX_SHADER: 35633,
            COMPILE_STATUS: 35713,
            LINK_STATUS: 35714,
            ARRAY_BUFFER: 34962,
            ELEMENT_ARRAY_BUFFER: 34963,
            STATIC_DRAW: 35044,
            FLOAT: 5126,
            TRIANGLES: 4,
            TEXTURE_2D: 3553,
            TEXTURE0: 33984,
            TEXTURE_MIN_FILTER: 10241,
            TEXTURE_MAG_FILTER: 10240,
            NEAREST: 9728,
            LINEAR: 9729,
            RGBA: 6408,
            UNSIGNED_BYTE: 5121,
            getExtension: function (name) {
                if (name === 'WEBGL_debug_renderer_info') return debugExt;
                if (name === 'WEBGL_lose_context') {
                    return {
                        loseContext: function () {
                        }, restoreContext: function () {
                        }
                    };
                }
                if (extensions.indexOf(name) >= 0) return {};
                return null;
            },
            getSupportedExtensions: function () {
                return extensions.slice();
            },
            getParameter: function (pname) {
                if (pname === 33901) return [1, 1024];
                if (pname === 33902) return [1, 1];
                if (Object.prototype.hasOwnProperty.call(params, pname)) return params[pname];
                return null;
            },
            getContextAttributes: function () {
                return {
                    alpha: true,
                    antialias: true,
                    depth: true,
                    failIfMajorPerformanceCaveat: false,
                    powerPreference: 'default',
                    premultipliedAlpha: true,
                    preserveDrawingBuffer: false,
                    stencil: false
                };
            },
            getShaderPrecisionFormat: function () {
                return {rangeMin: 127, rangeMax: 127, precision: 23};
            },
            getError: function () {
                return 0;
            },
            isContextLost: function () {
                return false;
            },
            getProgramParameter: function () {
                return true;
            },
            getShaderParameter: function () {
                return true;
            },
            createBuffer: function () {
                return {};
            },
            createProgram: function () {
                return {};
            },
            createShader: function () {
                return {};
            },
            createTexture: function () {
                return {};
            },
            bindBuffer: function () {
            },
            bindTexture: function () {
            },
            bufferData: function () {
            },
            deleteBuffer: function () {
            },
            deleteTexture: function () {
            },
            deleteProgram: function () {
            },
            deleteShader: function () {
            },
            shaderSource: function (shader, source) {
                if (shader) shader.source = source;
            },
            compileShader: function (shader) {
                if (shader) shader.compileStatus = true;
            },
            getShaderInfoLog: function () {
                return '';
            },
            getProgramInfoLog: function () {
                return '';
            },
            attachShader: function () {
            },
            linkProgram: function () {
            },
            useProgram: function () {
            },
            getUniformLocation: function () {
                return {};
            },
            getAttribLocation: function () {
                return 0;
            },
            enableVertexAttribArray: function () {
            },
            disableVertexAttribArray: function () {
            },
            vertexAttribPointer: function () {
            },
            uniform1f: function () {
            },
            uniform2f: function () {
            },
            uniform3f: function () {
            },
            uniform4f: function () {
            },
            uniform1i: function () {
            },
            drawArrays: function () {
            },
            drawElements: function () {
            },
            clearColor: function () {
            },
            clear: function () {
            },
            viewport: function () {
            },
            enable: function () {
            },
            disable: function () {
            },
            depthFunc: function () {
            },
            depthMask: function () {
            },
            blendFunc: function () {
            },
            frontFace: function () {
            },
            cullFace: function () {
            },
            pixelStorei: function () {
            },
            activeTexture: function () {
            },
            generateMipmap: function () {
            },
            texParameteri: function () {
            },
            texImage2D: function () {
            },
            readPixels: function () {
                return new Uint8Array(4);
            }
        };
    }

    documentShim.createElement = function (tag) {
        return makeElement(tag);
    };
    documentShim.createElementNS = function (ns, tag) {
        return makeElement(tag);
    };
    documentShim.getElementsByTagName = function (tag) {
        return tag && String(tag).toLowerCase() === 'head' ? [makeElement('head')] : [];
    };
    documentShim.getElementsByClassName = function () {
        return [];
    };
    documentShim.getElementById = function () {
        return null;
    };
    documentShim.getElementsByName = function () {
        return [];
    };
    documentShim.querySelector = function () {
        return null;
    };
    documentShim.querySelectorAll = function () {
        return [];
    };
    documentShim.body = makeElement('body');
    documentShim.head = makeElement('head');
    documentShim.documentElement = makeElement('html');
    documentShim.readyState = 'complete';
    documentShim.hidden = false;
    documentShim.visibilityState = 'visible';
    documentShim.title = '';
    documentShim.referrer = 'https://www.taobao.com/';
    documentShim.URL = 'https://www.taobao.com/';
    documentShim.domain = 'taobao.com';
    documentShim.characterSet = 'UTF-8';
    documentShim.charset = 'UTF-8';
    documentShim.attachEvent = undefined;
    documentShim.detachEvent = undefined;
    documentShim.addEventListener = function (type, listener, options) {
        (documentEvents[type] = documentEvents[type] || []).push(listener);
        return undefined;
    };
    documentShim.removeEventListener = function (type, listener) {
        var arr = documentEvents[type];
        if (arr) {
            var i = arr.indexOf(listener);
            if (i >= 0) arr.splice(i, 1);
        }
    };

    /* ===================== location ===================== */
    var locationShim = {
        hostname: 'login.taobao.com',
        host: 'login.taobao.com',
        href: 'https://login.taobao.com/member/login.jhtml',
        origin: 'https://login.taobao.com',
        protocol: 'https:',
        pathname: '/member/login.jhtml',
        search: '',
        hash: '',
        port: '',
        assign: function () {
        },
        replace: function () {
        },
        reload: function () {
        }
    };

    /* ===================== navigator ===================== */
    var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

    function makePluginArrayLike() {
        return {
            length: 0,
            item: function () {
                return null;
            },
            namedItem: function () {
                return null;
            },
            refresh: function () {
            }
        };
    }

    function makeQuotaStorage(grantedBytes) {
        return {
            queryUsageAndQuota: function (callback, errorCallback) {
                try {
                    callback(0, grantedBytes);
                } catch (e) {
                    if (errorCallback) errorCallback(e);
                }
            },
            requestQuota: function (size, callback, errorCallback) {
                try {
                    callback(grantedBytes);
                } catch (e) {
                    if (errorCallback) errorCallback(e);
                }
            }
        };
    }

    var navigatorShim = {
        userAgent: ua,
        appVersion: ua,
        appName: 'Netscape',
        appCodeName: 'Mozilla',
        product: 'Gecko',
        productSub: '20030107',
        vendor: 'Google Inc.',
        vendorSub: '',
        platform: 'Win32',
        language: 'zh-CN',
        languages: ['zh-CN', 'zh', 'en'],
        cookieEnabled: true,
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
        webdriver: false,
        onLine: true,
        doNotTrack: null,
        deviceMemory: 8,
        pdfViewerEnabled: true,
        plugins: makePluginArrayLike(),
        mimeTypes: makePluginArrayLike(),
        connection: {effectiveType: '4g', rtt: 50, downlink: 10, saveData: false},
        webkitTemporaryStorage: makeQuotaStorage(1000 * 1024 * 1024),
        webkitPersistentStorage: makeQuotaStorage(1000 * 1024 * 1024),
        storage: {
            estimate: function () {
                return Promise.resolve({quota: 1073741824, usage: 0});
            },
            persist: function () {
                return Promise.resolve(true);
            },
            persisted: function () {
                return Promise.resolve(false);
            }
        },
        mediaDevices: makeMediaDevices()
    };

    /* ===================== storage ===================== */
    function makeStorage() {
        var data = {};
        var base = {
            getItem: function (k) {
                return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
            },
            setItem: function (k, v) {
                data[k] = String(v);
            },
            removeItem: function (k) {
                delete data[k];
            },
            clear: function () {
                data = {};
            },
            key: function (i) {
                return Object.keys(data)[i] || null;
            },
            get length() {
                return Object.keys(data).length;
            }
        };
        return new Proxy(base, {
            get: function (t, prop) {
                if (prop === 'getItem' || prop === 'setItem' || prop === 'removeItem' ||
                    prop === 'clear' || prop === 'key' || prop === 'length') {
                    return t[prop];
                }
                if (typeof prop === 'symbol') return t[prop];
                return Object.prototype.hasOwnProperty.call(data, prop) ? data[prop] : null;
            },
            set: function (t, prop, value) {
                data[prop] = String(value);
                return true;
            },
            has: function (t, prop) {
                return Object.prototype.hasOwnProperty.call(data, prop) || prop in t;
            }
        });
    }

    var localStorageShim = makeStorage();
    var sessionStorageShim = makeStorage();

    /* ===================== performance ===================== */
    var perfStart = Date.now();
    var performanceShim = {
        now: function () {
            return Date.now() - perfStart;
        },
        timing: {
            navigationStart: perfStart,
            domComplete: perfStart,
            loadEventEnd: perfStart,
            domContentLoadedEventEnd: perfStart,
            connectStart: perfStart,
            connectEnd: perfStart,
            requestStart: perfStart,
            responseStart: perfStart,
            responseEnd: perfStart,
            domLoading: perfStart,
            domInteractive: perfStart,
            fetchStart: perfStart,
            domainLookupStart: perfStart,
            domainLookupEnd: perfStart,
            unloadEventStart: perfStart,
            unloadEventEnd: perfStart
        },
        navigation: {type: 1, redirectCount: 0},
        getEntries: function () {
            return [];
        },
        getEntriesByName: function () {
            return [];
        },
        getEntriesByType: function () {
            return [];
        },
        clearResourceTimings: function () {
        },
        setResourceTimingBufferSize: function () {
        },
        markResourceTiming: function () {
        },
        mark: function () {
        },
        measure: function () {
        },
        clearMarks: function () {
        },
        clearMeasures: function () {
        }
    };

    /* ===================== screen ===================== */
    var screenShim = {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24,
        availLeft: 0,
        availTop: 0,
        orientation: {type: 'landscape-primary', angle: 0}
    };

    /* ===================== history ===================== */
    var historyShim = {
        length: 1,
        scrollRestoration: 'auto',
        state: null,
        back: function () {
        },
        forward: function () {
        },
        go: function () {
        },
        pushState: function () {
        },
        replaceState: function () {
        }
    };

    /* ===================== Image ===================== */
    function ImageShim() {
        this.src = '';
        this.width = 0;
        this.height = 0;
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        this.complete = false;
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
    }

    /* ===================== Audio / 字体 ===================== */
    function makeAudioParam(value) {
        return {
            value: value,
            setValueAtTime: function () {},
            linearRampToValueAtTime: function () {},
            exponentialRampToValueAtTime: function () {}
        };
    }
    function makeOscillator() {
        return {
            type: 'sine',
            frequency: makeAudioParam(440),
            detune: makeAudioParam(0),
            connect: function () {},
            disconnect: function () {},
            start: function () {},
            stop: function () {}
        };
    }
    function makeDynamicsCompressor() {
        return {
            threshold: makeAudioParam(-50),
            knee: makeAudioParam(40),
            ratio: makeAudioParam(12),
            attack: makeAudioParam(0),
            release: makeAudioParam(0.25),
            connect: function () {},
            disconnect: function () {}
        };
    }
    function makeAudioBuffer(length, sampleRate, channels) {
        var ch = [];
        var i, c;
        for (c = 0; c < channels; c++) {
            var data = new Float32Array(length);
            for (i = 0; i < length; i++) {
                data[i] = Math.sin(i * 0.1) * 0.5 + Math.sin(i * 0.013) * 0.3 + Math.sin(i * 0.0017) * 0.2;
            }
            ch.push(data);
        }
        return {
            length: length,
            duration: length / sampleRate,
            sampleRate: sampleRate,
            numberOfChannels: channels,
            getChannelData: function (n) { return ch[n] || ch[0]; }
        };
    }
    function makeAudioContext(channels, length, sampleRate) {
        channels = channels || 2;
        length = length || 44100;
        sampleRate = sampleRate || 44100;
        var ctx = {
            destination: {},
            sampleRate: sampleRate,
            currentTime: 0,
            state: 'running',
            createOscillator: function () { return makeOscillator(); },
            createDynamicsCompressor: function () { return makeDynamicsCompressor(); },
            createGain: function () {
                return { gain: makeAudioParam(1), connect: function () {}, disconnect: function () {} };
            },
            createBuffer: function () { return makeAudioBuffer(length, sampleRate, channels); },
            startRendering: function () { return Promise.resolve(makeAudioBuffer(length, sampleRate, channels)); },
            close: function () { return Promise.resolve(); },
            suspend: function () { return Promise.resolve(); },
            resume: function () { return Promise.resolve(); }
        };
        return ctx;
    }
    function AudioContextShim() { return makeAudioContext(2, 44100, 44100); }
    function OfflineAudioContextShim(channels, length, sampleRate) { return makeAudioContext(channels, length, sampleRate); }

    documentShim.fonts = {
        status: 'loaded',
        ready: Promise.resolve(),
        check: function () { return true; },
        forEach: function () {},
        add: function () {},
        delete: function () {},
        clear: function () {},
        values: function () { return []; },
        keys: function () { return []; },
        entries: function () { return []; },
        size: 0
    };

    /* ===================== WebRTC ===================== */
    function RTCSessionDescriptionShim(desc) {
        desc = desc || {};
        this.type = desc.type || '';
        this.sdp = desc.sdp || '';
        this.toJSON = function () { return {type: this.type, sdp: this.sdp}; };
    }
    function RTCIceCandidateShim(init) {
        init = init || {};
        this.candidate = init.candidate || '';
        this.sdpMid = init.sdpMid || null;
        this.sdpMLineIndex = init.sdpMLineIndex || null;
        this.toJSON = function () {
            return {candidate: this.candidate, sdpMid: this.sdpMid, sdpMLineIndex: this.sdpMLineIndex};
        };
    }
    function RTCPeerConnectionShim() {
        var self = this;
        var fakeSdp = 'v=0\r\no=- 46117314 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic: WMS\r\n' +
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\n' +
            'a=ice-ufrag:9r2b\r\na=ice-pwd:pass\r\na=fingerprint:sha-256 A1:B2:C3:D4:E5:F6\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n';
        this.localDescription = null;
        this.remoteDescription = null;
        this.iceConnectionState = 'new';
        this.iceGatheringState = 'new';
        this.signalingState = 'stable';
        this.connectionState = 'new';
        this.onicecandidate = null;
        this.oniceconnectionstatechange = null;
        this.onsignalingstatechange = null;
        this.ondatachannel = null;
        this.ontrack = null;
        this.createDataChannel = function (label) {
            return {label: label || '', readyState: 'open', close: function () {}, send: function () {}};
        };
        this.createOffer = function () {
            return Promise.resolve(new RTCSessionDescriptionShim({type: 'offer', sdp: fakeSdp}));
        };
        this.createAnswer = function () {
            return Promise.resolve(new RTCSessionDescriptionShim({type: 'answer', sdp: fakeSdp}));
        };
        this.setLocalDescription = function (desc) {
            self.localDescription = desc;
            return Promise.resolve();
        };
        this.setRemoteDescription = function (desc) {
            self.remoteDescription = desc;
            return Promise.resolve();
        };
        this.addIceCandidate = function () { return Promise.resolve(); };
        this.close = function () {};
        this.getStats = function () { return Promise.resolve(new Map()); };
        this.getSenders = function () { return []; };
        this.getReceivers = function () { return []; };
        this.addTrack = function () {};
        this.removeTrack = function () {};
    }
    function makeMediaDevices() {
        return {
            enumerateDevices: function () {
                return Promise.resolve([]);
            },
            getUserMedia: function () {
                return Promise.reject(new Error('NotAllowedError'));
            }
        };
    }

    /* ===================== 常用 HTML 元素构造器 ===================== */
    function makeHtmlElementCtor(name) {
        function El() {
        }

        El.prototype = Object.create({
            tagName: (name || 'HTMLElement').toUpperCase(),
            nodeName: (name || 'HTMLElement').toUpperCase(),
            style: {},
            children: [],
            setAttribute: function () {
            },
            getAttribute: function () {
                return null;
            },
            appendChild: function (c) {
                this.children.push(c);
                return c;
            },
            removeChild: function () {
                return null;
            }
        });
        El.prototype.constructor = El;
        return El;
    }

    var HTMLAnchorElementShim = makeHtmlElementCtor('HTMLAnchorElement');
    var HTMLInputElementShim = makeHtmlElementCtor('HTMLInputElement');
    var HTMLCanvasElementShim = makeHtmlElementCtor('HTMLCanvasElement');
    var HTMLImageElementShim = makeHtmlElementCtor('HTMLImageElement');
    var HTMLDivElementShim = makeHtmlElementCtor('HTMLDivElement');
    var HTMLElementShim = makeHtmlElementCtor('HTMLElement');

    // DOM 核心构造函数：fireye 会检查 Document.prototype / Element.prototype 等，
    // 需要让这些构造函数的原型具备原生浏览器中的访问器属性。
    function makeDomCtor(name, accessors) {
        function C() {}
        var proto = {};
        accessors = accessors || {};
        for (var k in accessors) {
            (function (key, val) {
                Object.defineProperty(proto, key, {
                    get: function () { return val; },
                    set: function (v) {},
                    configurable: true,
                    enumerable: true
                });
            })(k, accessors[k]);
        }
        C.prototype = proto;
        proto.constructor = C;
        return C;
    }

    var DocumentShim = makeDomCtor('Document', {
        head: makeElement('head'),
        body: makeElement('body'),
        documentElement: makeElement('html'),
        title: '',
        referrer: 'https://www.taobao.com/',
        cookie: '',
        readyState: 'complete',
        hidden: false,
        visibilityState: 'visible',
        characterSet: 'UTF-8'
    });
    var HTMLDocumentShim = DocumentShim;
    var ElementShim = makeHtmlElementCtor('Element');
    var NodeShim = makeHtmlElementCtor('Node');
    var EventTargetShim = function EventTarget() {};

    /* ===================== 挂载到全局 ===================== */
    // Node 22 中 navigator / performance / crypto 等已是只读 getter，
    // 统一用 defineProperty 覆盖，避免直接赋值报错。
    function defineGlobal(name, value) {
        Object.defineProperty(globalThis, name, {
            value: value,
            configurable: true,
            writable: true,
            enumerable: false
        });
    }

    defineGlobal('window', globalThis);
    defineGlobal('self', globalThis);
    defineGlobal('top', globalThis);
    defineGlobal('parent', globalThis);
    defineGlobal('globalThis', globalThis);
    var windowEvents = {};
    var documentEvents = {};
    defineGlobal('addEventListener', function (type, listener, options) {
        (windowEvents[type] = windowEvents[type] || []).push(listener);
        return undefined;
    });
    defineGlobal('removeEventListener', function (type, listener) {
        var arr = windowEvents[type];
        if (arr) {
            var i = arr.indexOf(listener);
            if (i >= 0) arr.splice(i, 1);
        }
    });
    defineGlobal('dispatchEvent', function (ev) {
        var arr = windowEvents[ev && ev.type] || [];
        for (var i = 0; i < arr.length; i++) {
            try { arr[i].call(globalThis, ev); } catch (e) {}
        }
        return true;
    });
    // 供外部模拟用户行为事件：__fireye_emit('mousemove', {pageX:1,pageY:2,...})
    globalThis.__fireye_emit = function (type, ev) {
        ev = ev || {};
        ev.type = type;
        var wa = windowEvents[type] || [];
        for (var i = 0; i < wa.length; i++) {
            try { wa[i].call(globalThis, ev); } catch (e) {}
        }
        var da = documentEvents[type] || [];
        for (var j = 0; j < da.length; j++) {
            try { da[j].call(documentShim, ev); } catch (e) {}
        }
        return true;
    };
    globalThis.__fireye_listeners = function () {
        var out = [];
        for (var k in windowEvents) out.push(k);
        for (var k2 in documentEvents) out.push('document:' + k2);
        return out;
    };
    // 模拟一段真实的登录交互：移动鼠标、点击输入框、敲键盘、滚动等。
    // 调用后会累加 fireye 的行为计数器，让 getUBHeader 值更接近真实浏览器。
    globalThis.__fireye_simulate = function () {
        var fireyeModule = globalThis.__fyModule;
        if (fireyeModule && typeof fireyeModule.startRecord === 'function') {
            try { fireyeModule.startRecord(); } catch (e) {}
        }
        function ev(extra) {
            var e = {
                type: '',
                pageX: 0,
                pageY: 0,
                clientX: 0,
                clientY: 0,
                screenX: 0,
                screenY: 0,
                button: 0,
                which: 1,
                keyCode: 0,
                key: '',
                preventDefault: function () {},
                stopPropagation: function () {}
            };
            for (var k in extra) e[k] = extra[k];
            return e;
        }
        function move(x, y) {
            globalThis.__fireye_emit('mousemove', ev({pageX: x, pageY: y, clientX: x, clientY: y, screenX: x, screenY: y}));
        }
        function click(x, y) {
            globalThis.__fireye_emit('mousedown', ev({pageX: x, pageY: y, clientX: x, clientY: y, button: 0, which: 1}));
            globalThis.__fireye_emit('mouseup', ev({pageX: x, pageY: y, clientX: x, clientY: y, button: 0, which: 1}));
            globalThis.__fireye_emit('click', ev({pageX: x, pageY: y, clientX: x, clientY: y, button: 0, which: 1}));
        }
        function key(code, ch) {
            globalThis.__fireye_emit('keyup', ev({keyCode: code, which: code, key: ch || String.fromCharCode(code)}));
        }
        // 1. 页面加载后鼠标移动
        var i;
        for (i = 0; i < 40; i++) move(120 + (i % 7) * 13, 160 + (i % 5) * 9);
        // 2. 点击用户名输入框并输入
        move(240, 260);
        click(240, 260);
        globalThis.__fireye_emit('focus', ev({}));
        for (i = 0; i < 12; i++) key(65 + (i % 26), String.fromCharCode(65 + (i % 26)));
        globalThis.__fireye_emit('blur', ev({}));
        // 3. 点击密码输入框并输入
        move(240, 300);
        click(240, 300);
        globalThis.__fireye_emit('focus', ev({}));
        for (i = 0; i < 16; i++) key(49 + (i % 10), String.fromCharCode(49 + (i % 10)));
        globalThis.__fireye_emit('blur', ev({}));
        // 4. 滚动页面
        globalThis.__fireye_emit('scroll', ev({pageX: 0, pageY: 120}));
        // 5. 点击登录按钮
        move(260, 340);
        click(260, 340);
        return true;
    };
    defineGlobal('attachEvent', undefined);
    defineGlobal('detachEvent', undefined);
    defineGlobal('document', documentShim);
    defineGlobal('location', locationShim);
    defineGlobal('navigator', navigatorShim);
    defineGlobal('localStorage', localStorageShim);
    defineGlobal('sessionStorage', sessionStorageShim);
    defineGlobal('performance', performanceShim);
    defineGlobal('screen', screenShim);
    defineGlobal('history', historyShim);
    defineGlobal('Image', ImageShim);
    defineGlobal('HTMLAnchorElement', HTMLAnchorElementShim);
    defineGlobal('HTMLInputElement', HTMLInputElementShim);
    defineGlobal('HTMLCanvasElement', HTMLCanvasElementShim);
    defineGlobal('HTMLImageElement', HTMLImageElementShim);
    defineGlobal('HTMLDivElement', HTMLDivElementShim);
    defineGlobal('HTMLElement', HTMLElementShim);
    defineGlobal('Document', DocumentShim);
    defineGlobal('HTMLDocument', HTMLDocumentShim);
    defineGlobal('Element', ElementShim);
    defineGlobal('Node', NodeShim);
    defineGlobal('EventTarget', EventTargetShim);
    defineGlobal('AudioContext', AudioContextShim);
    defineGlobal('webkitAudioContext', AudioContextShim);
    defineGlobal('OfflineAudioContext', OfflineAudioContextShim);
    defineGlobal('webkitOfflineAudioContext', OfflineAudioContextShim);
    defineGlobal('RTCPeerConnection', RTCPeerConnectionShim);
    defineGlobal('webkitRTCPeerConnection', RTCPeerConnectionShim);
    defineGlobal('RTCSessionDescription', RTCSessionDescriptionShim);
    defineGlobal('RTCIceCandidate', RTCIceCandidateShim);
    if (typeof globalThis.crypto === 'undefined') {
        defineGlobal('crypto', nodeCrypto.webcrypto || nodeCrypto);
    }

    // fireye 内部会注册周期性的 token 刷新定时器（setInterval / setTimeout），
    // 这里把它们改为 unref，避免 Node 事件循环被挂住导致进程无法退出。
    if (typeof setInterval === 'function') {
        var _setInterval = setInterval;
        globalThis.setInterval = function (fn, ms) {
            var t = _setInterval(fn, ms);
            if (t && typeof t.unref === 'function') t.unref();
            return t;
        };
    }
    if (typeof setTimeout === 'function') {
        var _setTimeout = setTimeout;
        globalThis.setTimeout = function (fn, ms) {
            var t = _setTimeout(fn, ms);
            // 短延迟的异步采集需要真正执行；只有长延迟的 token 刷新才 unref。
            if (t && typeof t.unref === 'function' && ms >= 10000) t.unref();
            return t;
        };
    }

    // fireye 指纹采集在异步阶段可能因环境差异报错（例如某些 DOM/WebRTC 特性检测），
    // 这里吞掉未处理的 Promise 拒绝与未捕获异常，保证 node 进程正常退出。
    if (typeof process !== 'undefined') {
        process.on('unhandledRejection', function () {
        });
        process.on('uncaughtException', function () {
        });
    }
})();
