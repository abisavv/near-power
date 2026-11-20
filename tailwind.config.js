/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter-Regular'],
        'inter-semibold': ['Inter-SemiBold'],
        'inter-bold': ['Inter-Bold'],
        mono: ['JetBrainsMono-Regular'],
        'mono-bold': ['JetBrainsMono-Bold'],
      },
    },
  },

  plugins: [],
};
