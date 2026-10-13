// Shadow DOM does not isolate `rem`: it follows the host page's <html> font-size. Converting to px
// keeps the widget the same size on every Amazon page.
const remToPx = () => ({
  postcssPlugin: 'oal-rem-to-px',
  Declaration(decl) {
    if (!decl.value.includes('rem')) return;
    decl.value = decl.value.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${Number(n) * 16}px`);
  },
});
remToPx.postcss = true;

module.exports = {
  plugins: [require('tailwindcss'), remToPx, require('autoprefixer')],
};
