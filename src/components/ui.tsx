import * as React from "react"
import { cn } from "../lib/utils"

// A consolidated file of basic shadcn-like UI components to reduce file clutter

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary', size?: 'default' | 'sm' | 'lg' }>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
          {
            "bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-500/20": variant === 'default',
            "bg-slate-700 hover:bg-slate-600 text-white": variant === 'secondary',
            "bg-red-500 text-white hover:bg-red-600": variant === 'destructive',
            "border border-slate-200 hover:bg-slate-50 text-slate-600": variant === 'outline',
            "hover:bg-slate-50 text-slate-600": variant === 'ghost',
            "h-10 py-2 px-4 text-sm": size === 'default',
            "h-9 px-3 rounded-md text-xs": size === 'sm',
            "h-11 px-8 rounded-md text-sm": size === 'lg',
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-slate-200 bg-white p-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 block", className)}
      {...props}
    />
  )
)
Label.displayName = "Label"

export const Badge = ({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }) => {
  return (
    <div
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "bg-slate-200 text-slate-700": variant === 'default',
          "bg-green-100 text-green-700": variant === 'success',
          "bg-amber-100 text-amber-700": variant === 'warning',
          "bg-red-100 text-red-700": variant === 'destructive',
          "border border-slate-200 text-slate-800": variant === 'outline',
        },
        className
      )}
      {...props}
    />
  )
}

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm", className)} {...props} />
)
export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-xl", className)} {...props} />
)
export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-lg font-bold text-slate-800 tracking-tight", className)} {...props} />
)
export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-6", className)} {...props} />
)
export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl mt-auto", className)} {...props} />
)

export const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="relative w-full overflow-auto">
    <table className={cn("w-full text-left border-collapse", className)} {...props} />
  </div>
)
export const TableHeader = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold", className)} {...props} />
)
export const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("text-sm divide-y divide-slate-100 text-slate-800", className)} {...props} />
)
export const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("transition-colors hover:bg-slate-50 cursor-pointer group", className)} {...props} />
)
export const TableHead = ({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("px-4 py-4 align-middle", className)} {...props} />
)
export const TableCell = ({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-4 py-4 align-middle", className)} {...props} />
)
