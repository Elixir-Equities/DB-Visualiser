/**
 * Theme is anchored on #11242d — that exact hex is `theme-900`, the surface
 * used for the sidebar, breadcrumb and panel chrome. Every other step is the
 * same hue (199°) walked along Tailwind's default gray lightness curve, so the
 * contrast relationships the UI was built against still hold.
 *
 * `gray` aliases the same scale: the existing `bg-gray-900` / `text-gray-600`
 * classes pick up the palette without touching each component.
 */
const theme = {
  50:  '#f8fbfc',
  100: '#f1f6f8',
  200: '#e1ebef',
  300: '#c8d8df',
  400: '#92adb9',
  // Lifted from #598091 so muted text clears WCAG AA (≥4.5:1) on 900/950.
  500: '#6a91a3',
  600: '#3d6071',
  700: '#2a4b5a',
  800: '#19323e',
  900: '#11242d',
  950: '#081217',
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        theme,
        gray: theme,
      },
      keyframes: {
        indeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        indeterminate: 'indeterminate 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
