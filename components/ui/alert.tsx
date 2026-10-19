import * as React from 'react';
import { cn } from '@/lib/utils';

export function Alert({ className, variant = 'default', ...props }: React.ComponentProps<'div'> & { variant?: 'default' | 'destructive' }) {
  return <div data-slot="alert" role={variant === 'destructive' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', variant === 'destructive' ? 'border-red-200 bg-red-50 text-red-800' : 'border-[var(--line)] bg-slate-50 text-[var(--ink)]', className)} {...props} />;
}
export function AlertTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 data-slot="alert-title" className={cn('mb-1 text-sm font-semibold', className)} {...props} />;
}
export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('text-sm leading-relaxed', className)} {...props} />;
}
