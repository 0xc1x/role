import { create } from "zustand";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";

export const useTabBarStore = create<{
	props: BottomTabBarProps | null;
	setProps: (props: BottomTabBarProps | null) => void;
}>((set) => ({
	props: null,
	setProps: (props) => set({ props }),
}));

export function setTabBarProps(props: BottomTabBarProps) {
	useTabBarStore.getState().setProps(props);
}
