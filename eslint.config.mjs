import { dirname } from "path";
import { fileURLToPath } from "url";

import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "docs/**",
      "archive/**",
      "scripts/**",
      "next-env.d.ts",
      "coverage/**",
    ],
  },
  {
    rules: {
      // Import ordering
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",    // Node.js built-ins (fs, path, etc.)
            "external",   // npm packages (next, react, etc.)
            "internal",   // Absolute imports (@/...)
            ["parent", "sibling"], // Relative imports (../, ./)
            "index",      // index imports
            "object",     // TypeScript object imports
            "type",       // TypeScript type imports
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
          pathGroups: [
            {
              pattern: "react",
              group: "builtin",
              position: "before",
            },
            {
              pattern: "next/**",
              group: "builtin",
              position: "before",
            },
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["react", "next"],
        },
      ],
      // Consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      // No console in production (warnings only)
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];

export default eslintConfig;
