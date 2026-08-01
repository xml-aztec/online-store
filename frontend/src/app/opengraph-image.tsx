import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Placeholder OG image (ТЗ 8 "полировка") -- swap for real photography/brand
// art once it exists; keeps social-share previews from showing nothing.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>HobbyLife</div>
        <div style={{ fontSize: 32, color: "#a1a1aa", marginTop: 16 }}>
          Товары для дома и творчества
        </div>
      </div>
    ),
    { ...size }
  );
}
