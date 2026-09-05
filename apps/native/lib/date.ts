export function formatDayKey(dayKey: string) {
  return new Date(`${dayKey}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
