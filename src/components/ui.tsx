import * as React from "react"
import { cn } from "../lib/utils"
import { CheckCircle2, AlertCircle, Info, X, Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react"

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

export const LoadingButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
    size?: 'default' | 'sm' | 'lg';
    isLoading?: boolean;
    loadingLabel?: string;
  }
>(({ isLoading, loadingLabel, children, disabled, ...props }, ref) => (
  <Button ref={ref} disabled={disabled || isLoading} {...props}>
    {isLoading ? (
      <>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        {loadingLabel ?? children}
      </>
    ) : (
      children
    )}
  </Button>
))
LoadingButton.displayName = "LoadingButton"

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

/** Text input with a leading search icon and a clear button. */
export const SearchInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onValueChange: (value: string) => void }
>(({ value, onValueChange, className, ...props }, ref) => (
  <div className={cn("relative", className)}>
    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <Input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="pl-9 pr-8 h-9 text-sm bg-white"
      {...props}
    />
    {value && (
      <button
        type="button"
        onClick={() => onValueChange('')}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        title="Clear search"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
))
SearchInput.displayName = "SearchInput"

/** "Showing 21-40 of 175" + Prev / Page X of Y / Next, with an optional page-size select. */
export function Pagination({
  page,
  totalPages,
  start,
  end,
  total,
  noun = 'items',
  onPageChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  className,
}: {
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  noun?: string;
  onPageChange: (page: number) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500", className)}>
      <div>
        Showing <span className="font-semibold text-slate-700">{start}</span>–<span className="font-semibold text-slate-700">{end}</span> of{' '}
        <span className="font-semibold text-slate-700">{total}</span> {noun}
      </div>
      <div className="flex items-center gap-1.5">
        {pageSize && pageSizeOptions && onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-600 mr-2"
            aria-label="Items per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="h-7 px-2 text-xs">
          <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
        </Button>
        <span className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="h-7 px-2 text-xs">
          Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
        </Button>
      </div>
    </div>
  )
}

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

// --- Toast notifications --------------------------------------------------
// Replaces alert()/window.alert() with the app's existing inline-banner look.

type ToastVariant = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Imperative escape hatch so non-component code (the Zustand store's background
 * AI task runner) can surface toasts without a hook. ToastProvider wires the
 * real implementation in on mount; until then these are safe no-ops.
 */
export const toastBridge: ToastContextValue = {
  success: () => {},
  error: () => {},
  info: () => {},
};

const TOAST_ICON: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const TOAST_STYLE: Record<ToastVariant, string> = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  error: "bg-red-50 border-red-200 text-red-800",
  info: "bg-brand-50 border-brand-200 text-brand-800",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback((message: string, variant: ToastVariant) => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  const value = React.useMemo<ToastContextValue>(() => ({
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error'),
    info: (message: string) => push(message, 'info'),
  }), [push]);

  React.useEffect(() => {
    toastBridge.success = value.success;
    toastBridge.error = value.error;
    toastBridge.info = value.info;
  }, [value]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.variant];
          return (
            <div
              key={t.id}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in",
                TOAST_STYLE[t.variant]
              )}
            >
              <Icon className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-line leading-snug">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 opacity-60 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
