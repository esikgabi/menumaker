import { requireHousehold } from '@/lib/session';

export default async function MealsPage() {
  await requireHousehold();
  return <h1 className="text-2xl font-bold">Meals</h1>;
}
