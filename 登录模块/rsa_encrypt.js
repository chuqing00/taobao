'use strict';

/**
 * rsa_encrypt.js
 * 从「登录模块/index.js」中剥离出的 RSA 密码加密核心，等价于其中的 rsaPassword 方法。
 *
 * 原代码（index.js 第 11763~11766 行）：
 *   rsaPassword = function (e) {
 *       var t = new T.default;                 // T.default 即模块 71857 导出的 RSAKey 类
 *       return t.setPublic(c.config.rsaModulus, c.config.rsaExponent), t.encrypt(e)
 *   }
 *
 * 该 RSAKey 是标准 JSEncrypt/jsbn 实现（PKCS#1 v1.5 填充 + RSA 公钥加密）。
 * 它只依赖 navigator / window.crypto / alert 三个浏览器全局对象，已在下方补齐。
 */

const nodeCrypto = require('crypto');
const navigator = {
    appName: 'Netscape',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64)'
};

// window.crypto：用于 SecureRandom 随机种子；缺失时内部会回退 Math.random。
const window = {
    crypto: {
        getRandomValues: function (arr) {
            return nodeCrypto.webcrypto.getRandomValues(arr);
        }
    }
};

// alert：仅在公钥非法 / 明文过长时调用，这里改成抛异常便于定位问题。
function alert(msg) { throw new Error(msg); }

/* ==================== 2. 大数库（jsbn，等价于模块 71857） ==================== */

function BigInteger(a, b, c) {
    if (a != null) {
        if ("number" == typeof a) this.fromNumber(a, b, c);
        else if (b == null && "string" != typeof a) this.fromString(a, 256);
        else this.fromString(a, b);
    }
}

function nbi() { return new BigInteger(null); }

function am_ie(i, x, w, j, c, n) {          // DB = 30
    var xl = x & 0x7fff, xh = x >> 15;
    while (--n >= 0) {
        var l = this[i] & 0x7fff;
        var h = this[i++] >> 15;
        var m = xh * l + h * xl;
        l = xl * l + ((m & 0x7fff) << 15) + w[j] + (c & 0x3fffffff);
        c = (l >>> 30) + (m >>> 15) + xh * h + (c >>> 30);
        w[j++] = l & 0x3fffffff;
    }
    return c;
}
function am_default(i, x, w, j, c, n) {     // DB = 26
    while (--n >= 0) {
        var v = x * this[i++] + w[j] + c;
        c = Math.floor(v / 0x4000000);
        w[j++] = v & 0x3ffffff;
    }
    return c;
}
function am_netscape(i, x, w, j, c, n) {    // DB = 28
    var xl = x & 0x3fff, xh = x >> 14;
    while (--n >= 0) {
        var l = this[i] & 0x3fff;
        var h = this[i++] >> 14;
        var m = xh * l + h * xl;
        l = xl * l + ((m & 0x3fff) << 14) + w[j] + c;
        c = (l >> 28) + (m >> 14) + xh * h;
        w[j++] = l & 0xfffffff;
    }
    return c;
}

var dbits;
if ("Microsoft Internet Explorer" === navigator.appName) {
    BigInteger.prototype.am = am_ie;
    dbits = 30;
} else if ("Netscape" != navigator.appName) {
    BigInteger.prototype.am = am_default;
    dbits = 26;
} else {
    BigInteger.prototype.am = am_netscape;
    dbits = 28;
}

BigInteger.prototype.DB = dbits;
BigInteger.prototype.DM = (1 << dbits) - 1;
BigInteger.prototype.DV = 1 << dbits;
BigInteger.prototype.FV = Math.pow(2, 52);
BigInteger.prototype.F1 = 52 - dbits;
BigInteger.prototype.F2 = 2 * dbits - 52;

var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
var intAt_table = new Array();
(function () {
    var i, j;
    for (i = "0".charCodeAt(0), j = 0; j <= 9; ++j) intAt_table[i++] = j;
    for (i = "a".charCodeAt(0), j = 10; j < 36; ++j) intAt_table[i++] = j;
    for (i = "A".charCodeAt(0), j = 10; j < 36; ++j) intAt_table[i++] = j;
})();

function int2char(n) { return BI_RM.charAt(n); }

function intAt(s, i) {
    var c = intAt_table[s.charCodeAt(i)];
    return (c == null) ? -1 : c;
}

