import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, FONT_MONO } from "../constants";
import { GradientBg } from "../components/GradientBg";

const METRICS = [
  { value: "25K+",   label: "Hours tracked per month" },
  { value: "150+",   label: "Teams onboarded"         },
  { value: "< 8hrs", label: "Average approval time"   },
];

export const Scene09CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Scene fade in
  const sceneOpacity = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Logo spring entrance
  const logoScale = spring({ frame, fps, config: { damping: 200 } });
  const logoOpacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Headline appears at 0.6s
  const headOpacity = interpolate(frame, [0.6 * fps, 1.3 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const headY = interpolate(frame, [0.6 * fps, 1.3 * fps], [24, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // URL pulse glow
  const urlGlow = interpolate(
    Math.sin(frame * 0.06),
    [-1, 1],
    [0.12, 0.32]
  );

  // CTA buttons appear at 4.0s
  const ctaOpacity = interpolate(frame, [4.0 * fps, 4.8 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const ctaY = interpolate(frame, [4.0 * fps, 4.8 * fps], [16, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      <GradientBg variant="brand" />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 120px",
          gap: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            marginBottom: 32,
          }}
        >
          <Img
            src={staticFile("webforx-logo.png")}
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              objectFit: "contain",
              boxShadow: `0 0 48px ${C.accentGlow}, 0 0 80px rgba(37,99,235,0.2)`,
            }}
          />
        </div>

        {/* Two-line headline */}
        <div
          style={{
            opacity: headOpacity,
            transform: `translateY(${headY}px)`,
            textAlign: "center",
            marginBottom: 48,
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontSize: 64,
              fontWeight: 800,
              color: C.text,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
            }}
          >
            Your team&apos;s time.
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              background: `linear-gradient(90deg, ${C.accentLt}, ${C.purpleLt})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Finally visible.
          </div>
        </div>

        {/* Three metric boxes */}
        <div
          style={{
            display: "flex",
            gap: 24,
            width: "100%",
            marginBottom: 48,
          }}
        >
          {METRICS.map((m, i) => {
            const delay = Math.round((1.5 + i * 0.35) * fps);
            const local = Math.max(0, frame - delay);
            const mScale = spring({ frame: local, fps, config: { damping: 200 } });
            const mOpacity = interpolate(local, [0, 0.4 * fps], [0, 1], {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
            });

            return (
              <div
                key={m.value}
                style={{
                  flex: 1,
                  opacity: mOpacity,
                  transform: `scale(${mScale})`,
                  background: "rgba(12,20,38,0.7)",
                  border: `1px solid ${C.accentBorder}`,
                  borderRadius: 16,
                  padding: "28px 32px",
                  textAlign: "center",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 48,
                    fontWeight: 800,
                    color: C.accentLt,
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                    marginBottom: 10,
                  }}
                >
                  {m.value}
                </div>
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: 15,
                    color: C.textSub,
                    fontWeight: 500,
                  }}
                >
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* URL chip */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              padding: "14px 40px",
              borderRadius: 12,
              background: "rgba(12,20,38,0.8)",
              border: `1px solid ${C.accentBorder}`,
              fontFamily: FONT_MONO,
              fontSize: 22,
              fontWeight: 600,
              color: C.accentLt,
              letterSpacing: "0.04em",
              boxShadow: `0 0 40px rgba(37,99,235,${urlGlow}), 0 0 80px rgba(37,99,235,${urlGlow * 0.5})`,
            }}
          >
            timer.dev.webforxtech.com
          </div>

          {/* CTA buttons */}
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div
              style={{
                padding: "16px 36px",
                borderRadius: 12,
                background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
                fontFamily: FONT,
                fontSize: 18,
                fontWeight: 700,
                color: "#fff",
                boxShadow: `0 4px 32px rgba(37,99,235,0.4)`,
              }}
            >
              Sign In Now →
            </div>
            <div
              style={{
                padding: "16px 36px",
                borderRadius: 12,
                background: "transparent",
                border: `1px solid ${C.border}`,
                fontFamily: FONT,
                fontSize: 18,
                fontWeight: 600,
                color: C.textSub,
              }}
            >
              Schedule a Demo
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
