# LSUPERAGENT — Model Context Pack / ชุดไฟล์สำหรับป้อนโมเดล

**Date:** 2026-08-31
**Repository:** `thanabartb-ops/W`
**Purpose:** จัดลำดับและคัดเฉพาะไฟล์ LSUPERAGENT ที่ต้องใช้จริง เพื่อส่งให้โมเดลโค้ดดิ้งเฉพาะทาง (เช่น DeepSeek) ทำงานต่อ
**Scope:** เอกสารอ้างอิงอย่างเดียว — ไม่เปลี่ยน runtime, ไม่เปลี่ยน contract, ไม่เปลี่ยน DNS

---

## 1. สรุปผลการค้นคว้า / Research summary

พบไฟล์ที่เกี่ยวกับ LSUPERAGENT ทั้งหมด **48 ไฟล์** ใน 5 กลุ่ม จากทั้งรีโป 67 ไฟล์:

| กลุ่ม | ตำแหน่ง | จำนวน |
|---|---|---|
| Source of truth | `source-of-truth/LSUPERAGENT_CONTROL_CENTER_v1.yaml` | 1 |
| Design + Plan + Handoff | `docs/superpowers/{specs,plans,handoffs}/` | 3 |
| Application source | `projects/lsuperagent-control-center/` | 42 |
| CI gate | `.github/workflows/lsuperagent-r1-verify.yml` | 1 |
| Runbook | `projects/lsuperagent-control-center/docs/runbooks/WORK_LOG.md` | 1 |

**ข้อสังเกตสำคัญ:** ในรีโปนี้ **ไม่มี** การกำหนดโมเดล LLM ใด ๆ ผูกไว้กับ LSUPERAGENT เลย — ไม่มี `deepseek`, `claude-*`, `gpt-*` ในเนื้อไฟล์ใด คำว่า `deepseek` ปรากฏเฉพาะในชื่อ branch เท่านั้น ตาม design spec §6 การเลือกผู้ให้บริการโมเดลถูก **จงใจเลื่อนไปไว้หลัง Trusted Agent Gateway** (R3) ดังนั้นการต่อโมเดลใด ๆ ต้องทำที่ชั้น gateway ฝั่งเซิร์ฟเวอร์ ไม่ใช่ในเบราว์เซอร์

---

## 2. สถานะงานปัจจุบัน / Current state

| Release | Task | สถานะ |
|---|---|---|
| `R1_SOURCE` | Task 1 — scaffold | ✅ เสร็จ |
| `R2_PREVIEW` | Task 2 — nav + `/api/health` | ✅ เสร็จ (6 หน้า + health route + tests) |
| `R2_PREVIEW` | Task 3 — Vercel Preview evidence | ⬜ ยังไม่เริ่ม (ต้องใช้สิทธิ์ deploy — คนทำ ไม่ใช่โมเดล) |
| `R3_GATEWAY` | Task 4 — Supabase SSR auth | ⬜ **งานโค้ดถัดไป** |
| `R3_GATEWAY` | Task 5 — Gateway + `/api/chat` | ⬜ **งานโค้ดถัดไป** |
| `R4_CANONICAL_DATA` | Task 6 — Memory + Audit read | ⬜ |
| `R4_CANONICAL_DATA` | Task 7 — Tools deny-by-default | ⬜ |
| `R5_E2E` | Task 8 — Playwright ×4 | ⬜ |
| `R6`–`R8` | Task 9–11 — production / DNS / edge | ⬜ (ต้องใช้สิทธิ์จริง ไม่ใช่งานโมเดล) |

Gate ปัจจุบันตาม `WORK_LOG.md` คือ `PLAN_REVIEW`

---

## 3. ชุดไฟล์จัดลำดับ / Ranked context pack

ป้อนตามลำดับ Tier A → D งบรวมทั้งหมดประมาณ **56 KB ≈ 16,000 tokens** ซึ่งใส่ได้ครบใน context window เดียวของโมเดลสมัยใหม่

### Tier A — Authority (โหลดทุกครั้ง, ห้ามข้าม) — ~38 KB ≈ 10.9k tokens

