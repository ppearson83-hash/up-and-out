import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";

import "./globals.css";

const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Up and Out",
  description: "Kids' morning routine board with rewards",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Up and Out" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EAF1F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1620" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
