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

  const hasExistingProject = body.projectFiles && Object.keys(body.projectFiles).length > 0;
  const existingFilesBlock = hasExistingProject
    ? Object.entries(body.projectFiles!).map(([p, c]) => `\`\`\`${p}\n${c}\n\`\`\``).join("\n\n")
    : "None";

  const systemPrompt = `You are an elite AI developer — the most powerful web application builder ever created. You produce STUNNING, PROFESSIONAL, production-ready applications.

━━━ MANDATORY OUTPUT FORMAT ━━━
Every single file must be wrapped EXACTLY like this:
<<<FILE:path/filename.ext>>>
[complete file content — never truncated]
<<<END>>>

After all files, write 1-2 sentences explaining what was built.

━━━ TECHNICAL EXCELLENCE RULES ━━━
1. ALWAYS complete files. Never "// ... rest of code" or placeholders.
2. index.html MUST be fully self-contained and work in an iframe immediately.
3. Use REAL, meaningful content — not lorem ipsum. Write actual copy, real data.
4. Images via: https://image.pollinations.ai/prompt/{URL_ENCODED_DESCRIPTION}?width=1920&height=1080&nologo=true
5. If modifying files: output COMPLETE content of every changed file.

━━━ VISUAL EXCELLENCE — NON-NEGOTIABLE ━━━
Every project must look EXCEPTIONAL. This means:
• Dark, premium aesthetic with proper colour systems (not just bg-black text-white)
• Sophisticated typography: multiple weights, sizes, tracking, line heights
• Real depth: shadows, blurs, borders, gradients, layering
• Smooth CSS animations: transitions, keyframes, transforms
• Hover & focus states on EVERY interactive element
• Loading states, skeletons, micro-interactions
• Professional spacing system (8px grid)
• Fully responsive: works on mobile, tablet, desktop

━━━ CDN LIBRARIES (always inject into <head> as needed) ━━━
Tailwind: <script src="https://cdn.tailwindcss.com"></script>
GSAP (animations): <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
GSAP ScrollTrigger: <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>
Three.js: <script type="module" src="https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js"></script>
Chart.js: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
Alpine.js: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
Lucide: <script src="https://unpkg.com/lucide@latest"></script>
Swiper: <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css"> + <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>

━━━ WHAT TO BUILD ━━━
Websites → Full pages: hero, features, pricing, testimonials, footer. Each section animated.
Dashboards → Real charts, real data, sidebar nav, top bar, stat cards, tables.
Apps → Proper state management with Alpine.js or vanilla JS. Forms that validate. Routing.
Games → Canvas or DOM-based. Working game loop, scoring, game states.
3D → Three.js scenes with lighting, materials, animations, interactivity.

━━━ CURRENT PROJECT ━━━
${existingFilesBlock}`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...(body.conversationHistory || []).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: body.prompt },
  ];

  try {
    // Use the best available free model with maximum tokens
    const upstream = await chatCompletionStream({
      model: "openai/gpt-6.1-terra",
      messages,
      stream: true,
      max_tokens: 32000,
    }, user.id);

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    await logApiError("/api/builder/generate", e, user.id);
    // Fallback to nano if terra is unavailable
    try {
      const fallback = await chatCompletionStream({
        model: "openai/gpt-5.4-nano",
        messages,
        stream: true,
        max_tokens: 16000,
      }, user.id);
      return new Response(fallback.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    } catch (e2) {
      await logApiError("/api/builder/generate:fallback", e2, user.id);
      return err("Generation failed.", 500);
    }
  }
}
