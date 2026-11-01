import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Batul's Calories",
    short_name: "Calories",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f2",
    theme_color: "#b86a12",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
