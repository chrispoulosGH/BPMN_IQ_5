/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false, // Avoid conflicts with Ant Design reset
  },
  theme: {
    extend: {
      colors: {
        primary: '#1677ff',
        'sidebar-bg': '#001529',
      },
    },
  },
  plugins: [],
};
