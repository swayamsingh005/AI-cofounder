import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Co-Founder | Startup intelligence, before you build",
  description: "Research, validate and plan your next business idea."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark"><body>{children}</body></html>;
}
