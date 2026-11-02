import type { Metadata } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { SiteChrome } from "@/components/site-chrome";
import { Toaster } from "react-hot-toast";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

// Only the logo's "Market" uses italic, so load the one face it needs rather
// than italics for every weight above.
const frauncesItalic = Fraunces({
  variable: "--font-fraunces-italic",
  subsets: ["latin"],
  weight: "600",
  style: "italic",
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "FarmMarket — Fresh food direct from independent Australian farms",
    template: "%s | FarmMarket",
  },
  description:
    "A multivendor marketplace connecting Australian local farmers with customers. Shop fresh, local produce straight from the farm.",
  applicationName: "FarmMarket",
  openGraph: {
    type: "website",
    siteName: "FarmMarket",
    locale: "en_AU",
    images: [{ url: "/images/hero-harvest.jpg", width: 2000, height: 1333, alt: "Picking strawberries on an Australian farm" }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body
        className={`${fraunces.variable} ${frauncesItalic.variable} ${nunitoSans.variable} antialiased`}
      >
        <Providers>
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <SiteChrome header={<Navbar />} footer={<Footer />}>
            {children}
          </SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
