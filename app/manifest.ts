import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Up and Out",
    short_name: "Up and Out",
    description: "Kids' morning routine board with rewards",
    start_url: "/board",
    display: "standalone",
    orientation: "any",
    background_color: "#EAF1F6",
    theme_color: "#EAF1F6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
