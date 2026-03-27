import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, FONT_MONO, TEAM } from "../constants";
import { GradientBg } from "../components/GradientBg";
import { LowerThird } from "../components/LowerThird";

const ROLE_COLORS: Record<string, string> = {
  Admin:    C.danger,
  Manager:  C.warning,
  Engineer: C.accentLt,
};

const STATUS_COLORS: Record<string, string> = {
  Active:   C.success,
  "On Leave": C.warning,
};

export const Scene07TeamAdmin: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const SWITCH = Math.round(4.5 * fps);
  const FADE_DUR = Math.round(0.8 * fps);

  const teamOpacity = interpolate(frame, [SWITCH, SWITCH + FADE_DUR], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const adminOpacity = interpolate(frame, [SWITCH, SWITCH + FADE_DUR], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ─── Team view ──────────────────────────────────────────────────────────────
  const TeamView = () => {
    const headerOpacity = interpolate(frame, [0, 0.6 * fps], [0, 1], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });

    return (
      <div
        style={{
          position: "absolute",
          inset: 20,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "32px 40px",
        }}
      >
        {/* Header */}
        <div
          style={{
            opacity: headerOpacity,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
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
              Team
            </div>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 14,
                color: C.textSub,
                marginTop: 4,
              }}
            >
              5 members · Week of Mar 23, 2026
            </div>
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 15,
              fontWeight: 700,
              color: C.text,
              padding: "8px 18px",
              background: C.bgCardAlt,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
            }}
          >
            Total: 200h 40m
          </div>
        </div>

        {/* Table header */}
        <div
          style={{
            opacity: headerOpacity,
            display: "flex",
            alignItems: "center",
            padding: "0 16px 14px",
            borderBottom: `1px solid ${C.border}`,
            marginBottom: 8,
          }}
        >
          {["Member", "Role", "This Week", "Projects", "Status"].map((h, i) => (
            <div
              key={h}
              style={{
                flex: i === 0 ? 2 : 1,
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 600,
                color: C.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Team rows */}
        {TEAM.map((member, i) => {
          const rowDelay = Math.round((0.4 + i * 0.28) * fps);
          const local = Math.max(0, frame - rowDelay);
          const rowOpacity = interpolate(local, [0, 0.5 * fps], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });
          const rowX = interpolate(local, [0, 0.5 * fps], [-24, 0], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
            easing: Easing.out(Easing.quad),
          });
          const initials = member.name
            .split(" ")
            .map((n) => n[0])
            .join("");
          const avatarColor = C.proj[i % C.proj.length];

          return (
            <div
              key={member.name}
              style={{
                opacity: rowOpacity,
                transform: `translateX(${rowX}px)`,
                display: "flex",
                alignItems: "center",
                padding: "16px 16px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              {/* Member */}
              <div
                style={{
                  flex: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${avatarColor}CC, ${avatarColor}66)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: FONT,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: 15,
                      fontWeight: 600,
                      color: C.text,
                    }}
                  >
                    {member.name}
                  </div>
                </div>
              </div>

              {/* Role */}
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: 100,
                    background: `${ROLE_COLORS[member.role]}18`,
                    border: `1px solid ${ROLE_COLORS[member.role]}40`,
                    fontFamily: FONT,
                    fontSize: 12,
                    fontWeight: 600,
                    color: ROLE_COLORS[member.role],
                  }}
                >
                  {member.role}
                </span>
              </div>

              {/* Hours */}
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.text,
                  }}
                >
                  {member.hours}
                </span>
              </div>

              {/* Project dots */}
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {[0, 1, 2].map((pi) => (
                  <div
                    key={pi}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: C.proj[(i + pi) % C.proj.length],
                    }}
                  />
                ))}
              </div>

              {/* Status */}
              <div style={{ flex: 1 }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: FONT,
                    fontSize: 13,
                    fontWeight: 500,
                    color: STATUS_COLORS[member.status],
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: STATUS_COLORS[member.status],
                    }}
                  />
                  {member.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Admin view ─────────────────────────────────────────────────────────────
  const AdminView = () => {
    const localFrame = Math.max(0, frame - SWITCH);
    const headerOpacity = interpolate(localFrame, [0, 0.6 * fps], [0, 1], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    });

    const TABS = ["Users", "Projects", "Notifications", "Audit Logs"];
    const [activeTab] = [
      localFrame < 2.0 * fps ? "Users"
      : localFrame < 4.0 * fps ? "Projects"
      : "Audit Logs",
    ];

    const AUDIT_ENTRIES = [
      { time: "17:42:01", user: "Marcus Adeyemi", action: "Timer stopped",      detail: "Platform Engineering — 2h 15m",  type: "timer" },
      { time: "15:21:14", user: "Priya Nair",     action: "Manual entry added", detail: "EDUSUC — 1h 30m manual",          type: "edit"  },
      { time: "14:00:00", user: "Sarah Osei",     action: "Report exported",    detail: "CSV · Mar 23–29, 2026",            type: "report"},
      { time: "13:30:45", user: "Alex Chen",      action: "User role updated",  detail: "Marcus Adeyemi → Engineer",       type: "admin" },
      { time: "09:01:12", user: "Luca Ferreira",  action: "Timer started",      detail: "Yemba — Sprint review",           type: "timer" },
    ];

    const TYPE_COLORS: Record<string, string> = {
      timer:  C.success,
      edit:   C.warning,
      report: C.accentLt,
      admin:  C.danger,
    };

    return (
      <div
        style={{
          position: "absolute",
          inset: 40,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          overflow: "hidden",
          display: "flex",
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            width: 220,
            background: C.bgCardAlt,
            borderRight: `1px solid ${C.border}`,
            padding: "32px 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "0 24px 24px",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              color: C.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Admin Panel
          </div>
          {TABS.map((tab) => {
            const isActive =
              (tab === "Users" && localFrame < 2.0 * fps) ||
              (tab === "Projects" && localFrame >= 2.0 * fps && localFrame < 4.0 * fps) ||
              (tab === "Audit Logs" && localFrame >= 4.0 * fps);
            return (
              <div
                key={tab}
                style={{
                  padding: "12px 24px",
                  fontFamily: FONT,
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? C.text : C.textMuted,
                  background: isActive ? C.bgCard : "transparent",
                  borderRight: isActive ? `2px solid ${C.accentLt}` : "2px solid transparent",
                }}
              >
                {tab}
              </div>
            );
          })}
        </div>

        {/* Main content */}
        <div
          style={{
            flex: 1,
            padding: "32px 40px",
            opacity: headerOpacity,
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontSize: 20,
              fontWeight: 700,
              color: C.text,
              letterSpacing: "-0.03em",
              marginBottom: 24,
            }}
          >
            {localFrame < 2.0 * fps
              ? "User Management"
              : localFrame < 4.0 * fps
              ? "Project Management"
              : "Audit Log"}
          </div>

          {/* Audit log content */}
          {localFrame >= 4.0 * fps && (
            <div>
              {AUDIT_ENTRIES.map((entry, i) => {
                const entDelay = Math.round(i * 0.2 * fps);
                const entLocal = Math.max(0, localFrame - 4.0 * fps - entDelay);
                const entOpacity = interpolate(entLocal, [0, 0.4 * fps], [0, 1], {
                  extrapolateRight: "clamp",
                  extrapolateLeft: "clamp",
                });
                return (
                  <div
                    key={i}
                    style={{
                      opacity: entOpacity,
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "12px 0",
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: TYPE_COLORS[entry.type],
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 12,
                        color: C.textMuted,
                        width: 70,
                        flexShrink: 0,
                      }}
                    >
                      {entry.time}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: 14,
                        fontWeight: 600,
                        color: C.text,
                        width: 170,
                        flexShrink: 0,
                      }}
                    >
                      {entry.action}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: 13,
                        color: C.textSub,
                        flex: 1,
                      }}
                    >
                      {entry.detail}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT,
                        fontSize: 13,
                        color: C.textMuted,
                      }}
                    >
                      {entry.user}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Users tab placeholder */}
          {localFrame < 2.0 * fps && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {["Alex Chen", "Sarah Osei", "Marcus Adeyemi", "Priya Nair", "Luca Ferreira"].map((name, i) => {
                const uOpacity = interpolate(Math.max(0, localFrame - i * 0.12 * fps), [0, 0.4 * fps], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
                return (
                  <div key={name} style={{ opacity: uOpacity, display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.proj[i % 7], display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#fff" }}>
                      {name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>{name}</span>
                    <span style={{ fontFamily: FONT, fontSize: 12, color: ["Admin","Manager","Engineer","Engineer","Engineer"][i], padding: "3px 10px", borderRadius: 100, background: `${["Admin","Manager","Engineer","Engineer","Engineer"][i] === "Admin" ? C.danger : ["Admin","Manager","Engineer","Engineer","Engineer"][i] === "Manager" ? C.warning : C.accentLt}18` }}>
                      {["Admin","Manager","Engineer","Engineer","Engineer"][i]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Projects tab placeholder */}
          {localFrame >= 2.0 * fps && localFrame < 4.0 * fps && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {["Platform Engineering","EDUSUC","Yemba","LAFABAH","Webforx Website","BA"].map((proj, i) => {
                const pOpacity = interpolate(Math.max(0, localFrame - 2.0 * fps - i * 0.15 * fps), [0, 0.4 * fps], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
                return (
                  <div key={proj} style={{ opacity: pOpacity, display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.proj[i % 7] }} />
                    <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>{proj}</span>
                    <span style={{ fontFamily: FONT, fontSize: 12, color: C.success, padding: "3px 10px", borderRadius: 100, background: C.successBg }}>Active</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <AbsoluteFill>
      <GradientBg variant="subtle" />

      <AbsoluteFill style={{ opacity: teamOpacity }}>
        <TeamView />
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: adminOpacity }}>
        <AdminView />
      </AbsoluteFill>

      <LowerThird
        label={frame < SWITCH + FADE_DUR ? "Team Overview" : "Admin Control Panel"}
        sublabel={
          frame < SWITCH + FADE_DUR
            ? "Full visibility into your team's weekly output and project allocation"
            : "Manage users, configure projects, and review every action in the audit log"
        }
        delay={10}
      />
    </AbsoluteFill>
  );
};
