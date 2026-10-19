import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn('h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-blue-100 disabled:opacity-50', className)} {...props} />;
}