function nbits(x) {
    var r = 1, t;
    if ((t = x >>> 16) != 0) { x = t; r += 16; }
    if ((t = x >> 8) != 0) { x = t; r += 8; }
    if ((t = x >> 4) != 0) { x = t; r += 4; }
    if ((t = x >> 2) != 0) { x = t; r += 2; }
    if ((t = x >> 1) != 0) { x = t; r += 1; }
    return r;
}

function Classic(m) { this.m = m; }
function Montgomery(m) {
    this.m = m;
    this.mp = m.invDigit();
    this.mpl = this.mp & 0x7fff;
    this.mph = this.mp >> 15;
    this.um = (1 << (m.DB - 15)) - 1;
    this.mt2 = 2 * m.t;
}

Classic.prototype.convert = function (x) {
    if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
    else return x;
};
Classic.prototype.revert = function (x) { return x; };
Classic.prototype.reduce = function (x) { x.divRemTo(this.m, null, x); };
Classic.prototype.mulTo = function (x, y, r) { x.multiplyTo(y, r); this.reduce(r); };
Classic.prototype.sqrTo = function (x, r) { x.squareTo(r); this.reduce(r); };

Montgomery.prototype.convert = function (x) {
    var r = nbi();
    x.abs().dlShiftTo(this.m.t, r);
    r.divRemTo(this.m, null, r);
    if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
    return r;
};
Montgomery.prototype.revert = function (x) {
    var r = nbi();
    x.copyTo(r);
    this.reduce(r);
    return r;
};
Montgomery.prototype.reduce = function (x) {
    while (x.t <= this.mt2) x[x.t++] = 0;
    for (var i = 0; i < this.m.t; ++i) {
        var j = x[i] & 0x7fff;
        var u0 = (j * this.mpl + (((j * this.mph + (x[i] >> 15) * this.mpl) & this.um) << 15)) & x.DM;
        j = i + this.m.t;
        x[j] += this.m.am(0, u0, x, i, 0, this.m.t);
        while (x[j] >= x.DV) { x[j] -= x.DV; x[++j]++; }
    }
    x.clamp();
    x.drShiftTo(this.m.t, x);
    if (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
};
Montgomery.prototype.mulTo = function (x, y, r) { x.multiplyTo(y, r); this.reduce(r); };
Montgomery.prototype.sqrTo = function (x, r) { x.squareTo(r); this.reduce(r); };

BigInteger.prototype.copyTo = function (r) {
    for (var i = this.t - 1; i >= 0; --i) r[i] = this[i];
    r.t = this.t; r.s = this.s;
};

BigInteger.prototype.fromInt = function (x) {
    this.t = 1;
    this.s = (x < 0) ? -1 : 0;
    if (x > 0) this[0] = x;
    else if (x < -1) this[0] = x + this.DV;
    else this.t = 0;
};

BigInteger.prototype.fromString = function (s, b) {
    var k;
    if (b == 16) k = 4;
    else if (b == 8) k = 3;
    else if (b == 256) k = 8;
    else if (b == 2) k = 1;
    else if (b == 32) k = 5;
    else if (b == 4) k = 2;
    else { throw new Error("fromString: unsupported radix " + b); }
    this.t = 0;
    this.s = 0;
    var i = s.length, mi = false, sh = 0;
    while (--i >= 0) {
        var x = (k == 8) ? (s[i] & 0xff) : intAt(s, i);
        if (x < 0) {
            if (s.charAt(i) == "-") mi = true;
            continue;
        }
        mi = false;
        if (sh == 0) this[this.t++] = x;
        else if (sh + k > this.DB) {
            this[this.t - 1] |= (x & ((1 << (this.DB - sh)) - 1)) << sh;
            this[this.t++] = (x >> (this.DB - sh));
        } else {
            this[this.t - 1] |= x << sh;
        }
        sh += k;
        if (sh >= this.DB) sh -= this.DB;
    }
    if (k == 8 && (s[0] & 0x80) != 0) {
        this.s = -1;
        if (sh > 0) this[this.t - 1] |= ((1 << (this.DB - sh)) - 1) << sh;
    }
    this.clamp();
    if (mi) BigInteger.ZERO.subTo(this, this);
};

BigInteger.prototype.clamp = function () {
    var c = this.s & this.DM;
    while (this.t > 0 && this[this.t - 1] == c) --this.t;
};

BigInteger.prototype.dlShiftTo = function (n, r) {
    var i;
    for (i = this.t - 1; i >= 0; --i) r[i + n] = this[i];
    for (i = n - 1; i >= 0; --i) r[i] = 0;
    r.t = this.t + n;
    r.s = this.s;
};

BigInteger.prototype.drShiftTo = function (n, r) {
    for (var i = n; i < this.t; ++i) r[i - n] = this[i];
    r.t = Math.max(this.t - n, 0);
    r.s = this.s;
};

BigInteger.prototype.lShiftTo = function (n, r) {
    var bs = n % this.DB;
    var cbs = this.DB - bs;
    var bm = (1 << cbs) - 1;
    var ds = Math.floor(n / this.DB);
    var c = (this.s << bs) & this.DM;
    for (var i = this.t - 1; i >= 0; --i) {
        r[i + ds + 1] = (this[i] >> cbs) | c;
        c = (this[i] & bm) << bs;
    }
    for (var i = ds - 1; i >= 0; --i) r[i] = 0;
    r[ds] = c;
    r.t = this.t + ds + 1;
    r.s = this.s;
    r.clamp();
};

BigInteger.prototype.rShiftTo = function (n, r) {
    r.s = this.s;
    var ds = Math.floor(n / this.DB);
    if (ds >= this.t) { r.t = 0; return; }
    var bs = n % this.DB;
    var cbs = this.DB - bs;
    var bm = (1 << bs) - 1;
    r[0] = this[ds] >> bs;
    for (var i = ds + 1; i < this.t; ++i) {
        r[i - ds - 1] |= (this[i] & bm) << cbs;
        r[i - ds] = this[i] >> bs;
    }
    if (bs > 0) r[this.t - ds - 1] |= (this.s & bm) << cbs;
    r.t = this.t - ds;
    r.clamp();
};

BigInteger.prototype.subTo = function (a, r) {
    var i = 0, c = 0, m = Math.min(a.t, this.t);
    while (i < m) {
        c += this[i] - a[i];
        r[i++] = c & this.DM;
        c >>= this.DB;
    }
    if (a.t < this.t) {
        c -= a.s;
        while (i < this.t) {
            c += this[i];
            r[i++] = c & this.DM;
            c >>= this.DB;
        }
        c += this.s;
    } else {
        c += this.s;
        while (i < a.t) {
            c -= a[i];
            r[i++] = c & this.DM;
            c >>= this.DB;
        }
        c -= a.s;
    }
    r.s = (c < 0) ? -1 : 0;
    if (c < -1) r[i++] = this.DV + c;
    else if (c > 0) r[i++] = c;
    r.t = i;
    r.clamp();
};

BigInteger.prototype.multiplyTo = function (a, r) {
    var x = this.abs(), y = a.abs();
    var i = x.t;
    r.t = i + y.t;
    while (--i >= 0) r[i] = 0;
    for (i = 0; i < y.t; ++i) r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
    r.s = 0;
    r.clamp();
    if (this.s != a.s) BigInteger.ZERO.subTo(r, r);
};

BigInteger.prototype.squareTo = function (r) {
    var x = this.abs();
    var i = r.t = 2 * x.t;
    while (--i >= 0) r[i] = 0;
    for (i = 0; i < x.t - 1; ++i) {
        var c = x.am(i, x[i], r, 2 * i, 0, 1);
        if ((r[i + x.t] += x.am(i + 1, 2 * x[i], r, 2 * i + 1, c, x.t - i - 1)) >= x.DV) {
            r[i + x.t] -= x.DV;
            r[i + x.t + 1] = 1;
        }
    }
    if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
    r.s = 0;
    r.clamp();
};

BigInteger.prototype.divRemTo = function (m, q, r) {
    var pm = m.abs();
    if (pm.t <= 0) return;
    var pt = this.abs();
    if (pt.t < pm.t) {
        if (q != null) q.fromInt(0);
        if (r != null) this.copyTo(r);
        return;
    }
    if (r == null) r = nbi();
    var y = nbi(), ts = this.s, ms = m.s;
    var nsh = this.DB - nbits(pm[pm.t - 1]);
    if (nsh > 0) { pm.lShiftTo(nsh, y); pt.lShiftTo(nsh, r); }
    else { pm.copyTo(y); pt.copyTo(r); }
    var ys = y.t;
    var y0 = y[ys - 1];
    if (y0 == 0) return;
    var yt = y0 * (1 << this.F1) + ((ys > 1) ? y[ys - 2] >> this.F2 : 0);
    var d1 = this.FV / yt, d2 = (1 << this.F1) / yt, e = 1 << this.F2;
    var i = r.t, j = i - ys, t = (q == null) ? nbi() : q;
    y.dlShiftTo(j, t);
    if (r.compareTo(t) >= 0) { r[r.t++] = 1; r.subTo(t, r); }
    BigInteger.ONE.dlShiftTo(ys, t);
    t.subTo(y, y);
    while (y.t < ys) y[y.t++] = 0;
    while (--j >= 0) {
        var qd = (r[--i] == y0) ? this.DM : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
        if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {
            y.dlShiftTo(j, t);
            r.subTo(t, r);
            while (r[i] < --qd) r.subTo(t, r);
        }
    }
    if (q != null) {
        r.drShiftTo(ys, q);
        if (ts != ms) BigInteger.ZERO.subTo(q, q);
    }
    r.t = ys;
    r.clamp();
    if (nsh > 0) r.rShiftTo(nsh, r);
    if (ts < 0) BigInteger.ZERO.subTo(r, r);
};

BigInteger.prototype.invDigit = function () {
    if (this.t < 1) return 0;
    var x = this[0];
    if ((x & 1) == 0) return 0;
    var y = x & 3;
    y = (y * (2 - (x & 0xf) * y)) & 0xf;
    y = (y * (2 - (x & 0xff) * y)) & 0xff;
    y = (y * (2 - (((x & 0xffff) * y) & 0xffff))) & 0xffff;
    y = (y * (2 - x * y % this.DV)) % this.DV;
    return (y > 0) ? this.DV - y : -y;
};

BigInteger.prototype.isEven = function () {
    return ((this.t > 0) ? (this[0] & 1) : this.s) == 0;
};

BigInteger.prototype.exp = function (e, z) {
    if (e > 0xffffffff || e < 1) return BigInteger.ONE;
    var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e) - 1;
    g.copyTo(r);
    while (--i >= 0) {
        z.sqrTo(r, r2);
        if ((e & (1 << i)) > 0) z.mulTo(r2, g, r);
        else { var t = r; r = r2; r2 = t; }
    }
    return z.revert(r);
};

