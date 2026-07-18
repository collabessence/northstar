import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northstar CRM — Revenue, clearly",
  description: "A focused revenue workspace for modern sales teams.",
  applicationName: "Northstar CRM",
};

export const viewport: Viewport = {
  themeColor: "#f5f6f7",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
