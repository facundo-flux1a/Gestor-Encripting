"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [isAnimating, setIsAnimating] = React.useState(false)
  const [showPulse, setShowPulse] = React.useState(false)

  const toggleTheme = () => {
    setIsAnimating(true)
    setShowPulse(true)
    setTheme(theme === "dark" ? "light" : "dark")
    setTimeout(() => setIsAnimating(false), 3)
    setTimeout(() => setShowPulse(false), 1000)
  }

  return (
    <div className="relative h-9 w-9 sm:h-10 sm:w-10">
      {/* Pulsos violetas */}
      {showPulse && (
        <>
          <span className="absolute inset-0 rounded-md bg-violet-500/30 animate-ping" />
          <span className="absolute inset-0 rounded-md bg-violet-500/20 animate-pulse" />
        </>
      )}
      
      <button
        onClick={toggleTheme}
        className={`
          relative h-full w-full
          flex items-center justify-center
          transition-transform duration-300 ease-out
          hover:opacity-80
          ${isAnimating ? 'rotate-[360deg]' : 'rotate-0'}
        `}
      >
        <Sun className="h-4 w-4 sm:h-[1.2rem] sm:w-[1.2rem] rotate-0 scale-100 transition-all duration-500 dark:-rotate-90 dark:scale-0 shrink-0" />
        <Moon className="absolute h-4 w-4 sm:h-[1.2rem] sm:w-[1.2rem] rotate-90 scale-0 transition-all duration-500 dark:rotate-0 dark:scale-100 shrink-0" />
        <span className="sr-only">Toggle theme</span>
      </button>
    </div>
  )
}