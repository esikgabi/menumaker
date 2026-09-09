export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns the 7 date keys (Monday..Sunday) for the week containing `reference`. */
export function getWeekDateKeys(reference: Date): string[] {
  const day = reference.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (day + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - mondayOffset),
  );

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return toDateKey(d);
  });
}
