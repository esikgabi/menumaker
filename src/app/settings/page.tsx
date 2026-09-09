import { requireHousehold } from '@/lib/session';

export default async function SettingsPage() {
  await requireHousehold();
  return <h1 className="text-2xl font-bold">Household Settings</h1>;
}