BigInteger.prototype.toString = function (b) {
    if (this.s < 0) return "-" + this.negate().toString(b);
    var k;
    if (b == 16) k = 4;
    else if (b == 8) k = 3;
    else if (b == 2) k = 1;
    else if (b == 32) k = 5;
    else if (b == 4) k = 2;
    else { throw new Error("toString: unsupported radix " + b); }
    var km = (1 << k) - 1, d, m = false, r = "", i = this.t;
    var p = this.DB - (i * this.DB) % k;
    if (i-- > 0) {
        if (p < this.DB && (d = this[i] >> p) > 0) { m = true; r = int2char(d); }
        while (i >= 0) {
            if (p < k) {
                d = (this[i] & ((1 << p) - 1)) << (k - p);
                d |= this[--i] >> (p += this.DB - k);
            } else {
                d = (this[i] >> (p -= k)) & km;
                if (p <= 0) { p += this.DB; --i; }
            }
            if (d > 0) m = true;
            if (m) r += int2char(d);
        }
    }
    return m ? r : "0";
};

BigInteger.prototype.negate = function () {
    var r = nbi();
    BigInteger.ZERO.subTo(this, r);
    return r;
};

BigInteger.prototype.abs = function () {
    return (this.s < 0) ? this.negate() : this;
};

