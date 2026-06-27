import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_0_20px_rgba(255,107,0,0.18)] hover:bg-[var(--accent-hover)]",
        destructive:
          "bg-[var(--status-error)] text-white shadow-sm hover:opacity-90",
        outline:
          "border border-[var(--secondary-border)] bg-transparent text-[var(--secondary)] hover:bg-[var(--secondary-muted)]",
        secondary:
          "bg-[var(--bg-surface-secondary)] text-[var(--text-primary)] border border-[var(--border)] shadow-sm hover:bg-[var(--hover-bg)]",
        ghost: "hover:bg-[var(--secondary-muted)] text-[var(--secondary)]",
        link: "text-[var(--secondary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
