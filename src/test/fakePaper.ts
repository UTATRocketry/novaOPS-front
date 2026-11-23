import type { dia } from "@joint/core";

/**
 * A stand-in for dia.Paper. JointJS's own DOM layer does not initialise under
 * jsdom, but PidBridge only needs a paper to subscribe to pointer events, toggle
 * interactivity, scale it and find views in an area. This provides exactly that,
 * and lets a test fire the same events a real paper would.
 */
export class FakePaper {
  handlers = new Map<string, Array<(...args: any[]) => void>>();
  interactive: unknown = false;
  scaleValue = { sx: 1, sy: 1 };
  translation = { tx: 0, ty: 0 };
  el: HTMLElement;
  viewport: SVGGElement;
  fitCalls: unknown[] = [];

  constructor(public graph: dia.Graph) {
    this.el = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.viewport = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    this.viewport.setAttribute("class", "joint-viewport");
    svg.appendChild(this.viewport);
    this.el.appendChild(svg);
  }

  on(name: string, fn: (...args: any[]) => void) {
    const list = this.handlers.get(name) ?? [];
    list.push(fn);
    this.handlers.set(name, list);
    return this;
  }

  off(name: string) {
    this.handlers.delete(name);
    return this;
  }

  /** Fire an event as the paper would. */
  trigger(name: string, ...args: unknown[]) {
    for (const fn of this.handlers.get(name) ?? []) fn(...args);
  }

  /** A minimal cell view: the bridge reads only `.model`. */
  view(cell: dia.Cell) {
    return { model: cell } as unknown as dia.CellView;
  }

  setInteractivity(value: unknown) {
    this.interactive = value;
  }

  scale(sx?: number, sy?: number) {
    if (sx === undefined) return this.scaleValue;
    this.scaleValue = { sx, sy: sy ?? sx };
    return this;
  }

  translate(tx?: number, ty?: number) {
    if (tx === undefined) return this.translation;
    this.translation = { tx, ty: ty ?? 0 };
    return this;
  }

  scaleContentToFit(opts?: unknown) {
    this.fitCalls.push(opts);
    this.scaleValue = { sx: 1.25, sy: 1.25 };
  }

  findViewByModel() {
    return undefined;
  }

  /** Elements whose bounding box intersects the area. */
  findViewsInArea(area: { x: number; y: number; width: number; height: number }) {
    return this.graph
      .getCells()
      .filter((c) => {
        if (c.isLink()) return false;
        const b = (c as dia.Element).getBBox();
        return b.x < area.x + area.width && b.x + b.width > area.x && b.y < area.y + area.height && b.y + b.height > area.y;
      })
      .map((c) => ({ model: c }));
  }
}
