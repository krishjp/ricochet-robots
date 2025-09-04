import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    'text-red-400', 'text-blue-400', 'text-green-400', 'text-yellow-400',
    'border-red-400', 'border-blue-400', 'border-green-400', 'border-yellow-400',
    'text-red-500', 'text-blue-500', 'text-green-500', 'text-yellow-500',
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
};
export default config;