import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT } from "../constants";
import { GradientBg } from "../components/GradientBg";

const Problem: React.FC<{ text: string; delay: number; accent?: boolean }> = ({
  text,
  delay,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delay);

  const opacity = interpolate(local, [0, 0.6 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const translateY = interpolate(local, [0, 0.6 * fps], [28, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: "flex",
        alignItems: "center",
        gap: 20,
        marginBottom: 28,
      }}
    >
      {/* Bullet dash */}
      <div
        style={{
          width: accent ? 28 : 10,
          height: 2,
          background: accent ? C.danger : C.textMuted,
          borderRadius: 2,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: FONT,
          fontSize: accent ? 40 : 34,
          fontWeight: accent ? 700 : 400,
          color: accent ? "#F87171" : C.textSub,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
        }}
      >
        {text}
      </span>
    </div>
  );
};

export const Scene01Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Full scene fade in
  const sceneOpacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Fade out last 1s
  const sceneOut = interpolate(
    frame,
    [durationInFrames - fps, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // "The problem" label
  const labelOpacity = interpolate(frame, [0, 0.8 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity * sceneOut }}>
      <GradientBg variant="dark" />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "0 200px",
        }}
      >
        {/* Eyebrow label */}
        <div
          style={{
            opacity: labelOpacity,
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 600,
            color: C.accentLt,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 48,
          }}
        >
          The challenge
        </div>

        {/* Problem statements */}
        <Problem text="Scattered time tracking across teams." delay={Math.round(0.4 * fps)} />
        <Problem text="No visibility into project workloads." delay={Math.round(1.2 * fps)} />
        <Problem text="Inconsistent reporting. Missed hours." delay={Math.round(2.0 * fps)} />
        <Problem
          text="Management flying blind."
          delay={Math.round(2.8 * fps)}
          accent
        />

        {/* Separator + sub-copy */}
        {(() => {
          const copyOpacity = interpolate(frame, [4.5 * fps, 5.2 * fps], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });
          const copyY = interpolate(frame, [4.5 * fps, 5.2 * fps], [16, 0], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });
          return (
            <div
              style={{
                marginTop: 48,
                opacity: copyOpacity,
                transform: `translateY(${copyY}px)`,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 2,
                  background: C.accentLt,
                  borderRadius: 2,
                  marginBottom: 24,
                }}
              />
              <p
                style={{
                  fontFamily: FONT,
                  fontSize: 22,
                  fontWeight: 400,
                  color: C.textSub,
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                There&apos;s a better way.
              </p>
            </div>
          );
        })()}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
