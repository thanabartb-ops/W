export async function GET() {
  return Response.json({
    ok: true,
    name: 'wforge-image-mcp-wxx',
    version: '1.0.0',
    mcp: '/api/mcp',
    tools: ['generate_scene', 'generate_text_layer', 'composite_final'],
    imageConfigured: Boolean(process.env.WFORGE_IMAGE_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    model: process.env.WFORGE_IMAGE_MODEL || 'openai/gpt-image-2',
  });
}
