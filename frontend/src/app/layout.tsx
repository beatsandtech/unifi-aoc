import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniFi Autonomous Operations Center",
  description: "AI-assisted multi-tenant MSP UniFi network operation, correlation, diagnosis, and remediation dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
        {children}
      </body>
    </html>
  );
}
