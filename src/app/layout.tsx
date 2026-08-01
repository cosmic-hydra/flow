import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "flow — book anything, best deals",
  description:
    "Automation for booking anything, anywhere with the best deals. Powered by webcmd and Composio.",
  openGraph: {
    title: "flow",
    description: "Automation for booking anything, anywhere with the best deals.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
