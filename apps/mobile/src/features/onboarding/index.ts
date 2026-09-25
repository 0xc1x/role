export {
	BUSINESS_ONBOARDING_STEPS,
	CONSUMER_ONBOARDING_STEPS,
	ONBOARDING_SEEN_KEY_PREFIX,
	onboardingAudience,
	onboardingSeenKey,
	shouldShowOnboarding,
} from "./domain/onboarding";
export type {
	OnboardingAudience,
	OnboardingStep,
	OnboardingStepId,
} from "./domain/onboarding";
export {
	onboardingSeenQueryKey,
	onboardingStateQueryOptions,
	useMarkOnboardingSeen,
	useOnboardingState,
} from "./hooks";
