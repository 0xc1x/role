import { Icon } from '@/components/ui/icon';
import { Text, TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useTheme } from '@/src/core/theme';
import { withAlpha } from '@/src/core/theme/alpha';
import type { ColorTokens, ThemeScheme } from '@/src/core/theme/colors';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { View, type ViewStyle } from 'react-native';

type AlertVariant = 'default' | 'success' | 'warning' | 'destructive' | 'info';

const alertVariants = cva('relative w-full rounded-lg border px-4 pb-2 pt-3.5', {
  variants: {
    variant: {
      // Default keeps the shadcn surface (bg-card/border-border exist in the
      // NativeWind preset). Semantic variants tint via theme tokens in
      // `style` (see getAlertTone) because those tokens are not Tailwind
      // colors — no hex, no `colors.x + "4D"` suffixes.
      default: 'bg-card border-border',
      success: '',
      warning: '',
      destructive: '',
      info: '',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const alertTextVariants = cva('text-sm text-foreground', {
  variants: {
    variant: {
      default: '',
      success: '',
      warning: '',
      // Kept for compat: AlertDescription keys its destructive tint off this.
      destructive: 'text-destructive',
      info: '',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

interface AlertTone {
  containerStyle?: { backgroundColor?: string; borderColor?: string };
  iconColor?: string;
  defaultIcon: LucideIcon;
}

function getAlertTone(
  variant: AlertVariant,
  colors: ColorTokens,
  scheme: ThemeScheme
): AlertTone {
  switch (variant) {
    case 'success':
      return {
        containerStyle: {
          backgroundColor: colors.surfaceSuccess,
          borderColor: colors.surfaceSuccessBorder,
        },
        iconColor: scheme === 'dark' ? colors.success : colors.successDark,
        defaultIcon: CircleCheck,
      };
    case 'warning':
      return {
        containerStyle: {
          backgroundColor: colors.surfaceWarning,
          borderColor: withAlpha(colors.warning, 0.35),
        },
        iconColor: scheme === 'dark' ? colors.warning : colors.warningDark,
        defaultIcon: TriangleAlert,
      };
    case 'destructive':
      return {
        containerStyle: {
          backgroundColor: colors.destructiveSurface,
          borderColor: colors.destructiveSurfaceBorder,
        },
        iconColor: scheme === 'dark' ? colors.destructiveVibrant : colors.destructive,
        defaultIcon: CircleAlert,
      };
    case 'info':
      return {
        containerStyle: {
          backgroundColor: colors.infoSurface,
          borderColor: colors.infoSurfaceBorder,
        },
        iconColor: colors.info,
        defaultIcon: Info,
      };
    default:
      return { defaultIcon: Info };
  }
}

type AlertProps = React.ComponentProps<typeof View> &
  React.RefAttributes<View> &
  VariantProps<typeof alertVariants> & {
    /**
     * Optional icon. When omitted, the variant resolves its own default
     * (Info / CircleCheck / TriangleAlert / CircleAlert). The icon is always
     * tinted with the variant color via injected `color` + `style` — callers
     * never set the icon color manually.
     */
    icon?: LucideIcon;
    iconClassName?: string;
  };

function Alert({
  className,
  style,
  variant,
  children,
  icon,
  iconClassName,
  ...props
}: AlertProps) {
  const { colors, scheme } = useTheme();
  const resolvedVariant: AlertVariant = variant ?? 'default';
  const tone = getAlertTone(resolvedVariant, colors, scheme);
  const ResolvedIcon = icon ?? tone.defaultIcon;
  return (
    <TextClassContext.Provider
      value={cn(alertTextVariants({ variant: resolvedVariant }), className)}>
      <View
        role="alert"
        className={cn(alertVariants({ variant: resolvedVariant }), className)}
        style={[tone.containerStyle, style]}
        {...props}>
        <View className="absolute left-3.5 top-3">
          {/*
            The icon always takes the variant color: `color` drives
            currentColor on native (react-native-svg), while the inline
            `style` wins over the NativeWind text-color classes on web.
            The `as ViewStyle` cast is needed because SvgProps types
            `style` as ViewStyle, which omits `color` (valid at runtime).
          */}
          <Icon
            as={ResolvedIcon}
            color={tone.iconColor}
            style={tone.iconColor ? ({ color: tone.iconColor } as unknown as ViewStyle) : undefined}
            className={cn('size-4', resolvedVariant === 'destructive' && 'text-destructive', iconClassName)}
          />
        </View>
        {children}
      </View>
    </TextClassContext.Provider>
  );
}

function AlertTitle({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn('mb-1 ml-0.5 min-h-4 pl-6 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  const textClass = React.useContext(TextClassContext);
  return (
    <Text
      className={cn(
        'text-muted-foreground ml-0.5 pb-1.5 pl-6 text-sm leading-relaxed',
        textClass?.includes('text-destructive') && 'text-destructive/90',
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle, alertTextVariants, alertVariants };
export type { AlertProps, AlertVariant };
