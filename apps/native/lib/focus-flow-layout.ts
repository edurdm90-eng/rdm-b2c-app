export const FOCUS_FLOW_COLUMNS = 3;
export const FOCUS_FLOW_ROWS = 3;
export const FOCUS_FLOW_GAP = 8;

/**
 * Equal square cell size for a 3×3 Focus Flow board.
 * Floors so `cellSize * columns + gap * (columns - 1)` never exceeds the
 * measured container width (avoids wrap pushing a cell onto the next row).
 */
export function focusFlowCellSize(containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 0;
  const availableWidth = containerWidth - FOCUS_FLOW_GAP * (FOCUS_FLOW_COLUMNS - 1);
  return Math.max(0, Math.floor(availableWidth / FOCUS_FLOW_COLUMNS));
}

export function focusFlowBoardFits(containerWidth: number, cellSize = focusFlowCellSize(containerWidth)) {
  if (cellSize <= 0) return false;
  return cellSize * FOCUS_FLOW_COLUMNS + FOCUS_FLOW_GAP * (FOCUS_FLOW_COLUMNS - 1) <= containerWidth;
}

export function focusFlowTargetRingSize(cellSize: number) {
  if (cellSize <= 0) return 0;
  return Math.max(36, Math.min(70, Math.floor(cellSize * 0.72)));
}
