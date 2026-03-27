import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, FONT_MONO, PROJECTS } from "../constants";
import { GradientBg } from "../components/GradientBg";
import { LowerThird } from "../components/LowerThird";
import { CalloutRing } from "../components/CalloutRing";

// ─── Bar chart data ───────────────────────────────────────────────────────────
const BAR_DATA = [
  { day: "Mon", hours: 8.25, label: "8:15" },
  { day: "Tue", hours: 9.25, label: "9:15" },
  { day: "Wed", hours: 10.25, label: "10:15" },
  { day: "Thu", hours: 7.5,  label: "7:30" },
  { day: "Fri", hours: 8.0,  label: "8:00" },
];
const MAX_HOURS = 12;

// ─── Project breakdown ────────────────────────────────────────────────────────
const PROJ_BREAKDOWN = [
  { project: PROJECTS[0], hours: "21h 30m", pct: 0.44, color: C.proj[0] },
  { project: PROJECTS[1], hours: "9h 15m",  pct: 0.19, color: C.proj[1] },
  { project: PROJECTS[2], hours: "8h 45m",  pct: 0.18, color: C.proj[2] },
  { project: PROJECTS[4], hours: "9h 15m",  pct: 0.19, color: C.proj[4] },
];

export const Scene06Reports: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const panelOpacity = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Export button callout appears at 5.5s
  const showExportCallout = frame > Math.round(5.5 * fps);

  return (
    <AbsoluteFill>
      <GradientBg variant="subtle" />

      <AbsoluteFill
        style={{
          opacity: panelOpacity,
          padding: 40,
        }}
      >
        <div
          style={{
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            padding: "36px 44px",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 28,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 22,
                  fontWeight: 700,
                  color: C.text,
                  letterSpacing: "-0.03em",
                }}
              >
                Reports
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 14,
                  color: C.textSub,
                  marginTop: 4,
                }}
              >
                Mar 23 – Mar 29, 2026 · All projects · All members
              </div>
            </div>

            {/* Filter pills */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {["This Week", "Platform Engineering ▾", "All Members ▾"].map(
                (f, i) => (
                  <div
                    key={f}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${i === 0 ? C.accentBorder : C.border}`,
                      background: i === 0 ? C.accentGlow : C.bgCardAlt,
                      fontFamily: FONT,
                      fontSize: 13,
                      fontWeight: 500,
                      color: i === 0 ? C.accentLt : C.textSub,
                    }}
                  >
                    {f}
                  </div>
                )
              )}

              {/* Export button — will get callout ring */}
              <div
                id="export-btn"
                style={{
                  padding: "9px 20px",
                  borderRadius: 8,
                  background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
                  fontFamily: FONT,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: showExportCallout ? `0 0 20px ${C.accentGlow}` : "none",
                }}
              >
                ↓ Export
              </div>
            </div>
          </div>

          {/* Metric summary row */}
          {(() => {
            const metricOpacity = interpolate(frame, [0.4 * fps, 1.0 * fps], [0, 1], {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
            });
            return (
              <div
                style={{
                  opacity: metricOpacity,
                  display: "flex",
                  gap: 16,
                  marginBottom: 28,
                }}
              >
                {[
                  { label: "Total Hours", value: "48h 45m", color: C.text },
                  { label: "Team Members", value: "5", color: C.text },
                  { label: "Projects", value: "4", color: C.text },
                  { label: "Avg / Day", value: "9h 45m", color: C.accentLt },
                ].map((m) => (
                  <div
                    key={m.label}
                    style={{
                      flex: 1,
                      background: C.bgCardAlt,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      padding: "18px 22px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: 12,
                        color: C.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        marginBottom: 8,
                      }}
                    >
                      {m.label}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 26,
                        fontWeight: 700,
                        color: m.color,
                        letterSpacing: "-0.03em",
                      }}
                    >
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Main content: bar chart + breakdown */}
          <div style={{ display: "flex", gap: 24, flex: 1 }}>
            {/* Bar chart */}
            <div
              style={{
                flex: 2,
                background: C.bgCardAlt,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "24px 28px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.textSub,
                  marginBottom: 20,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                Daily hours — this week
              </div>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 20,
                }}
              >
                {BAR_DATA.map((bar, i) => {
                  const barDelay = Math.round((0.8 + i * 0.18) * fps);
                  const local = Math.max(0, frame - barDelay);
                  const barHeight = interpolate(
                    local,
                    [0, 0.7 * fps],
                    [0, (bar.hours / MAX_HOURS) * 200],
                    {
                      extrapolateRight: "clamp",
                      extrapolateLeft: "clamp",
                      easing: Easing.out(Easing.quad),
                    }
                  );
                  const barOpacity = interpolate(local, [0, 0.3 * fps], [0, 1], {
                    extrapolateRight: "clamp",
                    extrapolateLeft: "clamp",
                  });

                  return (
                    <div
                      key={bar.day}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        opacity: barOpacity,
                      }}
                    >
                      {/* Value label */}
                      <div
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 13,
                          fontWeight: 700,
                          color: C.accentLt,
                        }}
                      >
                        {barHeight > 10 ? bar.label : ""}
                      </div>
                      {/* Bar */}
                      <div
                        style={{
                          width: "100%",
                          height: barHeight,
                          background: `linear-gradient(180deg, ${C.accentLt}, ${C.purple})`,
                          borderRadius: "6px 6px 0 0",
                        }}
                      />
                      {/* Day label */}
                      <div
                        style={{
                          fontFamily: FONT,
                          fontSize: 13,
                          color: C.textMuted,
                          fontWeight: 500,
                        }}
                      >
                        {bar.day}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Project breakdown */}
            <div
              style={{
                flex: 1,
                background: C.bgCardAlt,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "24px 28px",
              }}
            >
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.textSub,
                  marginBottom: 20,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                By project
              </div>

              {PROJ_BREAKDOWN.map((p, i) => {
                const rDelay = Math.round((1.2 + i * 0.25) * fps);
                const local = Math.max(0, frame - rDelay);
                const barW = interpolate(local, [0, 0.6 * fps], [0, p.pct], {
                  extrapolateRight: "clamp",
                  extrapolateLeft: "clamp",
                  easing: Easing.out(Easing.quad),
                });
                const rOpacity = interpolate(local, [0, 0.4 * fps], [0, 1], {
                  extrapolateRight: "clamp",
                  extrapolateLeft: "clamp",
                });

                return (
                  <div
                    key={p.project}
                    style={{
                      opacity: rOpacity,
                      marginBottom: 18,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: p.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: FONT,
                            fontSize: 13,
                            color: C.text,
                            fontWeight: 500,
                          }}
                        >
                          {p.project.length > 14
                            ? p.project.slice(0, 13) + "…"
                            : p.project}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 13,
                          color: C.textSub,
                          fontWeight: 600,
                        }}
                      >
                        {p.hours}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div
                      style={{
                        height: 6,
                        background: C.bgCard,
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${barW * 100}%`,
                          height: "100%",
                          background: p.color,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Export button callout — positioned at top-right of the panel */}
      {showExportCallout && (
        <CalloutRing
          x={1796}
          y={96}
          size={56}
          color={C.purpleLt}
          delay={0}
          label="Export CSV / PDF"
        />
      )}

      <LowerThird
        label="Reports & Analytics"
        sublabel="Turn time data into decisions — one-click export for billing and payroll"
        delay={10}
      />
    </AbsoluteFill>
  );
};
