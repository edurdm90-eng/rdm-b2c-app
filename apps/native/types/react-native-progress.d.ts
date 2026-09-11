declare module "react-native-progress/Circle" {
  import type { ComponentType } from "react";
  import type { CirclePropTypes } from "react-native-progress";

  // The unwrapped circle avoids an unused Animated SVG on the static dashboard.
  export const ProgressCircle: ComponentType<CirclePropTypes>;
}
