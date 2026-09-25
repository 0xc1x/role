import { Platform } from "react-native";

/** Visual overlap validated in the installed iOS PWA navbar. */
export const IOS_PWA_NAVBAR_OVERLAP = 30;

type IosStandaloneDocument = {
	documentElement: {
		dataset: {
			iosStandalone?: string;
		};
	};
};

/**
 * Returns the navbar overlap only for the iOS standalone web shell.
 * The marker is set before hydration by public/index.html.
 */
export function getIosPwaNavbarOverlap(
	platformOS: typeof Platform.OS = Platform.OS,
	documentRef: IosStandaloneDocument | null = typeof document === "undefined"
		? null
		: document,
): number {
	if (platformOS !== "web") return 0;

	return documentRef?.documentElement.dataset.iosStandalone === "true"
		? IOS_PWA_NAVBAR_OVERLAP
		: 0;
}
