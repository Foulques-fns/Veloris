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
    ? Object.entries(body.projectFiles!).map(([p, c]) => `\`\`\${p}\n\${c}\n\`\`\`).join("\n\n")
    : "None";

  const systemPrompt = `You are an expert web developer AI. You build complete, production-quality, visually stunning web applications.

CRITICAL OUTPUT FORMAT — YOU MUST FOLLOW THIS EXACTLY:
Every file you create or modify must be wrapped like this:
<<<FILE:path/filename.ext>>>
complete file content here
<<<END>>>

RULES:
1. ALWAYS output complete file contents. Never truncate. Never use "// ... rest of code".
2. ALWAYS create a self-contained index.html that works immediately in a browser.
3. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
4. For any JavaScript: write modern vanilla JS (ES6+). Include it inline in index.html or as separate .js files.
5. For images: use https://image.pollinations.ai/prompt/{DESCRIPTION}?width=1200&height=800&nologo=true
   Replace {DESCRIPTION} with a URL-encoded description of the image.
6. Make things VISUALLY IMPRESSIVE: animations, gradients, hover effects, micro-interactions.
7. Make it FULLY FUNCTIONAL: buttons work, forms validate, navigation works, state is managed.
8. Use realistic content. No lorem ipsum. Write actual text, real feature names, real data.
9. Add CSS animations where appropriate (fadeIn, slideUp, parallax, etc.)
10. Ensure mobile responsiveness with proper breakpoints.
11. If modifying: re-output COMPLETE content of every changed file. Never partial updates.
12. After all files, write a brief explanation (1-3 sentences) of what was built/changed.

AVAILABLE LIBRARIES (reference by CDN if needed):
- Tailwind CSS: https://cdn.tailwindcss.com
- Alpine.js (great for interactivity): https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js
- Chart.js: https://cdn.jsdelivr.net/npm/chart.js
- Three.js: https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js
- GSAP: https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js
- Lucide icons: https://unpkg.com/lucide@latest (call lucide.createIcons() after DOM ready)

CURRENT PROJECT FILES:
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
