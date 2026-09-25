'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createMealAction, updateMealAction, createTagAction } from './actions';

type Tag = { id: string; name: string };
type Meal = { id: string; name: string; note: string | null; category: 'soup' | 'main'; durationDays: number; tags: Tag[] };

export function MealForm({
  meal,
  allTags,
  onClose,
}: {
  meal?: Meal;
  allTags: Tag[];
  onClose: () => void;
}) {
  const t = useTranslations('Meals');
  const [tags, setTags] = useState<Tag[]>(allTags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(meal?.tags.map((tg) => tg.id) ?? []);
  const [newTagName, setNewTagName] = useState('');
  const [category, setCategory] = useState<'soup' | 'main'>(meal?.category ?? 'main');
  const [durationDays, setDurationDays] = useState(meal?.durationDays ?? 1);

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    const tag = await createTagAction(newTagName.trim());
    if (tag) {
      setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      setSelectedTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
    }
    setNewTagName('');
  }

  async function handleSubmit(formData: FormData) {
    selectedTagIds.forEach((id) => formData.append('tagIds', id));
    formData.set('category', category);
    formData.set('durationDays', String(durationDays));
    if (meal) {
      await updateMealAction(meal.id, formData);
    } else {
      await createMealAction(formData);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meal ? t('editMeal') : t('addMeal')}</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">{t('nameLabel')}</Label>
            <Input id="name" name="name" defaultValue={meal?.name} required maxLength={100} />
          </div>

          <div>
            <Label htmlFor="note">{t('noteLabel')}</Label>
            <Input id="note" name="note" defaultValue={meal?.note ?? ''} maxLength={500} />
          </div>

          <div>
            <Label htmlFor="category">{t('categoryLabel')}</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as 'soup' | 'main')}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">{t('categoryMain')}</SelectItem>
                <SelectItem value="soup">{t('categorySoup')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="durationDays">{t('durationLabel')}</Label>
            <Input
              id="durationDays"
              name="durationDays"
              type="number"
              min={1}
              max={5}
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div>
            <Label>{t('tagsLabel')}</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder={t('newTagPlaceholder')}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={handleAddTag}>
                {t('addTag')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit">{t('save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
