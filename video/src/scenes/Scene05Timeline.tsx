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

// ─── Timeline entries for demo day ───────────────────────────────────────────
const ENTRIES = [
  { start: "08:30", end: "10:45", project: PROJECTS[0], task: "Sprint planning", color: C.proj[0], width: 0.225 },
  { start: "11:00", end: "12:30", project: PROJECTS[1], task: "Student module UI", color: C.proj[1], width: 0.15 },
  { start: "13:30", end: "15:15", project: PROJECTS[2], task: "API documentation", color: C.proj[2], width: 0.175 },
  { start: "15:30", end: "17:00", project: PROJECTS[0], task: "Code review", color: C.proj[0], width: 0.15 },
  { start: "17:15", end: "18:30", project: PROJECTS[4], task: "Landing page copy", color: C.proj[4], width: 0.125 },
];

// ─── Weekly timesheet data ────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SHEET_ROWS = [
  {
    project: "Platform Eng.",
    color: C.proj[0],
    hours: ["8:15", "7:45", "6:30", "8:00", "—"],
  },
  {
    project: "EDUSUC",
    color: C.proj[1],
    hours: ["—", "1:30", "2:15", "1:45", "—"],
  },
  {
    project: "Yemba",
    color: C.proj[2],
    hours: ["—", "—", "1:30", "2:00", "3:15"],
  },
  {
    project: "Webforx Site",
    color: C.proj[4],
    hours: ["—", "—", "—", "1:15", "4:45"],
  },
];
const DAY_TOTALS = ["8:15", "9:15", "10:15", "13:00", "8:00"];

