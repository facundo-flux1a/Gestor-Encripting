import * as React from "react"

import { cn } from "@/lib/utils"

// 🆕 Interface para exponer la ref del contenedor scrollable
interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  scrollContainerRef?: React.RefObject<HTMLDivElement>
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, scrollContainerRef, ...props }, ref) => {
    const internalRef = React.useRef<HTMLDivElement>(null)
    const containerRef = scrollContainerRef || internalRef

    // 🎯 Effect para scroll continuo con teclado GLOBAL
    React.useEffect(() => {
      const container = containerRef.current
      if (!container) return

      let scrollDirection = 0 // -1 = izquierda, 1 = derecha, 0 = parado
      let animationFrameId: number | null = null
      let isKeyPressed = false // 🔥 Bandera para evitar múltiples disparos
      const scrollSpeed = 15 // Ajusta este valor para más/menos velocidad
      let frameCount = 0 // 🔍 Contador de frames

      // Función que hace el scroll continuo
      const scroll = () => {
        if (scrollDirection !== 0 && container) {
          const before = container.scrollLeft
          container.scrollLeft += scrollDirection * scrollSpeed
          const after = container.scrollLeft
          const actualScroll = Math.abs(after - before)

          frameCount++
          if (frameCount % 60 === 0) { // Log cada 60 frames (~1 segundo)
            console.log('🔍 Scroll Stats:', {
              direction: scrollDirection,
              scrollSpeed,
              actualScroll,
              scrollLeft: container.scrollLeft,
              frameCount
            })
          }

          animationFrameId = requestAnimationFrame(scroll)
        }
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        // Verificar si estamos en un input/textarea
        const target = e.target as HTMLElement
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return
        }

        // 🔥 Si la tecla ya está presionada, ignorar
        if (e.repeat) {
          console.log('⚠️ Evento repeat ignorado')
          return
        }

        // Detectar dirección y empezar scroll continuo
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          console.log('⬅️ INICIO scroll izquierda')
          scrollDirection = -1
          isKeyPressed = true
          frameCount = 0
          if (animationFrameId === null) {
            scroll()
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          console.log('➡️ INICIO scroll derecha')
          scrollDirection = 1
          isKeyPressed = true
          frameCount = 0
          if (animationFrameId === null) {
            scroll()
          }
        }
      }

      const handleKeyUp = (e: KeyboardEvent) => {
        // Detener scroll cuando se suelta la tecla
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          console.log('🛑 STOP scroll - Total frames:', frameCount)
          scrollDirection = 0
          isKeyPressed = false
          if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
          }
        }
      }

      // 🔥 Agregar listeners a WINDOW para que funcione globalmente
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)

      return () => {
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('keyup', handleKeyUp)
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
        }
      }
    }, [containerRef])

    return (
      <div
        ref={containerRef}
        className="relative w-full overflow-auto custom-scrollbar"
      >
        <table
          ref={ref}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    )
  }
)
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-full px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}