BigInteger.prototype.compareTo = function (a) {
    var r = this.s - a.s;
    if (r != 0) return r;
    var i = this.t;
    r = i - a.t;
    if (r != 0) return (this.s < 0) ? -r : r;
    while (--i >= 0) if ((r = this[i] - a[i]) != 0) return r;
    return 0;
};

BigInteger.prototype.bitLength = function () {
    if (this.t <= 0) return 0;
    return this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ (this.s & this.DM));
};

BigInteger.prototype.mod = function (a) {
    var r = nbi();
    this.abs().divRemTo(a, null, r);
    if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
    return r;
};

BigInteger.prototype.modPowInt = function (e, m) {
    var z;
    if (e < 256 || m.isEven()) z = new Classic(m);
    else z = new Montgomery(m);
    return this.exp(e, z);
};

BigInteger.ZERO = nbi();
BigInteger.ZERO.fromInt(0);
BigInteger.ONE = nbi();
BigInteger.ONE.fromInt(1);

/* ==================== 3. 随机数（SecureRandom / ARC4） ==================== */

function Arcfour() {
    this.i = 0;
    this.j = 0;
    this.S = new Array();
}

Arcfour.prototype.init = function (key) {
    var i, j, t;
    for (i = 0; i < 256; ++i) this.S[i] = i;
    j = 0;
    for (i = 0; i < 256; ++i) {
        j = (j + this.S[i] + key[i % key.length]) & 255;
        t = this.S[i];
        this.S[i] = this.S[j];
        this.S[j] = t;
    }
    this.i = 0;
    this.j = 0;
};

