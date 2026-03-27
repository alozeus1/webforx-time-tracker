import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, FONT_MONO } from "../constants";
import { GradientBg } from "../components/GradientBg";

const VALUE_PILLARS = [
  {
    icon: "◎",
    title: "Accountability",
    desc: "Every hour attributed to the right project, person, and purpose.",
    color: C.accentLt,
  },
  {
    icon: "⬡",
    title: "Visibility",
    desc: "Managers and admins see team activity, utilization, and workloads in real time.",
    color: C.purpleLt,
  },
  {
    icon: "△",
    title: "Clarity",
    desc: "Reliable reporting and clean exports — built for operational decisions.",
    color: C.successLt,
  },
];

export const Scene09CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Scene fade in
  const sceneOpacity = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Value pillars appear sequentially
  const pillarsStart = Math.round(0.5 * fps);

  // Divider line
  const lineWidth = interpolate(frame, [2.5 * fps, 3.5 * fps], [0, 400], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // CTA block
  const ctaOpacity = interpolate(frame, [3.5 * fps, 4.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const ctaY = interpolate(frame, [3.5 * fps, 4.5 * fps], [20, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // URL pulse glow
  const urlGlow = interpolate(
    Math.sin(frame * 0.06),
    [-1, 1],
    [0.08, 0.22]
  );

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
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            color: C.accentLt,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 40,
            opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
            }),
          }}
        >
          Built for teams that value their time
        </div>

        {/* Three value pillars */}
        <div
          style={{
            display: "flex",
            gap: 32,
            marginBottom: 60,
            width: "100%",
          }}
        >
          {VALUE_PILLARS.map((pillar, i) => {
            const delay = Math.round((pillarsStart + i * 0.4 * fps));
            const local = Math.max(0, frame - delay);
            const pScale = spring({ frame: local, fps, config: { damping: 200 } });
            const pOpacity = interpolate(local, [0, 0.4 * fps], [0, 1], {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
            });

            return (
              <div
                key={pillar.title}
                style={{
                  flex: 1,
                  opacity: pOpacity,
                  transform: `scale(${pScale})`,
                  background: C.bgCard,
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  padding: "32px 36px",
                  textAlign: "center",
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    fontSize: 32,
                    color: pillar.color,
                    marginBottom: 16,
                    lineHeight: 1,
                  }}
                >
                  {pillar.icon}
                </div>
                {/* Title */}
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: 22,
                    fontWeight: 700,
                    color: C.text,
                    letterSpacing: "-0.03em",
                    marginBottom: 12,
                  }}
                >
                  {pillar.title}
                </div>
                {/* Description */}
                <div
                  style={{
                    fontFamily: FONT,
                    fontSize: 15,
                    color: C.textSub,
                    lineHeight: 1.6,
                  }}
                >
                  {pillar.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div
          style={{
            width: lineWidth,
            height: 1,
            background: `linear-gradient(90deg, transparent, ${C.accentBorder}, transparent)`,
            marginBottom: 48,
          }}
        />

        {/* CTA block */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontSize: 28,
              fontWeight: 700,
              color: C.text,
              letterSpacing: "-0.03em",
              marginBottom: 8,
            }}
          >
            Start tracking. Stop guessing.
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 17,
              color: C.textSub,
              marginBottom: 36,
            }}
          >
            Web Forx Time Tracker · Built by Web Forx Technology Limited
          </div>

          {/* URL chip */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                padding: "16px 32px",
                borderRadius: 12,
                background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
                fontFamily: FONT,
                fontSize: 18,
                fontWeight: 700,
                color: "#fff",
                boxShadow: `0 4px 32px rgba(37,99,235,${urlGlow * 1.5})`,
              }}
            >
              Sign In Now →
            </div>
            <div
              style={{
                padding: "16px 32px",
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

          {/* URL */}
          <div
            style={{
              marginTop: 24,
              fontFamily: FONT_MONO,
              fontSize: 16,
              color: C.textMuted,
              letterSpacing: "0.02em",
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "10px 24px",
              display: "inline-block",
              boxShadow: `0 0 20px rgba(37,99,235,${urlGlow})`,
            }}
          >
            timer.dev.webforxtech.com
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
