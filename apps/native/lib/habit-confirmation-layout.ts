const CONFIRMATION_SHEET_MAX_HEIGHT = 640;
const CONFIRMATION_SHEET_HEIGHT_RATIO = 0.82;

export function confirmationSheetHeight(viewportHeight: number) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  return Math.min(
    CONFIRMATION_SHEET_MAX_HEIGHT,
    Math.floor(viewportHeight * CONFIRMATION_SHEET_HEIGHT_RATIO),
  );
}
