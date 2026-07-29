/**
 * The tool manifest — the one file you edit when adding or disabling a tool.
 *
 * Each line imports a tool's `tool.ts` for its side effect: the module calls
 * `registerTool(...)` at load, which puts its card on the Tools index.
 *
 *   - **Add a tool:** create `src/app/tools/<slug>/{page.tsx,tool.ts}` and add
 *     an import line below.
 *   - **Disable a tool:** comment out its line. The card disappears from the
 *     index; the route still resolves if someone has the URL bookmarked.
 *   - **Reorder the index:** move the lines — registration order is display
 *     order.
 *
 * These are intentionally bare side-effect imports with nothing to destructure,
 * so a bundler must not be told this package is side-effect-free.
 */

import "@/app/tools/servo/tool";
import "@/app/tools/relay/tool";
import "@/app/tools/soundboard/tool";
import "@/app/tools/analysis/tool";
