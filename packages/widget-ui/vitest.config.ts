import { defineConfig } from "vitest/config";

/**
 * A DOM environment, not workerd. This package is deliberately binding-free so
 * it can be tested this way; everything that touches a binding lives in
 * `apps/widget`. Same seam as `packages/reply-loop` against `apps/app`.
 */
export default defineConfig({
  test: {
    name: "widget-ui",
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
