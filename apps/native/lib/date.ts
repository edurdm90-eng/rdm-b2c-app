export function formatDayKey(dayKey: string) {
  return new Date(`${dayKey}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDayRange(startDayKey: string, endDayKeyExclusive: string) {
  const start = new Date(`${startDayKey}T12:00:00`);
  const endInclusive = new Date(`${endDayKeyExclusive}T12:00:00`);
  endInclusive.setDate(endInclusive.getDate() - 1);
  const sameMonth = start.getMonth() === endInclusive.getMonth() && start.getFullYear() === endInclusive.getFullYear();
  if (sameMonth) {
    const startDay = start.toLocaleDateString(undefined, { day: "numeric" });
    const endPart = endInclusive.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    return `${startDay} – ${endPart}`;
  }
  return `${formatDayKey(startDayKey)} – ${formatDayKey(endDayKeyExclusive)}`;
}
