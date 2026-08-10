export const metadata = {
  title: 'W//FORGE IMAGE MCP WXX',
  description: 'Three-stage image workflow: scene, text layer, final composite',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, background: '#070707', color: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
