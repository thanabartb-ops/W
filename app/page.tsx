export default function Page() {
  const box = { border: '1px solid #2a2a2a', borderRadius: 14, padding: 18, background: '#0f0f0f' } as const;
  const code = { fontFamily: 'monospace', color: '#d9d9d9', wordBreak: 'break-all' as const };

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '36px 18px 80px' }}>
      <div style={{ fontSize: 12, letterSpacing: 3, opacity: 0.6 }}>W//FORGE</div>
      <h1 style={{ fontSize: 34, margin: '8px 0 10px' }}>IMAGE MCP · WXX</h1>
      <p style={{ opacity: 0.72, lineHeight: 1.7 }}>
        ระบบ 3 ขั้น: สร้างฉาก NO TEXT → สร้าง TEXT PNG แยกชั้น → รวมเป็น FINAL โดยไม่ยิงฉากใหม่
      </p>

      <section style={{ ...box, marginTop: 24 }}>
        <b>01 · SCENE MASTER</b>
        <p style={{ opacity: 0.7 }}>generate_scene → ภาพฉากคมชัด พร้อม NO-TEXT HARD LOCK</p>
      </section>
      <section style={{ ...box, marginTop: 12 }}>
        <b>02 · TEXT LAYER</b>
        <p style={{ opacity: 0.7 }}>generate_text_layer → PNG โปร่งใส แยกจากฉาก</p>
      </section>
      <section style={{ ...box, marginTop: 12 }}>
        <b>03 · FINAL COMPOSITE</b>
        <p style={{ opacity: 0.7 }}>composite_final → รวมสองไฟล์เท่านั้น ไม่ regenerate</p>
      </section>

      <section style={{ ...box, marginTop: 24 }}>
        <b>MCP URL</b>
        <p style={code}>/api/mcp</p>
        <b>Health</b>
        <p style={code}>/api/health</p>
      </section>

      <section style={{ ...box, marginTop: 12 }}>
        <b>Image Provider</b>
        <p style={{ opacity: 0.7, lineHeight: 1.65 }}>
          ค่าเริ่มต้นใช้ Vercel AI Gateway ผ่าน VERCEL_OIDC_TOKEN อัตโนมัติบน Vercel
          และรองรับการตั้ง WFORGE_IMAGE_BASE_URL, WFORGE_IMAGE_MODEL, WFORGE_IMAGE_API_KEY ภายหลัง
        </p>
      </section>
    </main>
  );
}
