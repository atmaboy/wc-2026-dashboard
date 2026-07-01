export const metadata = {
  title: 'FIFA World Cup 2026 Dashboard',
  description: 'Live scoring dashboard with Vercel Blob cache',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