ลำดับความสำคัญจากสูงไปต่ำ **เมื่อขัดแย้งกัน ให้ยึดอันดับที่สูงกว่า**:

| # | ไฟล์ | ขนาด | ทำไมต้องมี |
|---|---|---|---|
| A1 | `source-of-truth/LSUPERAGENT_CONTROL_CENTER_v1.yaml` | 2.8 KB | สัญญาแม่: env contract, API contract, release guards |
| A2 | `docs/superpowers/specs/2026-08-20-lsuperagent-control-center-design.md` | 16.7 KB | สถาปัตยกรรมผูกพัน — **spec ชนะ plan เสมอ** |
| A3 | `docs/superpowers/plans/2026-08-20-lsuperagent-control-center-implementation.md` | 13.8 KB | Task 1–11 พร้อม checklist และ commit message ที่บังคับ |
| A4 | `docs/superpowers/handoffs/2026-08-20-r1-source-codex.md` | 4.6 KB | รูปแบบ constraint + รายงานผลที่ต้องใช้ซ้ำทุก task |

### Tier B — สถานะโค้ดปัจจุบัน — ~9.8 KB ≈ 2.8k tokens

`projects/lsuperagent-control-center/` ทั้งหมดใต้ `src/` และ `tests/` **ยกเว้น** `globals.css`:

- `src/app/layout.tsx`, `page.tsx`, `manifest.ts`
- `src/app/(app)/layout.tsx` + 6 หน้า (`chat`, `projects`, `memory`, `tools`, `runtime`, `audit`)
- `src/app/api/health/route.ts` ← ต้นแบบรูปแบบ response ของทุก route ที่จะเขียนต่อ
- `src/components/{app-shell,module-panel,status-badge}.tsx`
- `src/types/connection-status.ts` ← enum `CONNECTED | DEGRADED | NOT_CONNECTED`
- `tests/setup.ts`, `tests/unit/*.test.tsx`, `tests/integration/health-route.test.ts` ← ต้นแบบสไตล์เทสต์ TDD

> `src/app/globals.css` (10.7 KB) โหลดเฉพาะงาน UI/visual เท่านั้น งาน gateway/backend ไม่ต้องใช้

### Tier C — Config / build contract — ~3.2 KB ≈ 0.9k tokens

