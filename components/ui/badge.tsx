import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: { variant: {
    default: 'border-transparent bg-[var(--accent)] text-white',
    secondary: 'border-transparent bg-slate-100 text-slate-700',
    outline: 'border-[var(--line)] bg-white text-[var(--ink)]',
    destructive: 'border-red-200 bg-red-50 text-red-700',
  } }, defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
