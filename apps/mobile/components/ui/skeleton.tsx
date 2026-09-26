import { cn } from '@/lib/utils';
import { View } from 'react-native';

// ponytail: bg-muted resolves to #F7F3FB on a #FBFAFD page (~2% apart), so the
// block rendered but was invisible. bg-secondary is the lightest mapped token
// with real contrast. Kept as a className on purpose: useTheme() throws without
// a ThemeProvider and this leaf must never crash a loading state.
function Skeleton({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  return <View className={cn('bg-secondary animate-pulse rounded-md', className)} {...props} />;
}

export { Skeleton };
