import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT } from "../constants";
import { GradientBg } from "../components/GradientBg";
import { LowerThird } from "../components/LowerThird";

type IntegrationCardProps = {
  name: string;
  description: string;
  statusLabel: string;
  statusColor: string;
  accentColor: string;
  icon: string;
  detail: string;
  delay: number;
};

const IntegrationCard: React.FC<IntegrationCardProps> = ({
  name,
  description,
  statusLabel,
  statusColor,
  accentColor,
  icon,
  detail,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delay);

  const cardScale = spring({ frame: local, fps, config: { damping: 200 } });
  const cardOpacity = interpolate(local, [0, 0.4 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const cardY = interpolate(local, [0, 0.5 * fps], [30, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.quad),
  });

  return (
    <div
      style={{
        opacity: cardOpacity,
        transform: `translateY(${cardY}px) scale(${cardScale})`,
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "36px 40px",
        flex: 1,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Accent top border */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
          borderRadius: "16px 16px 0 0",
        }}
      />

      {/* Icon circle */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: `${accentColor}20`,
          border: `1px solid ${accentColor}40`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          marginBottom: 24,
        }}
      >
        {icon}
      </div>

      {/* Name + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            letterSpacing: "-0.02em",
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 14px",
            borderRadius: 100,
            background: `${statusColor}18`,
            border: `1px solid ${statusColor}40`,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: statusColor,
              boxShadow: statusColor === C.success ? `0 0 6px ${statusColor}` : "none",
            }}
          />
          <span
            style={{
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
              color: statusColor,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Description */}
      <div
        style={{
          fontFamily: FONT,
          fontSize: 15,
          color: C.textSub,
          lineHeight: 1.6,
          marginBottom: 24,
        }}
      >
        {description}
      </div>

      {/* Detail chip */}
      <div
        style={{
          padding: "10px 16px",
          background: C.bgCardAlt,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          fontFamily: FONT,
          fontSize: 13,
          color: C.textSub,
          fontWeight: 500,
        }}
      >
        {detail}
      </div>
    </div>
  );
};

export const Scene08Integrations: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill>
      <GradientBg variant="subtle" />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "60px 80px",
        }}
      >
        {/* Page header */}
        <div style={{ opacity: headerOpacity, marginBottom: 48 }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 13,
              color: C.accentLt,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Connected workflows
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 36,
              fontWeight: 700,
              color: C.text,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            Integrations
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 18,
              color: C.textSub,
              marginTop: 10,
            }}
          >
            Link your time data to the tools your team already uses.
          </div>
        </div>

        {/* Integration cards */}
        <div style={{ display: "flex", gap: 24, flex: 1 }}>
          <IntegrationCard
            name="Google Calendar"
            description="Sync tracked sessions directly to your Google Calendar. Visualize your workday alongside meetings, deadlines, and scheduled events — without manual duplication."
            statusLabel="Connected"
            statusColor={C.success}
            accentColor="#4285F4"
            icon="📅"
            detail="Syncing events to: work@webforxtech.com"
            delay={Math.round(0.5 * fps)}
          />

          <IntegrationCard
            name="Taiga"
            description="Pull your Taiga projects and user stories directly into the timer. Attach time entries to tasks as you work — keeping project management and time tracking in sync."
            statusLabel="Connected"
            statusColor={C.success}
            accentColor="#70B244"
            icon="📋"
            detail="Workspace: WebForx · 3 active projects synced"
            delay={Math.round(1.0 * fps)}
          />

          <IntegrationCard
            name="Mattermost"
            description="Receive automated daily reminders, end-of-week summaries, and admin alerts directly in your Mattermost channels — keeping the team aligned without switching tools."
            statusLabel="Configure"
            statusColor={C.warning}
            accentColor="#1E5291"
            icon="💬"
            detail="Webhook not yet configured"
            delay={Math.round(1.5 * fps)}
          />
        </div>

        {/* Footer note */}
        {(() => {
          const noteOpacity = interpolate(frame, [3 * fps, 3.8 * fps], [0, 1], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });
          return (
            <div
              style={{
                opacity: noteOpacity,
                marginTop: 32,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: C.accentGlow,
                  border: `1px solid ${C.accentBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: C.accentLt,
                  fontWeight: 700,
                }}
              >
                i
              </div>
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 14,
                  color: C.textMuted,
                }}
              >
                Integration credentials are encrypted and managed by the platform
                administrator.
              </span>
            </div>
          );
        })()}
      </AbsoluteFill>

      <LowerThird
        label="Integrations"
        sublabel="Google Calendar, Taiga, and Mattermost — connected workflows, zero double-entry"
        delay={10}
      />
    </AbsoluteFill>
  );
};