Arcfour.prototype.next = function () {
    var t;
    this.i = (this.i + 1) & 255;
    this.j = (this.j + this.S[this.i]) & 255;
    t = this.S[this.i];
    this.S[this.i] = this.S[this.j];
    this.S[this.j] = t;
    return this.S[(t + this.S[this.i]) & 255];
};

var rng_state;
var rng_pool;
var rng_pptr;
var rng_psize = 256;

function rng_seed_int(x) {
    rng_pool[rng_pptr++] ^= x & 255;
    rng_pool[rng_pptr++] ^= (x >> 8) & 255;
    rng_pool[rng_pptr++] ^= (x >> 16) & 255;
    rng_pool[rng_pptr++] ^= (x >> 24) & 255;
    if (rng_pptr >= rng_psize) rng_pptr -= rng_psize;
}

function rng_seed_time() {
    rng_seed_int(new Date().getTime());
}

if (rng_pool == null) {
    rng_pool = new Array();
    rng_pptr = 0;
    var t;
    if (window.crypto && window.crypto.getRandomValues) {
        var ua = new Uint8Array(32);
        window.crypto.getRandomValues(ua);
        for (t = 0; t < 32; ++t) rng_pool[rng_pptr++] = ua[t];
    }
    if (navigator.appName == "Netscape" && navigator.appVersion < "5" && window.crypto && window.crypto.random) {
        var z = window.crypto.random(32);
        for (t = 0; t < z.length; ++t) rng_pool[rng_pptr++] = z.charCodeAt(t) & 255;
    }
    while (rng_pptr < rng_psize) {
        t = Math.floor(65536 * Math.random());
        rng_pool[rng_pptr++] = t >>> 8;
        rng_pool[rng_pptr++] = t & 255;
    }
    rng_pptr = 0;
    rng_seed_time();
}

function rng_get_byte() {
    if (rng_state == null) {
        rng_seed_time();
        rng_state = new Arcfour();
        rng_state.init(rng_pool);
        for (rng_pptr = 0; rng_pptr < rng_pool.length; ++rng_pptr) rng_pool[rng_pptr] = 0;
        rng_pptr = 0;
    }
    return rng_state.next();
}

function SecureRandom() {}
SecureRandom.prototype.nextBytes = function (ba) {
    var i;
    for (i = 0; i < ba.length; ++i) ba[i] = rng_get_byte();
};

/* ==================== 4. RSAKey（等价于 T.default，即模块 71857 的默认导出） ==================== */

function RSAKey() {
    this.n = null;
    this.e = 0;
    this.d = null;
    this.p = null;
    this.q = null;
    this.dmp1 = null;
    this.dmq1 = null;
    this.coeff = null;
}

RSAKey.prototype.doPublic = function (x) { return x.modPowInt(this.e, this.n); };

RSAKey.prototype.setPublic = function (N, E) {
    if (N != null && E != null && N.length > 0 && E.length > 0) {
        this.n = new BigInteger(N, 16);
        this.e = parseInt(E, 16);
    } else {
        alert("Invalid RSA public key");
    }
};

