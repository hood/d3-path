const pi = Math.PI,
    tau = 2 * pi,
    epsilon = 1e-6,
    tauEpsilon = tau - epsilon;

const decoder = new TextDecoder("latin1");
const digits = new Uint8Array(24);

function writeString(path, s) {
  const n = s.length;
  path._grow(n);
  const b = path._b;
  let j = path._n;
  for (let i = 0; i < n; ++i) b[j++] = s.charCodeAt(i);
  path._n = j;
}

function writeInteger(path, a) {
  let m = 0;
  do { const q = Math.floor(a / 10); digits[m++] = 48 + a - q * 10; a = q; } while (a > 0);
  path._grow(m);
  const b = path._b;
  let j = path._n;
  while (m) b[j++] = digits[--m];
  path._n = j;
}

function append(strings) {
  writeString(this, strings[0]);
  for (let i = 1, n = strings.length; i < n; ++i) {
    writeString(this, "" + arguments[i]);
    writeString(this, strings[i]);
  }
}

function appendRound(digits) {
  let d = Math.floor(digits);
  if (!(d >= 0)) throw new Error(`invalid digits: ${digits}`);
  if (d > 15) return append;
  const k = 10 ** d;
  return function(strings) {
    writeString(this, strings[0]);
    for (let i = 1, n = strings.length; i < n; ++i) {
      const n1 = Math.round(arguments[i] * k);
      if (!(n1 < 4503599627370496 && n1 > -4503599627370496)) writeString(this, "" + n1 / k);
      else {
        let a = n1;
        if (a < 0) a = -a, writeString(this, "-");
        const q = Math.floor(a / k);
        writeInteger(this, q);
        let r = a - q * k;
        if (r) {
          let e = d;
          while (r % 10 === 0) r /= 10, --e;
          this._grow(e + 1);
          const b = this._b;
          let j = this._n;
          b[j++] = 46;
          for (let t = e - 1; t >= 0; --t) { const q2 = Math.floor(r / 10); b[j + t] = 48 + r - q2 * 10; r = q2; }
          this._n = j + e;
        }
      }
      writeString(this, strings[i]);
    }
  };
}

function equal(x0, y0, x1, y1) {
  return x0 === x1 && y0 === y1;
}

function equalRound(digits) {
  const d = Math.floor(digits);
  if (!(d <= 15)) return equal;
  const k = 10 ** d;
  const r = function(value) {
    return Math.round(value * k);
  };
  return function(x0, y0, x1, y1) {
    return r(x0) === r(x1) && r(y0) === r(y1);
  };
}

