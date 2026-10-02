import { strings } from "@/src/core/i18n/strings";
import { buildControllerIdentity } from "@/src/core/i18n/operator-identity";
import LegalScreen from "@/src/core/ui/LegalScreen";
import { useConfigValue } from "@/src/features/config";

export default function TermsScreen() {
	const controllerIdentity = useConfigValue(
		"legal.controller_identity",
		"el operador de Rolé (identidad legal pendiente de publicación)",
	);
	const companyName = useConfigValue(
		"legal.company_name",
		"Operador de Rolé (pendiente)",
	);
	const ruc = useConfigValue("legal.ruc", "");
	const address = useConfigValue(
		"legal.address",
		"Quito, Ecuador (pendiente de confirmación)",
	);
	const contactEmail = useConfigValue(
		"legal.contact_email",
		strings.termsScreen.contactEmail,
	);
	const identity = buildControllerIdentity({
		companyName,
		ruc,
		address,
		controllerIdentity,
	});
	const sections = strings.termsScreen.sections.map((section) => ({
		...section,
		content: section.content
			.replace("{controllerIdentity}", identity)
			.replace("{contactEmail}", contactEmail),
	}));

	return (
		<LegalScreen
			title={strings.termsScreen.title}
			updatedAt={strings.termsScreen.updatedAt}
			sections={sections}
		/>
	);
}
