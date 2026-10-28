/**
 * A stand-in for uPlot, which needs a real canvas. It records what each chart
 * was built with and every call made to it, so tests can assert on exactly what
 * would have been drawn. Installed for every test from vitest.setup.ts.
 */
export interface FakeScaleCall {
  scale: string;
  range: { min: number; max: number };
}

export class FakeUPlot {
  static instances: FakeUPlot[] = [];

  static makeContext(owner: FakeUPlot) {
    const record = (name: string) => (...args: unknown[]) => {
      owner.canvasCalls.push([name, ...args]);
    };
    return {
      save: record("save"),
      restore: record("restore"),
      beginPath: record("beginPath"),
      rect: record("rect"),
      clip: record("clip"),
      moveTo: record("moveTo"),
      lineTo: record("lineTo"),
      stroke: record("stroke"),
      setLineDash: record("setLineDash"),
      fillText: record("fillText"),
      measureText: (text: string) => ({ width: text.length * 6 }),
      font: "",
      textBaseline: "",
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1,
    };
  }

  static reset() {
    FakeUPlot.instances = [];
  }

  static get last(): FakeUPlot {
    return FakeUPlot.instances[FakeUPlot.instances.length - 1];
  }

  destroyed = false;
  data: unknown[][];
  setDataCalls: unknown[][][] = [];
  scaleCalls: FakeScaleCall[] = [];
  sizeCalls: Array<{ width: number; height: number }> = [];
  scales: Record<string, { min?: number; max?: number }> = { x: {}, y: {} };
  cursor: { idx: number | null; left: number; top: number } = { idx: null, left: -10, top: -10 };
  select = { left: 0, top: 0, width: 0, height: 0 };
  hooks: Record<string, Array<(u: FakeUPlot, ...args: unknown[]) => void>> = {};
  bbox = { left: 0, top: 0, width: 400, height: 100 };
  redrawCount = 0;
  /** Everything drawn on the canvas: [method, ...args], in order. */
  canvasCalls: unknown[][] = [];
  ctx = FakeUPlot.makeContext(this);
  over: HTMLElement;
  root: HTMLElement;

  constructor(
    public opts: Record<string, any>,
    data: unknown[][],
    public target: HTMLElement,
  ) {
    this.data = data;
    this.root = document.createElement("div");
    this.root.className = "u-wrap";
    this.over = document.createElement("div");
    this.over.className = "u-over";
    this.root.appendChild(this.over);
    target?.appendChild(this.root);
    for (const [name, fns] of Object.entries(opts.hooks ?? {})) {
      this.hooks[name] = Array.isArray(fns) ? [...(fns as never[])] : [fns as never];
    }
    FakeUPlot.instances.push(this);
    this.fire("init");
  }

  fire(name: string, ...args: unknown[]) {
    for (const fn of this.hooks[name] ?? []) fn(this, ...args);
  }

  setData(data: unknown[][], _resetScales?: boolean) {
    this.data = data;
    this.setDataCalls.push(data);
  }

  setScale(scale: string, range: { min: number; max: number }) {
    this.scales[scale] = { min: range.min, max: range.max };
    this.scaleCalls.push({ scale, range });
  }

  setSize(size: { width: number; height: number }) {
    this.sizeCalls.push(size);
  }

  setCursor() {}
  setSeries() {}
  redraw() {
    this.redrawCount++;
    this.fire("draw");
  }
  setSelect(sel: { left: number; top: number; width: number; height: number }, _fire?: boolean) {
    this.select = sel;
  }
  posToIdx(left: number) {
    return Math.round(left);
  }
  posToVal(left: number, _scale?: string) {
    return left;
  }
  valToPos(v: number, _scale?: string, _canvas?: boolean) {
    return v;
  }

  destroy() {
    this.destroyed = true;
    this.root.remove();
  }
}

export default FakeUPlot;
