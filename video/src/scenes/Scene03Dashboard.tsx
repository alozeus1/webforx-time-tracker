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
import { C, FONT, FONT_MONO, PROJECTS } from "../constants";
import { GradientBg } from "../components/GradientBg";
import { LowerThird } from "../components/LowerThird";
import { CalloutRing } from "../components/CalloutRing";

// ─── Mini sub-components ──────────────────────────────────────────────────────

const StatCard: React.FC<{
  title: string;
  value: string;
  sub?: string;
  accent?: string;
  delay: number;
}> = ({ title, value, sub, accent = C.accentLt, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delay);

  const opacity = interpolate(local, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const translateY = interpolate(local, [0, 0.5 * fps], [20, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "28px 32px",
        flex: 1,
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 14,
          color: C.textMuted,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 42,
          fontWeight: 700,
          color: C.text,
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: FONT,
            fontSize: 13,
            color: accent,
            marginTop: 10,
            fontWeight: 500,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};

const RecentEntry: React.FC<{
  project: string;
  task: string;
  duration: string;
  color: string;
  delay: number;
}> = ({ project, task, duration, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delay);

  const opacity = interpolate(local, [0, 0.4 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const translateX = interpolate(local, [0, 0.4 * fps], [-20, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${translateX}px)`,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 15,
            fontWeight: 600,
            color: C.text,
          }}
        >
          {project}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 13,
            color: C.textSub,
            marginTop: 2,
          }}
        >
          {task}
        </div>
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 15,
          fontWeight: 600,
          color: C.textSub,
        }}
      >
        {duration}
      </div>
    </div>
  );
};

// ─── Login Mock ───────────────────────────────────────────────────────────────

const LoginMock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardScale = spring({ frame, fps, config: { damping: 200 } });
  const cardOpacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Typing cursor blink on email field
  const emailTyped = Math.min(
    24,
    Math.floor(interpolate(frame, [0.8 * fps, 1.8 * fps], [0, 24], {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
    }))
  );
  const emailStr = "employee@webforxtech.co".slice(0, emailTyped);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          opacity: cardOpacity,
          transform: `scale(${cardScale})`,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: "56px 64px",
          width: 480,
          boxShadow: `0 40px 100px rgba(0,0,0,0.6), 0 0 80px ${C.accentGlow}`,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Img
            src={staticFile("webforx-logo.png")}
            style={{
              width: 52,
              height: 52,
              borderRadius: 13,
              objectFit: "contain",
              marginBottom: 16,
            }}
          />
          <div
            style={{
              fontFamily: FONT,
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              letterSpacing: "-0.03em",
            }}
          >
            Sign in to your account
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 14,
              color: C.textSub,
              marginTop: 6,
            }}
          >
            Web Forx Time Tracker
          </div>
        </div>

        {/* Email field */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 13,
              color: C.textSub,
              marginBottom: 8,
              fontWeight: 500,
            }}
          >
            Email address
          </div>
          <div
            style={{
              background: C.bgCardAlt,
              border: `1px solid ${C.accentBorder}`,
              borderRadius: 10,
              padding: "13px 16px",
              fontFamily: FONT_MONO,
              fontSize: 14,
              color: C.text,
              display: "flex",
              alignItems: "center",
            }}
          >
            {emailStr}
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 16,
                background: C.accentLt,
                marginLeft: 1,
                opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
              }}
            />
          </div>
        </div>

        {/* Password field */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 13,
              color: C.textSub,
              marginBottom: 8,
              fontWeight: 500,
            }}
          >
            Password
          </div>
          <div
            style={{
              background: C.bgCardAlt,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "13px 16px",
              fontFamily: FONT_MONO,
              fontSize: 14,
              color: C.textMuted,
            }}
          >
            ••••••••••
          </div>
        </div>

        {/* Button */}
        <div
          style={{
            background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
            borderRadius: 10,
            padding: "14px",
            textAlign: "center",
            fontFamily: FONT,
            fontSize: 16,
            fontWeight: 700,
            color: "#fff",
            boxShadow: `0 4px 20px ${C.accentGlow}`,
          }}
        >
          Sign in
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Dashboard Mock ───────────────────────────────────────────────────────────

const DashboardMock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Active timer counter animation
  const timerSeconds = Math.floor(
    interpolate(frame, [0, 10 * fps], [9337, 9400], { extrapolateRight: "clamp" })
  );
  const h = Math.floor(timerSeconds / 3600);
  const m = Math.floor((timerSeconds % 3600) / 60);
  const s = timerSeconds % 60;
  const timerStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  const panelOpacity = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: panelOpacity }}>
      {/* App chrome */}
      <div
        style={{
          position: "absolute",
          inset: 20,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top nav bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 40px",
            height: 72,
            borderBottom: `1px solid ${C.border}`,
            background: C.bgCardAlt,
            flexShrink: 0,
            gap: 16,
          }}
        >
          <Img
            src={staticFile("webforx-logo.png")}
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              objectFit: "contain",
            }}
          />
          <span
            style={{
              fontFamily: FONT,
              fontSize: 16,
              fontWeight: 600,
              color: C.text,
            }}
          >
            Web Forx Time Tracker
          </span>

          {/* Nav items */}
          <div
            style={{
              display: "flex",
              gap: 4,
              marginLeft: 32,
              flex: 1,
            }}
          >
            {["Dashboard", "Timer", "Timeline", "Reports"].map((nav, i) => (
              <div
                key={nav}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  fontFamily: FONT,
                  fontSize: 14,
                  fontWeight: i === 0 ? 600 : 400,
                  color: i === 0 ? C.text : C.textMuted,
                  background: i === 0 ? C.bgCardAlt : "transparent",
                  border: i === 0 ? `1px solid ${C.border}` : "none",
                }}
              >
                {nav}
              </div>
            ))}
          </div>

          {/* User avatar */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.proj[1]}, ${C.proj[0]})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            MA
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, padding: "32px 32px 24px", overflow: "hidden" }}>
          {/* Page heading */}
          <div
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 700,
              color: C.text,
              letterSpacing: "-0.03em",
              marginBottom: 6,
            }}
          >
            Good morning, Marcus
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 14,
              color: C.textSub,
              marginBottom: 28,
            }}
          >
            Thursday, March 26, 2026
          </div>

          {/* Stat cards row */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <StatCard title="Today" value="6h 23m" sub="↑ 12% vs yesterday" delay={Math.round(0.3 * fps)} />
            <StatCard title="This Week" value="31h 45m" sub="Target: 40h" accent={C.warning} delay={Math.round(0.5 * fps)} />
            <div
              style={{
                flex: 1,
                background: C.bgCard,
                border: `1.5px solid ${C.accentBorder}`,
                borderRadius: 14,
                padding: "28px 32px",
                opacity: interpolate(Math.max(0, frame - Math.round(0.7 * fps)), [0, 0.5 * fps], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
              }}
            >
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 14,
                  color: C.accentLt,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 12,
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
                    background: C.success,
                    boxShadow: `0 0 8px ${C.success}`,
                  }}
                />
                Active Timer
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 38,
                  fontWeight: 700,
                  color: C.text,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {timerStr}
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 13,
                  color: C.textSub,
                  marginTop: 10,
                }}
              >
                Platform Engineering
              </div>
            </div>
          </div>

          {/* Recent tasks */}
          <div
            style={{
              fontFamily: FONT,
              fontSize: 14,
              fontWeight: 600,
              color: C.textSub,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 8,
            }}
          >
            Recent Tasks
          </div>
          <RecentEntry
            project={PROJECTS[0]}
            task="Sprint planning and backlog grooming"
            duration="2h 15m"
            color={C.proj[0]}
            delay={Math.round(1.0 * fps)}
          />
          <RecentEntry
            project={PROJECTS[1]}
            task="Student module UI integration"
            duration="1h 45m"
            color={C.proj[1]}
            delay={Math.round(1.3 * fps)}
          />
          <RecentEntry
            project={PROJECTS[2]}
            task="API endpoint documentation"
            duration="2h 23m"
            color={C.proj[2]}
            delay={Math.round(1.6 * fps)}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Main Scene ───────────────────────────────────────────────────────────────

export const Scene03Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Show login first 2s, then crossfade to dashboard
  const SWITCH = Math.round(2.0 * fps);
  const FADE_DUR = Math.round(0.8 * fps);

  const loginOpacity = interpolate(frame, [SWITCH, SWITCH + FADE_DUR], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const dashOpacity = interpolate(frame, [SWITCH, SWITCH + FADE_DUR], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Callout: active timer card, visible from frame ~5.5s
  const calloutFrame = Math.max(0, frame - Math.round(6 * fps));

  return (
    <AbsoluteFill>
      <GradientBg variant="subtle" />

      {/* Login phase */}
      <AbsoluteFill style={{ opacity: loginOpacity }}>
        <LoginMock />
      </AbsoluteFill>

      {/* Dashboard phase */}
      <AbsoluteFill style={{ opacity: dashOpacity }}>
        <DashboardMock />

        {/* Callout ring on active timer */}
        {frame > Math.round(6 * fps) && (
          <CalloutRing
            x={1505}
            y={290}
            size={70}
            color={C.success}
            delay={0}
          />
        )}
      </AbsoluteFill>

      {/* Lower third */}
      <LowerThird
        label={frame < SWITCH + FADE_DUR ? "Secure Login" : "Dashboard Overview"}
        sublabel={
          frame < SWITCH + FADE_DUR
            ? "Secure role-based access for every member of your organization"
            : "See exactly where your team's hours went — at a glance"
        }
        delay={10}
      />
    </AbsoluteFill>
  );
};
