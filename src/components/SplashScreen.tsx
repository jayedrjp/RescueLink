/**
 * Minimal splash / loading screen for RescueLink.
 * Pure white background, centered logo, nothing else.
 */
export function SplashScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        zIndex: 9999,
      }}
    >
      <img
        src="/rescuelink-logo.png"
        alt="RescueLink"
        style={{
          width: "min(48vw, 220px)",
          height: "auto",
          aspectRatio: "1024 / 833",
          objectFit: "contain",
        }}
      />
    </div>
  );
}
