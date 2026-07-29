/**
 * Digital filters used by the analysis pipeline.
 *
 * A faithful port of `scipy.signal.savgol_filter(x, window, polyorder,
 * mode="interp")`, which smooths mass (kg) channels.
 *
 * Everything runs on Float64Array in the browser. NaN samples (gaps) are held
 * out of the filter and restored afterwards, matching the script's behaviour of
 * filtering only the valid subset.
 */

// ---------------------------------------------------------------------------
// Small dense linear algebra (Gaussian elimination with partial pivoting)
// ---------------------------------------------------------------------------

/** Solve A·x = b for a square, row-major A. Returns null if A is singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Work on copies — callers reuse their matrices.
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];

    const p = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / p;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

// ---------------------------------------------------------------------------
// NaN-aware wrapper
// ---------------------------------------------------------------------------

/**
 * Run `fn` over only the finite samples of `data`, writing results back into
 * their original positions. Non-finite samples stay non-finite — a gap in the
 * source must never be smoothed into a fabricated value.
 */
function overFiniteSamples(
  data: Float64Array,
  fn: (valid: Float64Array) => Float64Array | null,
): Float64Array {
  const idx: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (Number.isFinite(data[i])) idx.push(i);
  }
  if (idx.length === 0) return data;

  const allFinite = idx.length === data.length;
  const valid = allFinite ? data : new Float64Array(idx.length);
  if (!allFinite) for (let k = 0; k < idx.length; k++) valid[k] = data[idx[k]];

  const filtered = fn(valid);
  if (!filtered) return data;

  if (allFinite) return filtered;
  const out = Float64Array.from(data);
  for (let k = 0; k < idx.length; k++) out[idx[k]] = filtered[k];
  return out;
}

// ---------------------------------------------------------------------------
// Savitzky-Golay
// ---------------------------------------------------------------------------

/** Coerce a requested window to a legal one: odd, and greater than polyorder. */
export function normalizeSavgolWindow(window: number, polyorder: number): number {
  let w = Math.max(1, Math.round(window));
  if (w % 2 === 0) w += 1;
  if (w <= polyorder) {
    w = polyorder + 2;
    if (w % 2 === 0) w += 1;
  }
  return w;
}

/**
 * Least-squares projection matrix for a degree-`polyorder` polynomial fit over
 * offsets z = −h … h. Row i of the result maps the window's samples onto the
 * fitted polynomial's i-th coefficient, so evaluating at any offset z is just
 * Σ zⁱ · P[i]. Interior points use z = 0; edge points use their true offset,
 * which is exactly what SciPy's `mode="interp"` does.
 */
function savgolProjection(window: number, polyorder: number): number[][] | null {
  const h = (window - 1) / 2;
  const order = polyorder + 1;

  // Normal equations: (AᵀA) · P = Aᵀ, with A[z][i] = zⁱ.
  const AtA: number[][] = Array.from({ length: order }, () =>
    new Array<number>(order).fill(0),
  );
  for (let i = 0; i < order; i++) {
    for (let j = 0; j < order; j++) {
      let s = 0;
      for (let z = -h; z <= h; z++) s += Math.pow(z, i + j);
      AtA[i][j] = s;
    }
  }

  const P: number[][] = [];
  for (let i = 0; i < order; i++) P.push(new Array<number>(window).fill(0));

  // Solve once per window column: (AᵀA) · p = Aᵀ e_k.
  for (let k = 0; k < window; k++) {
    const z = k - h;
    const rhs = new Array<number>(order);
    for (let i = 0; i < order; i++) rhs[i] = Math.pow(z, i);
    const sol = solveLinear(AtA, rhs);
    if (!sol) return null;
    for (let i = 0; i < order; i++) P[i][k] = sol[i];
  }
  return P;
}

/** Convolution weights that evaluate the window's fitted polynomial at `z`. */
function coeffsAt(P: number[][], z: number): number[] {
  const window = P[0].length;
  const out = new Array<number>(window).fill(0);
  for (let i = 0; i < P.length; i++) {
    const zi = Math.pow(z, i);
    if (zi === 0) continue;
    for (let k = 0; k < window; k++) out[k] += zi * P[i][k];
  }
  return out;
}

/**
 * Savitzky-Golay smoothing, equivalent to
 * `scipy.signal.savgol_filter(data, window, polyorder, mode="interp")`.
 *
 * Returns the input untouched (not zero-filled) when the series is shorter than
 * the window — a short capture is reported as unsmoothed rather than distorted.
 */
export function savgolFilter(
  data: Float64Array,
  window: number,
  polyorder: number,
): Float64Array {
  const w = normalizeSavgolWindow(window, polyorder);
  return overFiniteSamples(data, (valid) => {
    if (valid.length < w) return null;
    const P = savgolProjection(w, polyorder);
    if (!P) return null;

    const h = (w - 1) / 2;
    const n = valid.length;
    const out = new Float64Array(n);

    const interior = coeffsAt(P, 0);
    for (let i = h; i < n - h; i++) {
      let s = 0;
      for (let k = 0; k < w; k++) s += interior[k] * valid[i - h + k];
      out[i] = s;
    }
    // Edges: fit the first/last full window and evaluate at the true offset.
    for (let i = 0; i < h; i++) {
      const c = coeffsAt(P, i - h);
      let s = 0;
      for (let k = 0; k < w; k++) s += c[k] * valid[k];
      out[i] = s;
    }
    for (let i = n - h; i < n; i++) {
      const c = coeffsAt(P, i - (n - 1 - h));
      let s = 0;
      for (let k = 0; k < w; k++) s += c[k] * valid[n - w + k];
      out[i] = s;
    }
    return out;
  });
}
