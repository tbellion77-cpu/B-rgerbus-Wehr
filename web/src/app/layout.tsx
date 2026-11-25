import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

// Atkinson Hyperlegible: für Menschen mit Sehschwäche entwickelt
const sans = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "BürgerBus Wehr – Wo ist der Bus?",
  description: "Live-Karte und Abfahrten des ehrenamtlichen Bürgerbusses der Stadt Wehr (Baden).",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
