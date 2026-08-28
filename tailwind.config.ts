import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['Inter', 'sans-serif'],
        headline: ['Manrope', 'Inter', 'sans-serif'],
        display: ['Manrope', 'Inter', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        // Alias de migración: evita que los componentes heredados vuelvan a
        // introducir violeta/púrpura mientras se los lleva al sistema Muvail.
        muvail: {
          50: '#effaf6',
          100: '#d6f3ea',
          200: '#aee6d5',
          300: '#78d2ba',
          400: '#3bbe9d',
          500: '#0e9a7b',
          600: '#087a64',
          700: '#006b5e',
          800: '#075246',
          900: '#0b3d36',
          950: '#062722',
        },
        violet: {
          50: '#effaf6',
          100: '#d6f3ea',
          200: '#aee6d5',
          300: '#78d2ba',
          400: '#3bbe9d',
          500: '#0e9a7b',
          600: '#087a64',
          700: '#006b5e',
          800: '#075246',
          900: '#0b3d36',
          950: '#062722',
        },
        purple: {
          50: '#effaf6',
          100: '#d6f3ea',
          200: '#aee6d5',
          300: '#78d2ba',
          400: '#3bbe9d',
          500: '#0e9a7b',
          600: '#087a64',
          700: '#006b5e',
          800: '#075246',
          900: '#0b3d36',
          950: '#062722',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        vat: {
          base: 'hsl(var(--vat-base))',
          '21': 'hsl(var(--vat-21))',
          '10': 'hsl(var(--vat-10))',
          '4': 'hsl(var(--vat-4))',
          other: 'hsl(var(--vat-other))',
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
