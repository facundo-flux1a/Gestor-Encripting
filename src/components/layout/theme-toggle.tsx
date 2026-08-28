"use client"

import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const toggleTheme = () => {
    const root = document.documentElement
    const nextTheme = root.classList.contains("dark") ? "light" : "dark"
    root.classList.remove("light", "dark")
    root.classList.add(nextTheme)
    root.style.colorScheme = nextTheme
    try {
      localStorage.setItem("muvail-theme", nextTheme)
    } catch {
      // El cambio visual no depende de que el navegador permita almacenamiento.
    }
  }

  return (
    <div className="relative h-9 w-9 sm:h-10 sm:w-10">
      <button
        onClick={toggleTheme}
        aria-label="Cambiar tema"
        className="relative flex h-full w-full items-center justify-center transition-transform duration-200 hover:opacity-80"
      >
        <Sun className="h-4 w-4 sm:h-[1.2rem] sm:w-[1.2rem] rotate-0 scale-100 transition-all duration-500 dark:-rotate-90 dark:scale-0 shrink-0" />
        <Moon className="absolute h-4 w-4 sm:h-[1.2rem] sm:w-[1.2rem] rotate-90 scale-0 transition-all duration-500 dark:rotate-0 dark:scale-100 shrink-0" />
        <span className="sr-only">Toggle theme</span>
      </button>
    </div>
  )
}
