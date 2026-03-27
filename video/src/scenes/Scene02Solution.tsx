import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT } from "../constants";
import { GradientBg } from "../components/GradientBg";

export const Scene02Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const sceneOut = interpolate(
    frame,
    [durationInFrames - fps, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Logo mark scale
  const logoScale = spring({ frame, fps, config: { damping: 200 } });

  // "WF" logomark opacity
  const logoOpacity = interpolate(frame, [0, 0.8 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Product name slide up
  const titleY = interpolate(frame, [0.6 * fps, 1.4 * fps], [40, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });
  const titleOpacity = interpolate(frame, [0.6 * fps, 1.4 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Tagline
  const tagOpacity = interpolate(frame, [1.6 * fps, 2.4 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Pill badges
  const pillOpacity = interpolate(frame, [2.5 * fps, 3.2 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Accent line width
  const lineWidth = interpolate(frame, [1.2 * fps, 2.0 * fps], [0, 320], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const pills = [
    { label: "Real-time tracking" },
    { label: "Role-based access" },
    { label: "Team visibility" },
    { label: "Reporting & exports" },
    { label: "Integrations" },
  ];

  return (
    <AbsoluteFill style={{ opacity: sceneOut }}>
      <GradientBg variant="brand" />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            marginBottom: 36,
          }}
        >
          <Img
            src={staticFile("webforx-logo.png")}
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              objectFit: "contain",
              boxShadow: `0 0 40px ${C.accentGlow}`,
            }}
          />
        </div>

        {/* Product name */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 72,
              fontWeight: 800,
              color: C.text,
              letterSpacing: "-0.04em",
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            Web Forx{" "}
            <span
              style={{
                background: `linear-gradient(90deg, ${C.accentLt}, ${C.purpleLt})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Time Tracker
            </span>
          </h1>
        </div>

        {/* Accent line */}
        <div
          style={{
            width: lineWidth,
            height: 3,
            background: `linear-gradient(90deg, ${C.accentLt}, ${C.purple})`,
            borderRadius: 2,
            marginTop: 28,
            marginBottom: 28,
          }}
        />

        {/* Tagline */}
        <div style={{ opacity: tagOpacity, textAlign: "center" }}>
          <p
            style={{
              fontFamily: FONT,
              fontSize: 28,
              fontWeight: 400,
              color: C.textSub,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            One platform. Every hour. Every team.
          </p>
        </div>

        {/* Feature pills */}
        <div
          style={{
            opacity: pillOpacity,
            display: "flex",
            gap: 12,
            marginTop: 52,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {pills.map((p) => (
            <div
              key={p.label}
              style={{
                padding: "8px 20px",
                borderRadius: 100,
                border: `1px solid ${C.accentBorder}`,
                background: C.accentGlow,
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 500,
                color: C.accentLt,
                letterSpacing: "0.01em",
              }}
            >
              {p.label}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
