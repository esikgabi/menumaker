import { requireHousehold } from '@/lib/session';

export default async function HistoryPage() {
  await requireHousehold();
  return <h1 className="text-2xl font-bold">History</h1>;
}