`package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `pnpm-workspace.yaml`, `.env.example`, `AGENTS.md`

### Tier D — Verification gate — ~3.7 KB ≈ 1.1k tokens

`.github/workflows/lsuperagent-r1-verify.yml`, `README.md`, `docs/runbooks/WORK_LOG.md`

### Tier X — ตัดทิ้ง / EXCLUDE (~180 KB ที่ไม่เกี่ยวข้อง)

ห้ามป้อนเข้าโมเดลสำหรับงาน LSUPERAGENT — ไม่เกี่ยวข้องและกินโควตาเปล่า:

`index.html` (66 KB) · `index-15.html` (58 KB) · `WFORGE-DNA-CONTROL-SITE-private-preview.zip` · `WFORGE-EVOLUTION.skill.md` (19.5 KB) · `expert-system/contract.json` (16.7 KB) · `source-of-truth/WFORGE-FOCAS-ACTIVE-MAP.yaml` · `source-of-truth/WFORGE_FOCAS_PLUS_SERREZ_*.yaml` · `style/` · `assets/` · `projects/wforge-image-mcp-wxx/` · `public/*.svg` (ยกเว้น `serrez-hero.svg` เมื่อทำงาน UI) · `pnpm-lock.yaml`

---

## 4. ชุดไฟล์ต่อ Task / Per-task working set

โหลด Tier A + C + D เป็นฐานเสมอ แล้วเพิ่มตามนี้:

| Task | เพิ่มจาก Tier B | ไฟล์ใหม่ที่ต้องสร้าง |
|---|---|---|
| **Task 4** Supabase SSR auth | `api/health/route.ts`, `types/connection-status.ts`, `tests/**` | `src/lib/supabase/{client,server}.ts`, `src/lib/auth/get-current-user.ts`, `middleware.ts` |
| **Task 5** Gateway + `/api/chat` | ผลลัพธ์ Task 4 + `api/health/route.ts` | `src/lib/gateway/context.ts`, `src/lib/observability/*`, `src/app/api/chat/route.ts` |
| **Task 6** Memory + Audit | ผลลัพธ์ Task 4–5 | `src/app/api/{memory,audit}/route.ts`, `src/lib/policy/*` |
| **Task 7** Tools | ผลลัพธ์ Task 4–6 | `src/app/api/{tools,execute}/route.ts` |
| **Task 8** E2E | Tier B ทั้งหมด | `playwright.config.ts`, `tests/e2e/*.spec.ts` ×4 |

---

## 5. Prompt แม่แบบสำหรับโมเดลเฉพาะทาง / Model prompt template

```text
คุณกำลังทำงานในรีโป thanabartb-ops/W path projects/lsuperagent-control-center

ลำดับอำนาจของเอกสาร (ขัดแย้งกันให้ยึดอันบน):
1. source-of-truth/LSUPERAGENT_CONTROL_CENTER_v1.yaml
2. docs/superpowers/specs/2026-08-20-lsuperagent-control-center-design.md
3. docs/superpowers/plans/2026-08-20-lsuperagent-control-center-implementation.md

ทำเฉพาะ: TASK <N> — <ชื่อ task จาก plan>
หยุดทันทีเมื่อจบ task นี้ ห้ามทำ task ถัดไป

ข้อห้ามเด็ดขาด:
- ห้ามสร้าง Supabase project / Memory Core / audit authority ใหม่
- ห้ามแก้ Supabase production schema
- ห้ามแตะ DNS หรือ activity-hub.online
- ห้ามใส่ SUPABASE_SERVICE_ROLE_KEY, provider API key, GITHUB_TOKEN, VERCEL_TOKEN
  ลงในโค้ดฝั่งเบราว์เซอร์หรือไฟล์ที่ commit
- ห้ามอ้างว่าเชื่อมต่อ backend สำเร็จถ้ายังไม่ได้ต่อจริง — ให้คงค่า NOT_CONNECTED
- ห้าม mock ค่าเพื่อให้เทสต์ผ่าน — upstream ที่ยังไม่ต่อต้องคืน 503 UPSTREAM_UNAVAILABLE

วิธีทำ (TDD บังคับ):
1. เขียนเทสต์ที่ล้มก่อน แล้วรันให้เห็น RED จริง
2. เขียนโค้ดขั้นต่ำให้ผ่าน
3. รันครบทั้ง 4 คำสั่ง ต้อง exit 0 ทุกตัว:
   pnpm vitest run && pnpm lint && pnpm exec tsc --noEmit && pnpm build
4. commit ด้วยข้อความที่ระบุไว้ใน plan ของ task นั้นเป๊ะ ๆ

รายงานกลับตามรูปแบบใน docs/superpowers/handoffs/2026-08-20-r1-source-codex.md
ห้ามรายงาน PASS สำหรับคำสั่งที่ไม่ได้รันจริง
```

---

## 6. ข้อควรระวังเรื่องการต่อโมเดล / Model wiring caveat

ถ้าจะให้ LSUPERAGENT เรียกใช้โมเดล DeepSeek หรือโมเดลอื่นจริง ๆ ในตัวแอป:

- ต้องต่อที่ **Trusted Agent Gateway ฝั่งเซิร์ฟเวอร์เท่านั้น** (Task 5, design spec §6 และ §7) ห้ามเรียกจากเบราว์เซอร์
- API key ของผู้ให้บริการอยู่ในรายการ `forbidden` ของ `public_environment_contract` และถูกสแกนบล็อกโดย CI (`lsuperagent-r1-verify.yml`) — ต้องเก็บเป็น server-side env ใน Vercel เท่านั้น ห้าม commit
- `public_environment_contract.allowed` ปัจจุบันมีแค่ 2 ตัว การเพิ่มชื่อ env ใด ๆ ถือเป็นการแก้ source of truth ต้องผ่าน gate อนุมัติก่อน
- ยังไม่มี field สำหรับ model id ใน contract — ถ้าต้องการ ต้องเสนอแก้ `LSUPERAGENT_CONTROL_CENTER_v1.yaml` เป็นการเปลี่ยนแปลงแยกต่างหาก
