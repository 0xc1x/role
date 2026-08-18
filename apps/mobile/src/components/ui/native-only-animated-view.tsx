import { Platform, Pressable, View } from 'react-native';
import Animated, { type AnimatedProps } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type NativeOnlyAnimatedViewProps =
  | (Omit<AnimatedProps<React.ComponentProps<typeof View>>, 'key'> & {
      as?: 'View';
    })
  | (Omit<AnimatedProps<React.ComponentProps<typeof Pressable>>, 'key'> & {
      as: 'Pressable';
    });

/**
 * This component is used to wrap animated views that should only be animated on native.
 * @param props - The props for the animated view.
 * @returns The animated view if the platform is native, otherwise the children.
 * @example
 * <NativeOnlyAnimatedView entering={FadeIn} exiting={FadeOut}>
 *   <Text>I am only animated on native</Text>
 * </NativeOnlyAnimatedView>
 */
function NativeOnlyAnimatedView(props: NativeOnlyAnimatedViewProps) {
  if (Platform.OS === 'web') {
    return <>{props.children as React.ReactNode}</>;
  }
  const { as, ...rest } = props;
  if (as === 'Pressable') {
    return (
      <AnimatedPressable
        {...(rest as Omit<
          React.ComponentProps<typeof AnimatedPressable>,
          'key'
        >)}
      />
    );
  }
  return (
    <Animated.View
      {...(rest as Omit<React.ComponentProps<typeof Animated.View>, 'key'>)}
    />
  );
}

export { NativeOnlyAnimatedView };