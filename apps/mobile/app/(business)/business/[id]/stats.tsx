import { Redirect } from "expo-router";

/** The full stats view lives in the business profile group. */
export default function BusinessStatsRedirect() {
	return <Redirect href="/profile/stats" />;
}