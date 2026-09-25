import { requireHousehold } from '@/lib/session';
import { getHousehold, listHouseholdMembers } from '@/lib/household';
import { listTags } from '@/lib/meal';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SettingsView } from './settings-view';

export default async function SettingsPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Settings');

  const [household, members, tags] = await Promise.all([
    getHousehold(householdId),
    listHouseholdMembers(householdId),
    listTags(householdId),
  ]);
  if (!household) redirect('/onboarding'); // household vanished under us (e.g. last member left)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <SettingsView
        householdName={household.name}
        inviteCode={household.inviteCode}
        currentUserId={session.user.id}
        members={members}
        tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        activeWeekdays={household.activeWeekdays}
      />
    </div>
  );
}
