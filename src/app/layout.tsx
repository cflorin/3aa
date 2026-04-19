// EPIC-001/STORY-003/TASK-003-006
// Root layout for Next.js App Router

export const metadata = {
  title: '3AA Monitoring Product',
  description: 'Stock monitoring and alerting system based on the 3AA investment framework',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
