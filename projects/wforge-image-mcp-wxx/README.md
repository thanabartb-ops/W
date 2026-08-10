# wforge-image-mcp-wxx

W//FORGE image production MCP with three isolated stages:

1. `generate_scene` -> `SCENE_MASTER.png` with strict NO TEXT rules
2. `generate_text_layer` -> `TEXT_LAYER.png` on transparent background
3. `composite_final` -> `FINAL_RESULT.png` by compositing only, without regenerating the scene or text

## Routes

- `/` project status page
- `/api/health` health/config endpoint
- `/api/mcp` MCP endpoint for ChatGPT

## Image provider

Default runtime uses Vercel AI Gateway with `VERCEL_OIDC_TOKEN` when available.
Optional overrides:

- `WFORGE_IMAGE_BASE_URL`
- `WFORGE_IMAGE_MODEL`
- `WFORGE_IMAGE_API_KEY`

Recommended default model: `openai/gpt-image-2`.
