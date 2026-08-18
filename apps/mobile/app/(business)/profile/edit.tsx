import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	TextField,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useAuthStore } from "@/features/auth/store";
import {
	useBusinesses,
	useBusinessProfile,
	useUpdateBusiness,
} from "@/features/business/hooks";

export default function BusinessEditScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const businessId = businesses?.[0]?.id ?? "";
	const { data, isLoading, isError, error, refetch } = useBusinessProfile(
		businessId,
	);
	const update = useUpdateBusiness(businessId);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [website, setWebsite] = useState("");
	const [saving, setSaving] = useState(false);
	const hydrated = useRef(false);

	useEffect(() => {
		if (!data || hydrated.current) return;
		hydrated.current = true;
		setName(data.business.name ?? "");
		setDescription(data.business.description ?? "");
		setPhone(data.business.phone ?? "");
		setEmail(data.business.email ?? "");
		setWebsite(data.business.website ?? "");
	}, [data]);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!data) return <LoadingView />;

	const save = () => {
		setSaving(true);
		update.mutate(
			{
				name: name.trim(),
				description: description.trim() || null,
				phone: phone.trim() || null,
				email: email.trim() || null,
				website: website.trim() || null,
			},
			{
				onSuccess: () => {
					setSaving(false);
					router.back();
				},
				onError: () => setSaving(false),
			},
		);
	};

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={strings.business.editBusinessTitle}
					onBack={() =>
						router.canGoBack() ? router.back() : router.replace("/profile")
					}
				/>
				<View style={styles.form}>
					<TextField
						label={strings.business.editBusinessName}
						value={name}
						onChangeText={setName}
						placeholder={data.business.name}
					/>
					<TextField
						label={strings.business.editBusinessDescription}
						value={description}
						onChangeText={setDescription}
						multiline
					/>
					<TextField
						label={strings.business.locationPhone}
						value={phone}
						onChangeText={setPhone}
						keyboardType="phone-pad"
					/>
					<TextField
						label={strings.business.editBusinessEmail}
						value={email}
						onChangeText={setEmail}
						keyboardType="email-address"
					/>
					<TextField
						label={strings.business.editBusinessWebsite}
						value={website}
						onChangeText={setWebsite}
						keyboardType="url"
						autoCapitalize="none"
					/>
					{update.isError ? (
						<AppText variant="bodySmall" style={{ color: colors.destructive }}>
							{strings.business.editBusinessError}
						</AppText>
					) : null}
					<Button
						label={strings.business.couponSave}
						fullWidth
						loading={saving}
						disabled={!name.trim()}
						onPress={save}
					/>
				</View>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1 },
	form: { marginTop: spacing.xl },
});