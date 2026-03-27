import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, interpolate, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import { SCENE, SCENE_STARTS_SHORT, TOTAL_FRAMES_SHORT, TRANSITION_FRAMES, VO_DELAY } from "./constants";
import { Scene01Hook }      from "./scenes/Scene01Hook";
import { Scene02Solution }  from "./scenes/Scene02Solution";
import { Scene03Dashboard } from "./scenes/Scene03Dashboard";
import { Scene04Timer }     from "./scenes/Scene04Timer";
import { Scene06Reports }   from "./scenes/Scene06Reports";
import { Scene09CTA }       from "./scenes/Scene09CTA";

const transition = fade();
const timing     = linearTiming({ durationInFrames: TRANSITION_FRAMES });

// ─── Voiceover files for the 6-scene short cut ───────────────────────────────
const VO_FILES_SHORT = [
  "voiceover/scene-01.mp3",
  "voiceover/scene-02.mp3",
  "voiceover/scene-03.mp3",
  "voiceover/scene-04.mp3",
  "voiceover/scene-06.mp3",
  "voiceover/scene-09.mp3",
] as const;

const MUSIC_FILE   = "music/kornevmusic-upbeat-happy-corporate-487426.mp3";
const MUSIC_VOLUME = 0.12;

const BackgroundMusic: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();

  const volume = (f: number) =>
    interpolate(
      f,
      [0, 2 * fps, durationInFrames - 3 * fps, durationInFrames],
      [0, MUSIC_VOLUME, MUSIC_VOLUME, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

  return <Audio src={staticFile(MUSIC_FILE)} loop volume={volume} />;
};

const VO_FADE_FRAMES = 3;

const VoiceoverTracks: React.FC = () => (
  <>
    {VO_FILES_SHORT.map((file, i) => {
      const seqStart = SCENE_STARTS_SHORT[i] + VO_DELAY;
      const seqEnd   = i < VO_FILES_SHORT.length - 1
        ? SCENE_STARTS_SHORT[i + 1]
        : TOTAL_FRAMES_SHORT;
      const durationInFrames = seqEnd - seqStart;

      const volume = (f: number) =>
        interpolate(
          f,
          [durationInFrames - VO_FADE_FRAMES, durationInFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

      return (
        <Sequence key={file} from={seqStart} durationInFrames={durationInFrames} layout="none">
          <Audio src={staticFile(file)} volume={volume} />
        </Sequence>
      );
    })}
  </>
);

export const ShortDemoVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <BackgroundMusic />
      <VoiceoverTracks />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE.HOOK}>
          <Scene01Hook />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={transition} timing={timing} />

        <TransitionSeries.Sequence durationInFrames={SCENE.SOLUTION}>
          <Scene02Solution />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={transition} timing={timing} />

        <TransitionSeries.Sequence durationInFrames={SCENE.DASHBOARD}>
          <Scene03Dashboard />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={transition} timing={timing} />

        <TransitionSeries.Sequence durationInFrames={SCENE.TIMER}>
          <Scene04Timer />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={transition} timing={timing} />

        <TransitionSeries.Sequence durationInFrames={SCENE.REPORTS}>
          <Scene06Reports />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={transition} timing={timing} />

        <TransitionSeries.Sequence durationInFrames={SCENE.CTA}>
          <Scene09CTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
