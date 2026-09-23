import { Text, TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useTheme } from '@/src/core/theme';
import { View } from 'react-native';

function Card({ className, style, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  const { colors } = useTheme();
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View
        className={cn(
          'bg-card border-border flex flex-col gap-3 rounded-xl border py-3 shadow-sm shadow-black/5',
          className
        )}
        // Native tokens: bg-card/border-border vars stay light on native.
        // Width/padding/gap utilities are static and keep working, so only
        // colors go through style; className stays as web enhancement.
        style={[{ backgroundColor: colors.card, borderColor: colors.borderSolid }, style]}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  // Text color must ride the class context: a View's `color` style does not
  // inherit to child Text on native, and an incoming `style` prop would clobber
  // it anyway. Every Text under the header resolves to muted via resolveTextColor.
  return (
    <TextClassContext.Provider value="text-muted-foreground">
      <View className={cn('flex gap-1 px-4', className)} {...props} />
    </TextClassContext.Provider>
  );
}

function CardTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<typeof Text>) {

  return (
    <Text
      ref={ref}
      role="heading"
      aria-level={3}
      className={cn('font-semibold leading-none gap-1 px-4', className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<typeof Text>) {
  return <Text className={cn('px-4 text-muted-foreground text-sm', className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <View className={cn('px-4', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <View className={cn('flex flex-row items-center px-6', className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
