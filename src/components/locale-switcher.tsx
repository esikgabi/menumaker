'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { setLocale } from '@/lib/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  return (
    <Select
      value={locale}
      onValueChange={async (value) => {
        await setLocale(value);
        router.refresh();
      }}
    >
      <SelectTrigger className="w-24">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((l) => (
          <SelectItem key={l} value={l}>
            {l.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
