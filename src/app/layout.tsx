import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "RankAI - GEO & AEO Analyzer",
  description: "Analyze your website for Generative Engine Optimization (GEO) and Agentic Engine Optimization (AEO). Get actionable recommendations to improve AI visibility and agent-readiness.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t}catch(e){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}})()` }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
