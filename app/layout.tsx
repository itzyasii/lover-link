import type { Metadata } from "next";
import { Inter, WindSong } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toasts } from "@/components/Toasts";
import { RealtimeListener } from "@/components/RealtimeListener";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const windSong = WindSong({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-windsong",
});

export const metadata: Metadata = {
  title: "LoverLink - Connect with your special someone",
  description:
    "A romantic chat application for couples to stay connected, share moments, and nurture their love.",
  keywords: ["love", "couple", "chat", "relationship", "romance", "loverlink"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${windSong.variable}`}
    >
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <RealtimeListener />
          {children}
          <Toasts />
        </Providers>
      </body>
    </html>
  );
}
