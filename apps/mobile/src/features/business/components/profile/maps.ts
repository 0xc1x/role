import { Linking } from "react-native";

export async function openMaps(latitude: number, longitude: number) {
	await Linking.openURL(
		`https://maps.google.com/?q=${latitude},${longitude}`,
	).catch(() => {});
}

export async function openUrl(url: string) {
	await Linking.openURL(url).catch(() => {});
}
