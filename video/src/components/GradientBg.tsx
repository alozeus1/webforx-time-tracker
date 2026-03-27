import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../constants";

type Props = {
  variant?: "dark" | "brand" | "subtle";
};

export const GradientBg: React.FC<Props> = ({ variant = "dark" }) => {
  const gradients: Record<string, string> = {
    dark: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(37,99,235,0.12) 0%, ${C.bg} 70%)`,
    brand: `radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37,99,235,0.22) 0%, rgba(124,58,237,0.08) 50%, ${C.bg} 80%)`,
    subtle: `radial-gradient(ellipse 60% 40% at 80% 20%, rgba(59,130,246,0.08) 0%, ${C.bg} 60%)`,
  };

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* Main gradient */}
      <AbsoluteFill style={{ background: gradients[variant] }} />
      {/* Subtle grid overlay */}
      <AbsoluteFill
        style={{
          backgroundImage: `
            linear-gradient(rgba(30,45,74,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,45,74,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
          opacity: 0.4,
        }}
      />
    </AbsoluteFill>
  );
};
