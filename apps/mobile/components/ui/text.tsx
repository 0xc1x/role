import { cn } from '@/lib/utils';
import { useTheme } from '@/src/core/theme';
import type { ColorTokens } from '@/src/core/theme/colors';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, StyleSheet, Text as RNText, type Role } from 'react-native';

const textVariants = cva(
  cn(
    'text-foreground text-base',
    Platform.select({
      web: 'select-text',
    })
  ),
  {
    variants: {
      variant: {
        default: '',
        h1: cn(
          'text-center text-4xl font-extrabold tracking-tight',
          Platform.select({ web: 'scroll-m-20 text-balance' })
        ),
        h2: cn(
          'border-border border-b pb-2 text-3xl font-semibold tracking-tight',
          Platform.select({ web: 'scroll-m-20 first:mt-0' })
        ),
        h3: cn('text-2xl font-semibold tracking-tight', Platform.select({ web: 'scroll-m-20' })),
        h4: cn('text-xl font-semibold tracking-tight', Platform.select({ web: 'scroll-m-20' })),
        p: 'mt-3 leading-7 sm:mt-6',
        blockquote: 'mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6',
        code: cn(
          'bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold'
        ),
        lead: 'text-muted-foreground text-xl',
        large: 'text-lg font-semibold',
        small: 'text-sm font-medium leading-none',
        muted: 'text-muted-foreground text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  blockquote: Platform.select({ web: 'blockquote' as Role }),
  code: Platform.select({ web: 'code' as Role }),
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

/**
 * Native bridge: text color classes resolve through CSS vars that stay
 * locked to light values on native (.dark only toggles on web). Map the
 * base (state-less) text token to the theme so dark mode works; the
 * className stays as web enhancement and incoming style always wins.
 */
function resolveTextColor(classNames: string, colors: ColorTokens): string {
  const base = classNames.split(/\s+/).filter((t) => t && !t.includes(':'));
  const has = (token: string) => base.includes(token);
  if (has('text-primary-foreground')) return colors.primaryForeground;
  if (has('text-secondary-foreground')) return colors.secondaryForeground;
  if (has('text-accent-foreground')) return colors.accentForeground;
  if (has('text-muted-foreground')) return colors.mutedForeground;
  if (has('text-card-foreground')) return colors.cardForeground;
  if (has('text-destructive')) return colors.destructive;
  if (has('text-primary')) return colors.primary;
  if (has('text-white')) return '#fff';
  return colors.foreground;
}

function Text({
  className,
  asChild = false,
  variant = 'default',
  style,
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const { colors } = useTheme();
  const Component = asChild ? Slot : RNText;
  const mergedClass = cn(textVariants({ variant }), textClass, className);
  return (
    <Component
      className={mergedClass}
      style={StyleSheet.flatten([{ color: resolveTextColor(mergedClass, colors) }, style])}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
    />
  );
}

export { Text, TextClassContext };
