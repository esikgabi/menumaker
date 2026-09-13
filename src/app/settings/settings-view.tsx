'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  renameHouseholdAction,
  leaveHouseholdAction,
  createTagAction,
  renameTagAction,
  deleteTagAction,
} from './actions';

type Member = { id: string; name: string | null; email: string };
type Tag = { id: string; name: string };

export function SettingsView({
  householdName,
  inviteCode,
  currentUserId,
  members,
  tags,
}: {
  householdName: string;
  inviteCode: string;
  currentUserId: string;
  members: Member[];
  tags: Tag[];
}) {
  const t = useTranslations('Settings');
  const router = useRouter();
  const [tagList, setTagList] = useState(tags);
  const [newTagName, setNewTagName] = useState('');
  const [copied, setCopied] = useState(false);

  const inviteLink =
    typeof window !== 'undefined' ? `${window.location.origin}/onboarding?code=${inviteCode}` : '';

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    const tag = await createTagAction(newTagName.trim());
    if (tag) setTagList((prev) => [...prev, tag]);
    setNewTagName('');
  }

  async function handleRenameTag(tagId: string) {
    const current = tagList.find((tag) => tag.id === tagId);
    const next = window.prompt(t('rename'), current?.name);
    if (!next || !next.trim()) return;
    await renameTagAction(tagId, next.trim());
    setTagList((prev) => prev.map((tag) => (tag.id === tagId ? { ...tag, name: next.trim() } : tag)));
  }

  async function handleDeleteTag(tagId: string) {
    await deleteTagAction(tagId);
    setTagList((prev) => prev.filter((tag) => tag.id !== tagId));
  }

  async function handleLeave() {
    if (!window.confirm(t('leaveConfirm'))) return;
    await leaveHouseholdAction();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('householdNameLabel')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              await renameHouseholdAction(formData);
              router.refresh();
            }}
            className="flex gap-2"
          >
            <Input name="name" defaultValue={householdName} maxLength={100} required />
            <Button type="submit">{t('save')}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('inviteCodeLabel')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="font-mono text-lg">{inviteCode}</p>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">{t('inviteLinkLabel')}</Label>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('membersTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.id} className="text-sm">
                {member.name ?? member.email}
                {member.id === currentUserId ? ` ${t('you')}` : ''}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tagsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1">
            {tagList.map((tag) => (
              <li key={tag.id} className="flex items-center justify-between text-sm">
                <span>{tag.name}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleRenameTag(tag.id)}>
                    {t('rename')}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => handleDeleteTag(tag.id)}>
                    {t('delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              placeholder={t('newTagPlaceholder')}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={handleAddTag}>
              {t('addTag')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="destructive" onClick={handleLeave}>
          {t('leaveHousehold')}
        </Button>
        <Button type="button" variant="outline" onClick={() => signOut({ callbackUrl: '/signin' })}>
          {t('signOut')}
        </Button>
      </div>
    </div>
  );
}
