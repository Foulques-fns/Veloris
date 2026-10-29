import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VELORIS — Your intelligent workspace",
  description: "VELORIS — Chat, generate images, speech and more with AI.",
  icons: { icon: "/logo.png", shortcut: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#080706",
  width: "device-width",
  initialScale: 1,
};

const themeInit = `(function(){try{var t=localStorage.getItem('nova-theme')||'dark';document.documentElement.classList.toggle('light',t==='light');}catch(e){document.documentElement.classList.remove('light');}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
