import { requireHousehold } from '@/lib/session';

export default async function PlanPage() {
  await requireHousehold();
  return <h1 className="text-2xl font-bold">Weekly Plan</h1>;
}