export class Path {
  constructor(digits) {
    this._x0 = this._y0 = // start of current subpath
    this._x1 = this._y1 = null; // end of current subpath
    this._b = new Uint8Array(256);
    this._n = 0;
    this._append = digits == null ? append : appendRound(digits);
    this._equal = digits == null ? equal : equalRound(digits);
  }
  moveTo(x, y) {
    this._append`M${this._x0 = this._x1 = +x},${this._y0 = this._y1 = +y}`;
  }
  closePath() {
    if (this._x1 !== null) {
      this._x1 = this._x0, this._y1 = this._y0;
      this._append`Z`;
    }
  }
  lineTo(x, y) {
    this._append`L${this._x1 = +x},${this._y1 = +y}`;
  }
  quadraticCurveTo(x1, y1, x, y) {
    this._append`Q${+x1},${+y1},${this._x1 = +x},${this._y1 = +y}`;
  }
  bezierCurveTo(x1, y1, x2, y2, x, y) {
    this._append`C${+x1},${+y1},${+x2},${+y2},${this._x1 = +x},${this._y1 = +y}`;
  }
  arcTo(x1, y1, x2, y2, r) {
    x1 = +x1, y1 = +y1, x2 = +x2, y2 = +y2, r = +r;

    // Is the radius negative? Error.
    if (r < 0) throw new Error(`negative radius: ${r}`);

    let x0 = this._x1,
        y0 = this._y1,
        x21 = x2 - x1,
        y21 = y2 - y1,
        x01 = x0 - x1,
        y01 = y0 - y1,
        l01_2 = x01 * x01 + y01 * y01;

    // Is this path empty? Move to (x1,y1).
    if (this._x1 === null) {
      this._append`M${this._x1 = x1},${this._y1 = y1}`;
    }

    // Or, is (x1,y1) coincident with (x0,y0)? Do nothing.
    else if (!(l01_2 > epsilon));

    // Or, are (x0,y0), (x1,y1) and (x2,y2) collinear?
    // Equivalently, is (x1,y1) coincident with (x2,y2)?
    // Or, is the radius zero? Line to (x1,y1).
    else if (!(Math.abs(y01 * x21 - y21 * x01) > epsilon) || !r) {
      this._append`L${this._x1 = x1},${this._y1 = y1}`;
    }

    // Otherwise, draw an arc!
    else {
      let x20 = x2 - x0,
          y20 = y2 - y0,
          l21_2 = x21 * x21 + y21 * y21,
          l20_2 = x20 * x20 + y20 * y20,
          l21 = Math.sqrt(l21_2),
          l01 = Math.sqrt(l01_2),
          l = r * Math.tan((pi - Math.acos((l21_2 + l01_2 - l20_2) / (2 * l21 * l01))) / 2),
          t01 = l / l01,
          t21 = l / l21;

      // If the start tangent is not coincident with (x0,y0), line to.
      if (Math.abs(t01 - 1) > epsilon) {
        this._append`L${x1 + t01 * x01},${y1 + t01 * y01}`;
      }

      this._append`A${r},${r},0,0,${+(y01 * x20 > x01 * y20)},${this._x1 = x1 + t21 * x21},${this._y1 = y1 + t21 * y21}`;
    }
  }
  arc(x, y, r, a0, a1, ccw) {
    x = +x, y = +y, r = +r, ccw = !!ccw;

    // Is the radius negative? Error.
    if (r < 0) throw new Error(`negative radius: ${r}`);

    let dx = r * Math.cos(a0),
        dy = r * Math.sin(a0),
        x0 = x + dx,
        y0 = y + dy,
        cw = 1 ^ ccw,
        da = ccw ? a0 - a1 : a1 - a0;

    // Is this path empty? Move to (x0,y0).
    if (this._x1 === null) {
      this._append`M${x0},${y0}`;
    }

    // Or, is (x0,y0) not coincident with the previous point? Line to (x0,y0).
    else if (Math.abs(this._x1 - x0) > epsilon || Math.abs(this._y1 - y0) > epsilon) {
      this._append`L${x0},${y0}`;
    }

    // Is this arc empty? We’re done.
    if (!r) return;

    // Does the angle go the wrong way? Flip the direction.
    if (da < 0) da = da % tau + tau;

    // Is this a complete circle? Draw two arcs to complete the circle.
    if (da > tauEpsilon) {
      this._append`A${r},${r},0,1,${cw},${x - dx},${y - dy}A${r},${r},0,1,${cw},${this._x1 = x0},${this._y1 = y0}`;
    }

    // Is this arc non-empty? Draw an arc!
    else if (da > epsilon) {
      // If the start and end points are coincident after rounding, we need to draw two consecutive arcs.
      const x1 = x + r * Math.cos(a1);
      const y1 = y + r * Math.sin(a1);
      if (da >= pi && this._equal(x0, y0, x1, y1)) {
        da /= 2;
        let a00 = a0 + da;
        this._append`A${r},${r},0,${+(da >= pi)},${cw},${x + r * Math.cos(a00)},${y + r * Math.sin(a00)}`;
      }
      this._append`A${r},${r},0,${+(da >= pi)},${cw},${this._x1 = x1},${this._y1 = y1}`;
    }
  }
  rect(x, y, w, h) {
    this._append`M${this._x0 = this._x1 = +x},${this._y0 = this._y1 = +y}h${w = +w}v${+h}h${-w}Z`;
  }
  _grow(m) {
    if (this._n + m > this._b.length) {
      const b = new Uint8Array(Math.max(this._b.length * 2, this._n + m));
      b.set(this._b);
      this._b = b;
    }
  }
  toString() {
    return decoder.decode(this._b.subarray(0, this._n));
  }
}

export function path() {
  return new Path;
}

// Allow instanceof d3.path
path.prototype = Path.prototype;

export function pathRound(digits = 3) {
  return new Path(+digits);
}
