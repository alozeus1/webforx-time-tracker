import React from "react";
import { Composition } from "remotion";
import { DemoVideo } from "./DemoVideo";
import { ShortDemoVideo } from "./ShortDemoVideo";
import { FPS, WIDTH, HEIGHT, TOTAL_FRAMES, TOTAL_FRAMES_SHORT } from "./constants";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DemoVideo"
        component={DemoVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="DemoVideoShort"
        component={ShortDemoVideo}
        durationInFrames={TOTAL_FRAMES_SHORT}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
