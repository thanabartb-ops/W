import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import sharp from 'sharp';

export const runtime = 'nodejs';

function imageConfig() {
  return {
    base: (process.env.WFORGE_IMAGE_BASE_URL || 'https://ai-gateway.vercel.sh/v1').replace(/\/$/, ''),
    key: process.env.WFORGE_IMAGE_API_KEY || process.env.VERCEL_OIDC_TOKEN || '',
    model: process.env.WFORGE_IMAGE_MODEL || 'openai/gpt-image-2',
  };
}

async function generateImage(prompt: string, transparent = false) {
  const c = imageConfig();
  if (!c.key) throw new Error('Image provider is not configured.');

  const body: Record<string, unknown> = {
    model: c.model,
    prompt,
    n: 1,
    response_format: 'b64_json',
    quality: 'high',
  };

  if (transparent) {
    body.background = 'transparent';
    body.output_format = 'png';
  }

  const response = await fetch(`${c.base}/images/generations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${c.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Image provider ${response.status}: ${text.slice(0, 600)}`);

  const json = JSON.parse(text);
  const base64 = json?.data?.[0]?.b64_json;
  if (!base64) throw new Error('Provider did not return b64_json image data.');
  return base64 as string;
}

async function bytesFrom(value: string) {
  if (/^https?:\/\//.test(value)) {
    const response = await fetch(value);
    if (!response.ok) throw new Error('Could not fetch image URL.');
    return Buffer.from(await response.arrayBuffer());
  }
  return Buffer.from(value.replace(/^data:image\/\w+;base64,/, ''), 'base64');
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'generate_scene',
      'Create a high-resolution scene master with STRICT NO TEXT. Returns PNG image data.',
      {
        prompt: z.string().min(1),
        aspect_ratio: z.string().default('1:1'),
      },
      async ({ prompt, aspect_ratio }) => {
        const locked = `${prompt}\n\nSTRICT SCENE MASTER RULES: NO visible text, NO letters, NO numbers, NO captions, NO logos containing text, NO pseudo-text, NO watermarks. Preserve clean negative space for later typography. Aspect ratio: ${aspect_ratio}. High detail, sharp, production quality.`;
        const base64 = await generateImage(locked, false);
        return {
          content: [
            { type: 'image', data: base64, mimeType: 'image/png' },
            { type: 'text', text: 'SCENE_MASTER.png generated with NO-TEXT lock.' },
          ],
        };
      },
    );

    server.tool(
      'generate_text_layer',
      'Create ONLY the requested typography as a transparent PNG layer. No scene/background.',
      {
        copy: z.string().min(1),
        design: z.string().default('premium high readability'),
        canvas: z.string().default('1:1'),
      },
      async ({ copy, design, canvas }) => {
        const locked = `Create ONLY typography on a fully transparent canvas. Exact copy: ${JSON.stringify(copy)}. Preserve every character, Thai vowel, tone mark, space, number and line break exactly. No scene, no objects, no background, no additional words. Design: ${design}. Canvas: ${canvas}. Front-facing and highly readable.`;
        const base64 = await generateImage(locked, true);
        return {
          content: [
            { type: 'image', data: base64, mimeType: 'image/png' },
            { type: 'text', text: 'TEXT_LAYER.png generated separately on transparent background.' },
          ],
        };
      },
    );

    server.tool(
      'composite_final',
      'Composite an existing scene and transparent text layer. Does NOT regenerate either image.',
      {
        scene: z.string().min(10).describe('Scene base64, data URI, or public URL'),
        text_layer: z.string().min(10).describe('Text layer base64, data URI, or public URL'),
        x: z.number().int().default(0),
        y: z.number().int().default(0),
      },
      async ({ scene, text_layer, x, y }) => {
        const sceneBytes = await bytesFrom(scene);
        const textBytes = await bytesFrom(text_layer);
        const output = await sharp(sceneBytes)
          .composite([{ input: textBytes, left: x, top: y }])
          .png()
          .toBuffer();
        const base64 = output.toString('base64');
        return {
          content: [
            { type: 'image', data: base64, mimeType: 'image/png' },
            { type: 'text', text: 'FINAL_RESULT.png composited without AI regeneration.' },
          ],
        };
      },
    );
  },
  {},
  { basePath: '/api' },
);

export { handler as GET, handler as POST, handler as DELETE };
