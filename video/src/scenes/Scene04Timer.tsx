import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, FONT_MONO, PROJECTS } from "../constants";
import { GradientBg } from "../components/GradientBg";
import { LowerThird } from "../components/LowerThird";
import { CalloutRing } from "../components/CalloutRing";

export const Scene04Timer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ─── Phase timing ─────────────────────────────────────────────────────────
  // 0–1.5s : panel slides in
  // 1.5–3s : dropdown opens and project is selected
  // 3–5s   : task description types
  // 5–6s   : start button pressed, timer begins
  // 6–10s  : timer running

  const panelOpacity = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const panelY = interpolate(frame, [0, 0.8 * fps], [40, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Dropdown opens at 1.5s, closes at 2.5s
  const dropdownOpen =
    frame > Math.round(1.5 * fps) && frame < Math.round(2.5 * fps);
  const dropdownOpacity = interpolate(
    frame,
    [1.5 * fps, 2.0 * fps, 2.4 * fps, 2.5 * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Task text typing: starts 3s, 60 chars total
  const taskFull = "API authentication middleware — sprint 14";
  const taskLen = Math.min(
    taskFull.length,
    Math.floor(
      interpolate(frame, [3 * fps, 4.8 * fps], [0, taskFull.length], {
        extrapolateRight: "clamp",
        extrapolateLeft: "clamp",
      })
    )
  );
  const taskTyped = taskFull.slice(0, taskLen);

  // Timer running: starts at 5.5s
  const TIMER_START = Math.round(5.5 * fps);
  const isRunning = frame >= TIMER_START;
  const elapsedSeconds = isRunning
    ? Math.floor((frame - TIMER_START) / fps)
    : 0;
  const h = Math.floor(elapsedSeconds / 3600);
  const m = Math.floor((elapsedSeconds % 3600) / 60);
  const s = elapsedSeconds % 60;
  const timerDisplay = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  // Button press animation
  const btnScale = isRunning
    ? 1 + spring({ frame: frame - TIMER_START, fps, config: { damping: 20 } }) * 0.04
    : 1;

  // Pulsing glow on timer when running
  const glowIntensity = isRunning
    ? interpolate(
        Math.sin((frame - TIMER_START) * 0.08),
        [-1, 1],
        [0.1, 0.4]
      )
    : 0;

  // Number counter scale bounce when running
  const counterScale = isRunning
    ? 1 +
      spring({ frame: frame - TIMER_START, fps, config: { damping: 200 } }) * 0.06
    : 1;

  return (
    <AbsoluteFill>
      <GradientBg variant="subtle" />

      {/* App chrome */}
      <AbsoluteFill
        style={{
          opacity: panelOpacity,
          transform: `translateY(${panelY}px)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: "48px 56px",
            width: 680,
            boxShadow: `0 40px 100px rgba(0,0,0,0.5)`,
            position: "relative",
          }}
        >
          {/* Header */}
          <div
            style={{
              fontFamily: FONT,
              fontSize: 13,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 600,
              marginBottom: 36,
            }}
          >
            Timer
          </div>

          {/* Timer display */}
          <div
            style={{
              textAlign: "center",
              marginBottom: 44,
            }}
          >
            <div
              style={{
                position: "relative",
                display: "inline-block",
              }}
            >
              {/* Glow behind timer */}
              {isRunning && (
                <div
                  style={{
                    position: "absolute",
                    inset: -20,
                    borderRadius: 20,
                    background: C.success,
                    opacity: glowIntensity,
                    filter: "blur(30px)",
                  }}
                />
              )}
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 90,
                  fontWeight: 700,
                  color: isRunning ? C.text : C.textSub,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  transform: `scale(${counterScale})`,
                  position: "relative",
                }}
              >
                {timerDisplay}
              </div>
            </div>

            {/* Running indicator */}
            {isRunning && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 16,
                  opacity: interpolate(frame - TIMER_START, [0, 0.4 * fps], [0, 1], {
                    extrapolateRight: "clamp",
                    extrapolateLeft: "clamp",
                  }),
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: C.success,
                    boxShadow: `0 0 8px ${C.success}`,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONT,
                    fontSize: 14,
                    color: C.success,
                    fontWeight: 500,
                  }}
                >
                  Timer running
                </span>
              </div>
            )}
          </div>

          {/* Project selector */}
          <div style={{ marginBottom: 20, position: "relative" }}>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 13,
                color: C.textSub,
                fontWeight: 500,
                marginBottom: 8,
              }}
            >
              Project
            </div>
            <div
              style={{
                background: C.bgCardAlt,
                border: `1px solid ${frame > Math.round(2.5 * fps) ? C.accentBorder : C.border}`,
                borderRadius: 10,
                padding: "13px 16px",
                fontFamily: FONT,
                fontSize: 15,
                color: C.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>
                {frame < Math.round(2.0 * fps) ? "Select a project…" : PROJECTS[0]}
              </span>
              <span style={{ color: C.textMuted, fontSize: 12 }}>▾</span>
            </div>

            {/* Dropdown */}
            {dropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: C.bgCardAlt,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  overflow: "hidden",
                  zIndex: 10,
                  opacity: dropdownOpacity,
                }}
              >
                {PROJECTS.slice(0, 5).map((p, i) => (
                  <div
                    key={p}
                    style={{
                      padding: "12px 16px",
                      fontFamily: FONT,
                      fontSize: 14,
                      color: i === 0 ? C.accentLt : C.textSub,
                      background: i === 0 ? C.accentGlow : "transparent",
                      borderBottom: i < 4 ? `1px solid ${C.border}` : "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: C.proj[i],
                        flexShrink: 0,
                      }}
                    />
                    {p}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task description */}
          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 13,
                color: C.textSub,
                fontWeight: 500,
                marginBottom: 8,
              }}
            >
              Task description
            </div>
            <div
              style={{
                background: C.bgCardAlt,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "13px 16px",
                fontFamily: FONT,
                fontSize: 15,
                color: C.text,
                minHeight: 48,
                display: "flex",
                alignItems: "center",
              }}
            >
              {taskTyped}
              {frame >= 3 * fps && taskLen < taskFull.length && (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 16,
                    background: C.accentLt,
                    marginLeft: 1,
                    opacity: Math.floor(frame / 10) % 2 === 0 ? 1 : 0,
                  }}
                />
              )}
            </div>
          </div>

          {/* Start / Stop button */}
          <div
            style={{
              background: isRunning
                ? "rgba(239,68,68,0.15)"
                : `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
              border: isRunning ? `1px solid rgba(239,68,68,0.4)` : "none",
              borderRadius: 12,
              padding: "16px",
              textAlign: "center",
              fontFamily: FONT,
              fontSize: 17,
              fontWeight: 700,
              color: isRunning ? C.danger : "#fff",
              transform: `scale(${btnScale})`,
              boxShadow: isRunning ? "none" : `0 4px 20px ${C.accentGlow}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {isRunning ? (
              <>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: C.danger,
                  }}
                />
                Stop Timer
              </>
            ) : (
              <>
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: "7px solid transparent",
                    borderBottom: "7px solid transparent",
                    borderLeft: "13px solid #fff",
                  }}
                />
                Start Timer
              </>
            )}
          </div>
        </div>
      </AbsoluteFill>

      {/* Callout rings */}
      {frame > Math.round(2.6 * fps) && frame < Math.round(5 * fps) && (
        <CalloutRing x={960} y={460} size={60} color={C.accentLt} delay={0} label="Project selected" />
      )}
      {frame >= TIMER_START && (
        <CalloutRing x={960} y={260} size={90} color={C.success} delay={0} />
      )}

      <LowerThird
        label="Live Timer"
        sublabel="One click. Every billable minute captured and attributed."
        delay={10}
      />
    </AbsoluteFill>
  );
};
