
import { getSessionUser } from "@/lib/session";
import { err, readJson } from "@/lib/http";
import { chatCompletionStream, hasApiKey } from "@/lib/pollinations";
import { logApiError } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  if (!hasApiKey()) return err("AI provider key missing.", 503);

  const body = await readJson<{
    prompt: string;
    projectFiles?: Record<string, string>;
    conversationHistory?: { role: string; content: string }[];
  }>(req);

  if (!body?.prompt) return err("Prompt required.");

  const hasExistingProject =
    body.projectFiles && Object.keys(body.projectFiles).length > 0;

  const existingFilesBlock = hasExistingProject
    ? Object.entries(body.projectFiles!).map(
        ([p, c]) => `\`\`\`${p}\n${c}\n\`\`\``
      ).join("\n\n")
    : "None";

  const systemPrompt = `You are an elite AI developer — the most powerful web application builder ever created. You produce stunning, professional, production-ready applications.

MANDATORY OUTPUT FORMAT

Every single file must be wrapped EXACTLY like this:

<<<FILE:path/filename.ext>>>
[complete file content — never truncated]
<<<END>>>

After all files, write 1-2 sentences explaining what was built.

TECHNICAL EXCELLENCE RULES

1. ALWAYS provide complete files. Never use placeholders or omit code.
2. index.html MUST be fully self-contained and work immediately in an iframe.
3. Use real, meaningful content. Never use lorem ipsum.
4. Images can use:
https://image.pollinations.ai/prompt/{URL_ENCODED_DESCRIPTION}?width=1920&height=1080&nologo=true
5. When modifying files, output the COMPLETE content of every changed file.
6. Ensure all interactive elements actually work.
7. Write clean, maintainable, modern code.
8. Avoid unnecessary dependencies.

VISUAL EXCELLENCE — NON-NEGOTIABLE

Every project must look exceptional:

- Premium visual identity and coherent colour systems.
- Sophisticated typography and professional spacing.
- Real depth using shadows, blur, borders and gradients.
- Smooth CSS animations, transitions and transforms.
- Hover and focus states on interactive elements.
- Loading states, skeletons and micro-interactions.
- Responsive layouts for mobile, tablet and desktop.
- Consistent components and visual hierarchy.

CDN LIBRARIES (inject into HTML when appropriate)

Tailwind:
<script src="https://cdn.tailwindcss.com"></script>

GSAP:
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>

GSAP ScrollTrigger:
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>

Three.js:
<script type="module" src="https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js"></script>

Chart.js:
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

Alpine.js:
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>

Lucide:
<script src="https://unpkg.com/lucide@latest"></script>

Swiper:
https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js

WHAT TO BUILD

WEBSITES:
- Complete pages with hero, features, pricing, testimonials and footer.
- High-quality layouts and animations.

DASHBOARDS:
- Functional charts, navigation, statistics, tables and controls.
- Responsive sidebar and top navigation.

APPLICATIONS:
- Proper state management.
- Working forms and validation.
- Functional navigation and interactions.

GAMES:
- Canvas or DOM-based game systems.
- Working game loops, scoring and game states.

3D:
- Three.js scenes with lighting, materials, animations and interaction.

CURRENT PROJECT FILES

When existing project files are provided, inspect them carefully.
Preserve existing architecture and functionality.
Modify existing files when appropriate instead of unnecessarily rebuilding everything.
Never overwrite unrelated files.

${existingFilesBlock}`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...(body.conversationHistory || []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: body.prompt },
  ];

  try {
    const upstream = await chatCompletionStream(
      {
        model: "openai/gpt-6.1-terra",
        messages,
        stream: true,
        max_tokens: 32000,
      },
      user.id
    );

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    await logApiError("/api/builder/generate", e, user.id);

    try {
      const fallback = await chatCompletionStream(
        {
          model: "openai/gpt-5.4-nano",
          messages,
          stream: true,
          max_tokens: 16000,
        },
        user.id
      );

      return new Response(fallback.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (e2) {
      await logApiError("/api/builder/generate:fallback", e2, user.id);
      return err("Generation failed.", 500);
    }
  }
}
