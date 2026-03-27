import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../constants";

type Props = {
  label: string;
  sublabel?: string;
  delay?: number;
};

export const LowerThird: React.FC<Props> = ({ label, sublabel, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const localFrame = Math.max(0, frame - delay);

  const slideX = interpolate(localFrame, [0, 0.6 * fps], [-60, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const opacity = interpolate(localFrame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Fade out in last 1.5 seconds
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 1.5 * fps, durationInFrames - 0.3 * fps],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const finalOpacity = opacity * fadeOut;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "flex-start",
        padding: "0 80px 60px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `translateX(${slideX}px)`,
          opacity: finalOpacity,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            width: 4,
            height: sublabel ? 52 : 38,
            background: `linear-gradient(180deg, ${C.accentLt}, ${C.purple})`,
            borderRadius: 2,
            marginBottom: 4,
          }}
        />
        <span
          style={{
            fontFamily: FONT,
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span
            style={{
              fontFamily: FONT,
              fontSize: 16,
              fontWeight: 400,
              color: C.textSub,
              letterSpacing: "0.01em",
            }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
