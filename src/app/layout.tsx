import "./globals.css";

export const metadata = {
  title: "타임메이트",
  description: "세션으로 사람 연결",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
