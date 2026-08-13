import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const socialImageAlt =
  "A realistic repository universe of terrestrial and ringed planets opening through a crystalline gateway into a living seasonal mountain kingdom";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Repo Magical Kingdom",
    template: "%s · Repo Magical Kingdom",
  },
  description: "Turn any public GitHub repository into a living, selectable 3D world.",
  applicationName: "Repo Magical Kingdom",
  openGraph: {
    title: "Repo Magical Kingdom",
    description:
      "Explore repository planets, then enter living realms of terrain, settlements, landmarks, and portals.",
    type: "website",
    images: [
      {
        url: "/social-preview.png",
        width: 1280,
        height: 640,
        alt: socialImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Repo Magical Kingdom",
    description: "Turn a public GitHub repository into a living, explorable 3D world.",
    images: [{ url: "/social-preview.png", alt: socialImageAlt }],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#e7eadf",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
