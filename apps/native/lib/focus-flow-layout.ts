const FOCUS_FLOW_COLUMNS = 3;
const FOCUS_FLOW_GAP = 8;

export function focusFlowCellSize(containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 0;
  const availableWidth = containerWidth - FOCUS_FLOW_GAP * (FOCUS_FLOW_COLUMNS - 1);
  return Math.max(0, Math.floor(availableWidth / FOCUS_FLOW_COLUMNS));
}
