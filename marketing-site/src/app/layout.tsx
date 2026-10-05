import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://levoy.co"),
  title: {
    default: "Levoy — SIM-based Telecalling Analytics & Call Monitoring",
    template: "%s | Levoy",
  },
  description:
    "Monitor all telesales and marketing calls and discover real-time insights to improve caller productivity and track lead status from a central dashboard.",
  keywords: [
    "call monitoring software",
    "telecalling analytics",
    "lead management",
    "sales CRM",
    "call recording",
    "employee productivity",
  ],
  openGraph: {
    type: "website",
    url: "https://levoy.co",
    siteName: "Levoy",
    title: "Levoy — SIM-based Telecalling Analytics & Call Monitoring",
    description:
      "Monitor all telesales and marketing calls and discover real-time insights to improve caller productivity and track lead status from a central dashboard.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Levoy — Telecalling Analytics for Growing Sales Teams",
    description:
      "Real-time call monitoring, lead management and CRM sync for every SIM in your fleet.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white">{children}</body>
    </html>
  );
}