function pkcs1pad2(s, n) {
    if (n < s.length + 11) {
        alert("Message too long for RSA");
        return null;
    }
    var ba = new Array();
    var i = s.length - 1;
    while (i >= 0 && n > 0) {
        var c = s.charCodeAt(i--);
        if (c < 128) {
            ba[--n] = c;
        } else if ((c > 127) && (c < 2048)) {
            ba[--n] = (c & 63) | 128;
            ba[--n] = (c >> 6) | 192;
        } else {
            ba[--n] = (c & 63) | 128;
            ba[--n] = ((c >> 6) & 63) | 128;
            ba[--n] = (c >> 12) | 224;
        }
    }
    ba[--n] = 0;
    var rng = new SecureRandom();
    var x = new Array();
    while (n > 2) {
        x[0] = 0;
        while (x[0] == 0) rng.nextBytes(x);
        ba[--n] = x[0];
    }
    ba[--n] = 2;
    ba[--n] = 0;
    return new BigInteger(ba);
}

RSAKey.prototype.encrypt = function (text) {
    var m = pkcs1pad2(text, (this.n.bitLength() + 7) >> 3);
    if (m == null) return null;
    var c = this.doPublic(m);
    if (c == null) return null;
    var h = c.toString(16);
    return ((h.length & 1) === 0) ? h : "0" + h;
};


var DEFAULT_MODULUS = 'b5e9d2031eb1c31e39440bb63de4527c1c437fb2d453bc36f4ba8f317f5ca31a160ede372fe62beb7a239e1326f0e7824b21a04ce5f83dbbad5324ba657539ef0a721f3293f2e8e46543d503e7a1fc9e6ad4a4487feecef11b2bd0537dc02b23c0c349a169d7ad4469577795240a1e1f279d0ca2028074a371f4630cce31d1f0f133605ef26980b42dad7716ec4ea5253bbd8fe1e5d35573a00841b71a28c01d1aa3e04d665dcf10e1b1e6377a230e447e1e3f85e6b2ad51b83b049374a54a8e864ddf91ab93f05e7049573ca60892ef275ae378577a6d7ea48ae2c39b1487db9ec11ca3ae938ee2a69cada5905fa115b2e86e262e553d234b092f21dcf048db';
var DEFAULT_EXPONENT = '10001';

function rsaPassword(password, modulus, exponent) {
    var key = new RSAKey();
    key.setPublic(modulus || DEFAULT_MODULUS, exponent || DEFAULT_EXPONENT);
    return key.encrypt(password);
}

module.exports = {
    // 对外主入口：encrypt(明文, modulus?, exponent?) -> 密文(hex)
    encrypt: rsaPassword,
    rsaPassword: rsaPassword,
    RSAKey: RSAKey,
    BigInteger: BigInteger,
    DEFAULT_MODULUS: DEFAULT_MODULUS,
    DEFAULT_EXPONENT: DEFAULT_EXPONENT
};

/* ==================== 6. 标准输入输出 / 命令行接口 ==================== */

if (require.main === module) {
    var args = process.argv.slice(2);

    function output(encrypted) {
        process.stdout.write(encrypted + '\n');
    }

    function run(password, modulus, exponent) {
        try {
            output(rsaPassword(password, modulus, exponent));
        } catch (e) {
            process.stderr.write('Error: ' + e.message + '\n');
            process.exit(1);
        }
    }

    if (args.length > 0 && args[0][0] !== '{') {
        // 用法1：node rsa_encrypt.js <密码> [modulus] [exponent]
        run(args[0], args[1], args[2]);
    } else if (process.stdin.isTTY) {
        // 用法2：直接 node rsa_encrypt.js 运行（不带参数、非管道），默认演示加密 123123
        process.stderr.write('用法: node rsa_encrypt.js <密码> [modulus] [exponent]\n默认演示密码: 123123\n');
        run('123123');
    } else {
        // 用法3：从 stdin 读取（JSON 或纯密码）
        var buf = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', function (chunk) { buf += chunk; });
        process.stdin.on('end', function () {
            buf = buf.trim();
            var password, modulus, exponent;
            if (buf[0] === '{') {
                try {
                    var obj = JSON.parse(buf);
                    password = obj.password != null ? String(obj.password) : obj.pwd;
                    modulus = obj.modulus || obj.rsaModulus;
                    exponent = obj.exponent || obj.rsaExponent;
                } catch (e) {
                    process.stderr.write('Error: invalid JSON input\n');
                    process.exit(1);
                    return;
                }
            } else {
                password = buf;
            }
            if (!password) {
                process.stderr.write('Error: missing password\n');
                process.exit(1);
                return;
            }
            run(password, modulus, exponent);
        });
    }
}
