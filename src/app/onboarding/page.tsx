import { requireSessionNoHousehold } from '@/lib/session';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  await requireSessionNoHousehold();
  return <OnboardingForm />;
}
