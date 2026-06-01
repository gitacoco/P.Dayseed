import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dayseed",
  description: "A gentle pomodoro garden where focused days grow into tomato plants.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
