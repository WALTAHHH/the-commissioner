import type { NextConfig } from "next";

// Tailwind v4 is processed by its Turbopack loader (see @tailwindcss/turbopack
// README). Without this rule, `next build` emits globals.css verbatim: @theme
// and @import "tailwindcss" never expand, so the app ships unstyled.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
