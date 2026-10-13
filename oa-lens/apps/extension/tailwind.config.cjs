/** @type {import('tailwindcss').Config} */
module.exports = {
  // CLAUDE.md rule 5: every utility is prefixed so nothing can clash with Amazon's CSS.
  prefix: 'oal-',
  content: ['./entrypoints/**/*.{ts,tsx,html}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        profit: '#15803d',
        loss: '#dc2626',
        amz: '#ea580c',
      },
    },
  },
  plugins: [],
};
