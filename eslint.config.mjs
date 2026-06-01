import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [".next/**", "node_modules/**", "test-results/**"],
  },
  {
    rules: {
      "react-hooks/immutability": "off",
    },
  },
];

export default eslintConfig;
