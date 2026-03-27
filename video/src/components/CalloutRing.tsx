import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../constants";

type Props = {
  x: number;
  y: number;
  size?: number;
  color?: string;
  delay?: number;
  label?: string;
};

export const CalloutRing: React.FC<Props> = ({
  x,
  y,
  size = 80,
  color = C.accentLt,
  delay = 0,
  label,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = Math.max(0, frame - delay);

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 200 },
  });

  const ringOpacity = interpolate(localFrame, [0, 0.4 * fps, 1.5 * fps, 2.5 * fps], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const ringScale = interpolate(localFrame, [0, 1.5 * fps, 2.5 * fps], [1, 1.4, 1.8], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const dotOpacity = interpolate(localFrame, [0, 0.3 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        pointerEvents: "none",
      }}
    >
      {/* Pulsing ring */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          opacity: ringOpacity * 0.7,
          transform: `scale(${ringScale})`,
        }}
      />
      {/* Static ring */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `2.5px solid ${color}`,
          opacity: dotOpacity * 0.9,
        }}
      />
      {/* Center dot */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          transform: `translate(-50%, -50%) scale(${scale})`,
          opacity: dotOpacity,
        }}
      />
      {/* Optional label */}
      {label && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: size + 12,
            transform: "translateY(-50%)",
            background: color,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            opacity: dotOpacity,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
