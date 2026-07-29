/**
 * Tool registry.
 *
 * Each tool describes itself in a `tool.ts` next to its `page.tsx`, and the
 * Tools index renders whatever has registered. Adding a tool never means
 * editing the index page:
 *
 *   1. create `src/app/tools/<slug>/page.tsx`   — the tool itself
 *   2. create `src/app/tools/<slug>/tool.ts`    — its card:
 *
 *        import { registerTool } from "@/lib/tools/registry";
 *
 *        registerTool({
 *          slug: "<slug>",
 *          label: "My Tool",
 *          description: "What it does.",
 *          icon: "build",
 *        });
 *
 *   3. add one line to `src/lib/tools/manifest.ts`:
 *
 *        import "@/app/tools/<slug>/tool";
 *
 * Comment out that manifest line to hide the tool from the index. The route
 * itself keeps working — Next.js owns routing, not this registry — so a
 * disabled tool is hidden, not deleted. Delete the folder to remove it fully.
 *
 * This module deliberately has no imports of its own: the per-tool `tool.ts`
 * files import it, and the manifest imports them, so keeping it a leaf is what
 * stops that chain from becoming a cycle.
 */

export interface ToolDefinition {
  /**
   * URL segment under `/tools`, and the registry key. Must match the folder
   * name — the href is derived from it so the two cannot drift apart.
   */
  slug: string;
  /** Card title. */
  label: string;
  /** One-line summary shown under the title. */
  description: string;
  /** Material Symbols (rounded) ligature name, e.g. "analytics". */
  icon: string;
  /** Optional short tag rendered beside the title, e.g. "beta". */
  badge?: string;
}

/** A registered tool, with its route resolved. */
export interface RegisteredTool extends ToolDefinition {
  /** Always `/tools/<slug>`. */
  href: string;
}

// Insertion-ordered, so the manifest's import order is the display order.
const registry = new Map<string, RegisteredTool>();

/**
 * Register a tool for the Tools index.
 *
 * Called for side effect at module load. Re-registering the same slug replaces
 * the entry rather than duplicating it, which keeps dev Fast Refresh (and
 * StrictMode's double-invoke) idempotent.
 */
export function registerTool(definition: ToolDefinition): void {
  const slug = definition.slug.trim();
  if (!slug) {
    // A blank slug would collide with every other blank one and route nowhere.
    console.warn("[tools] registerTool called with an empty slug — ignored.");
    return;
  }
  registry.set(slug, { ...definition, slug, href: `/tools/${slug}` });
}

/** Every registered tool, in manifest order. */
export function getTools(): RegisteredTool[] {
  return [...registry.values()];
}

/** One tool by slug, or undefined when it is not registered. */
export function getTool(slug: string): RegisteredTool | undefined {
  return registry.get(slug);
}
