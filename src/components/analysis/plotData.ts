/**
 * Marshalling between the analysis pipeline's buffers and what uPlot expects.
 *
 * The pipeline stores samples in `Float64Array` and marks "no reading" with
 * NaN — compact, and it keeps the no-data case impossible to confuse with a
 * real zero. uPlot, however, only recognises `null` as a gap.
 *
 * That difference is not cosmetic. uPlot's autoscale seeds its running min/max
 * from the first *non-nullish* sample in view:
 *
 *     let _min = data[_i0];        // _i0 = first index where v != null
 *     ...
 *     if (v < _min) _min = v;      // every comparison against NaN is false
 *
 * `NaN != null` is true, so a single leading NaN becomes the seed, every later
 * comparison against it is false, and the scale stays NaN — which renders as a
 * blank axis with no traces at all. Converting at this boundary is what keeps
 * NaN usable internally while giving uPlot the `null` it needs.
 */

/**
 * Cached on the source buffer, so re-rendering the same dataset costs nothing.
 * Channel buffers are replaced wholesale whenever the pipeline re-runs, which
 * is exactly when a fresh conversion is wanted.
 */
const cache = new WeakMap<Float64Array, (number | null)[]>();

/** Convert a channel buffer into a uPlot series, NaN gaps becoming `null`. */
export function toPlotSeries(values: Float64Array): (number | null)[] {
  const cached = cache.get(values);
  if (cached) return cached;

  const out = new Array<number | null>(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out[i] = Number.isFinite(v) ? v : null;
  }
  cache.set(values, out);
  return out;
}