export const Scene05Timeline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Switch from timeline to timesheet halfway
  const SWITCH = Math.round(4.5 * fps);
  const FADE_DUR = Math.round(0.8 * fps);

  const timelineOpacity = interpolate(frame, [SWITCH, SWITCH + FADE_DUR], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sheetOpacity = interpolate(frame, [SWITCH, SWITCH + FADE_DUR], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ─── Timeline render ───────────────────────────────────────────────────────
  const TimelineView = () => {
    const headerOpacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });

    return (
      <div
        style={{
          position: "absolute",
          inset: 40,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "40px 48px",
        }}
      >
        {/* Header */}
        <div
          style={{
            opacity: headerOpacity,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 36,
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
              Timeline
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 14,
                color: C.textSub,
                marginTop: 4,
              }}
            >
              Thursday, March 26, 2026 — Marcus Adeyemi
            </div>
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 16,
              fontWeight: 700,
              color: C.success,
              padding: "8px 18px",
              background: C.successBg,
              borderRadius: 8,
              border: `1px solid ${C.success}40`,
            }}
          >
            6h 23m logged
          </div>
        </div>

        {/* Hour ruler */}
        <div style={{ opacity: headerOpacity, marginBottom: 20, display: "flex", alignItems: "center" }}>
          <div style={{ width: 100, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", position: "relative", borderLeft: `1px solid ${C.border}` }}>
            {["8AM", "10AM", "12PM", "2PM", "4PM", "6PM"].map((h, i) => (
              <div
                key={h}
                style={{
                  flex: 1,
                  borderLeft: i === 0 ? "none" : `1px solid ${C.border}`,
                  paddingLeft: 6,
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  color: C.textMuted,
                }}
              >
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* Time blocks */}
        {ENTRIES.map((entry, i) => {
          const entryDelay = Math.round((0.3 + i * 0.25) * fps);
          const local = Math.max(0, frame - entryDelay);
          const blockWidth = interpolate(local, [0, 0.6 * fps], [0, entry.width], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
            easing: Easing.out(Easing.quad),
          });
          const blockOpacity = interpolate(local, [0, 0.3 * fps], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });

          // Calculate left offset from 8AM
          const startHour = parseInt(entry.start.split(":")[0]);
          const startMin = parseInt(entry.start.split(":")[1]);
          const startOffset = ((startHour - 8) * 60 + startMin) / (10 * 60);

          return (
            <div
              key={i}
              style={{
                opacity: blockOpacity,
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 14,
              }}
            >
              {/* Project label */}
              <div
                style={{
                  width: 100,
                  flexShrink: 0,
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
                    background: entry.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONT,
                    fontSize: 12,
                    color: C.textSub,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {entry.project.length > 10
                    ? entry.project.slice(0, 10) + "…"
                    : entry.project}
                </span>
              </div>

              {/* Bar track */}
              <div
                style={{
                  flex: 1,
                  height: 40,
                  position: "relative",
                  borderRadius: 6,
                  background: C.bgCardAlt,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${startOffset * 100}%`,
                    top: 0,
                    height: "100%",
                    width: `${blockWidth * 100}%`,
                    background: `linear-gradient(90deg, ${entry.color}DD, ${entry.color}99)`,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 12,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#fff",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.task} · {entry.start}–{entry.end}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Timesheet render ──────────────────────────────────────────────────────
  const TimesheetView = () => {
    const localFrame = Math.max(0, frame - SWITCH);

    const headerOpacity = interpolate(localFrame, [0, 0.6 * fps], [0, 1], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });

    return (
      <div
        style={{
          position: "absolute",
          inset: 40,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "40px 48px",
        }}
      >
        {/* Header */}
        <div
          style={{
            opacity: headerOpacity,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 36,
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
              Weekly Timesheet
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 14,
                color: C.textSub,
                marginTop: 4,
              }}
            >
              Week of Mar 23 – Mar 29, 2026
            </div>
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 16,
              fontWeight: 700,
              color: C.accentLt,
              padding: "8px 18px",
              background: C.accentGlow,
              borderRadius: 8,
              border: `1px solid ${C.accentBorder}`,
            }}
          >
            48h 45m total
          </div>
        </div>

        {/* Table header */}
        <div
          style={{
            opacity: headerOpacity,
            display: "flex",
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: 12,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 200,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              flexShrink: 0,
            }}
          >
            Project
          </div>
          {DAYS.map((d) => (
            <div
              key={d}
              style={{
                flex: 1,
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 600,
                color: C.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                textAlign: "center",
              }}
            >
              {d}
            </div>
          ))}
          <div
            style={{
              width: 90,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            Total
          </div>
        </div>

        {/* Rows */}
        {SHEET_ROWS.map((row, rowIdx) => {
          const rowDelay = Math.round((0.4 + rowIdx * 0.3) * fps);
          const rowLocal = Math.max(0, localFrame - rowDelay);
          const rowOpacity = interpolate(rowLocal, [0, 0.5 * fps], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });
          const rowX = interpolate(rowLocal, [0, 0.5 * fps], [-20, 0], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
            easing: Easing.out(Easing.quad),
          });

          const total = row.hours
            .filter((h) => h !== "—")
            .reduce((acc, h) => {
              const [hr, min] = h.split(":").map(Number);
              return acc + hr * 60 + min;
            }, 0);
          const totalStr = `${Math.floor(total / 60)}h ${total % 60}m`;

          return (
            <div
              key={row.project}
              style={{
                opacity: rowOpacity,
                transform: `translateX(${rowX}px)`,
                display: "flex",
                alignItems: "center",
                padding: "14px 0",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div
                style={{
                  width: 200,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: row.color,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONT,
                    fontSize: 14,
                    fontWeight: 500,
                    color: C.text,
                  }}
                >
                  {row.project}
                </span>
              </div>
              {row.hours.map((h, di) => (
                <div
                  key={di}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontFamily: FONT_MONO,
                    fontSize: 13,
                    color: h === "—" ? C.textMuted : C.textSub,
                    fontWeight: h === "—" ? 400 : 600,
                  }}
                >
                  {h}
                </div>
              ))}
              <div
                style={{
                  width: 90,
                  textAlign: "right",
                  fontFamily: FONT_MONO,
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.text,
                  flexShrink: 0,
                }}
              >
                {totalStr}
              </div>
            </div>
          );
        })}

        {/* Totals row */}
        {(() => {
          const totDelay = Math.round(2.0 * fps);
          const totLocal = Math.max(0, localFrame - totDelay);
          const totOpacity = interpolate(totLocal, [0, 0.5 * fps], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });
          return (
            <div
              style={{
                opacity: totOpacity,
                display: "flex",
                alignItems: "center",
                paddingTop: 16,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  width: 200,
                  fontFamily: FONT,
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.textSub,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  flexShrink: 0,
                }}
              >
                Daily total
              </div>
              {DAY_TOTALS.map((t, di) => (
                <div
                  key={di}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontFamily: FONT_MONO,
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.accentLt,
                  }}
                >
                  {t}
                </div>
              ))}
              <div
                style={{
                  width: 90,
                  textAlign: "right",
                  fontFamily: FONT_MONO,
                  fontSize: 15,
                  fontWeight: 800,
                  color: C.text,
                  flexShrink: 0,
                }}
              >
                48h 45m
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <AbsoluteFill>
      <GradientBg variant="subtle" />

      <AbsoluteFill style={{ opacity: timelineOpacity }}>
        <TimelineView />
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: sheetOpacity }}>
        <TimesheetView />
      </AbsoluteFill>

      <LowerThird
        label={frame < SWITCH + FADE_DUR ? "Daily Timeline" : "Weekly Timesheet"}
        sublabel={
          frame < SWITCH + FADE_DUR
            ? "Every work block organized by project, task, and time"
            : "Aggregated hours by day and project — ready for review or approval"
        }
        delay={10}
      />
    </AbsoluteFill>
  );
};
