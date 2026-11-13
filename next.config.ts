import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailwind CSS v4 compiles through the official Turbopack loader. Without
  // this rule `app/globals.css` is emitted verbatim — `@theme`,
  // `@custom-variant` and every `@apply` stay unresolved and the build ships
  // zero generated utility CSS (verified: the production chunk contained no
  // `oklch` and no `.flex{}` before this was added).
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
