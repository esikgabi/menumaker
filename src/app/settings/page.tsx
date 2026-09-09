import { requireHousehold } from '@/lib/session';
import { listHouseholdMembers } from '@/lib/household';
import { listTags } from '@/lib/meal';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import { SettingsView } from './settings-view';

export default async function SettingsPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Settings');

  const [household, members, tags] = await Promise.all([
    prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
    listHouseholdMembers(householdId),
    listTags(householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <SettingsView
        householdName={household.name}
        inviteCode={household.inviteCode}
        currentUserId={session.user.id}
        members={members}
        tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
      />
    </div>
  );
}
