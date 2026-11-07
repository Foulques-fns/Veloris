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
    errorContext?: string;
  }>(req);

  if (!body?.prompt) return err("Prompt required.");

  const hasExisting = body.projectFiles && Object.keys(body.projectFiles).length > 0;

  // Build a compact project summary for context (avoid sending huge files)
  let projectContext = "None (new project)";
  if (hasExisting) {
    const entries = Object.entries(body.projectFiles!);
    // Send full content for small files, truncated for large ones
    projectContext = entries.map(([path, content]) => {
      const lines = content.split("\n").length;
      const truncated = content.length > 3000 ? content.slice(0, 3000) + `\n... (${lines} lines total, truncated)` : content;
      return `━━ ${path} (${lines} lines) ━━\n${truncated}`;
    }).join("\n\n");
  }

  const systemPrompt = `You are VELORIS Code Studio — an elite AI full-stack developer. You build complete, production-quality, visually stunning web applications.

━━━ OUTPUT FORMAT (MANDATORY — FOLLOW EXACTLY) ━━━
Every file you create or modify MUST be wrapped like this:

<<<FILE:path/to/filename.ext>>>
complete file content here — NEVER truncated
<<<END>>>

After all files, write 1-3 sentences explaining what was built or changed.

━━━ ARCHITECTURE RULES ━━━
1. Create PROPER multi-file project structures. NOT everything in one file.
2. Separate concerns: HTML structure, CSS styling, JS logic, components.
3. For simple sites: index.html + styles.css + script.js + assets
4. For complex apps: proper folder hierarchy (src/, components/, styles/, etc.)
5. ALWAYS include index.html as the entry point.
6. Include package.json for Node/React projects (informational, not executed).
7. NEVER truncate files. NEVER use "// ... rest of code". Output COMPLETE content.
8. If modifying an existing project: output the COMPLETE content of every changed file.

━━━ VISUAL EXCELLENCE (NON-NEGOTIABLE) ━━━
Your websites must look like they were built by a $50K agency:
• Dark premium aesthetic OR clean modern design based on the request
• Real typography hierarchy: font-family, weight, size, spacing, line-height
• Depth: box-shadow, backdrop-filter, borders, gradients, layering
• Smooth animations: CSS transitions, keyframes, transforms on EVERY interaction
• Hover & focus states on EVERY interactive element
• Loading states, micro-interactions, scroll animations
• 8px spacing grid, consistent padding/margins
• Mobile-first responsive design with proper breakpoints
• Real content — NEVER lorem ipsum. Write actual copy.

━━━ IMAGES & ASSETS ━━━
For real images, use: https://image.pollinations.ai/prompt/{URL_ENCODED_DESCRIPTION}?width={W}&height={H}&nologo=true
• Replace {URL_ENCODED_DESCRIPTION} with a detailed description of the image
• Use appropriate dimensions (hero: 1920x1080, card: 800x600, avatar: 400x400, etc.)
• For icons: use Lucide Icons CDN
• For logos: use text-based logos with CSS styling (unless user provides an asset)

━━━ CDN LIBRARIES ━━━
Include these in <head> as needed:
• Tailwind: <script src="https://cdn.tailwindcss.com"></script>
• GSAP: <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
• GSAP ScrollTrigger: <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>
• Alpine.js: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
• Chart.js: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
• Three.js: <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js"}}</script>
• Lucide: <script src="https://unpkg.com/lucide@latest"></script> (call lucide.createIcons() after DOM ready)
• Swiper: <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css"><script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
• AOS (scroll animations): <link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet"><script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script> (call AOS.init())

━━━ DEBUGGING & ERROR FIXING ━━━
If the user reports an error or problem:
1. Analyze the error message carefully
2. Identify the root cause in the specific file(s)
3. Fix the actual issue — don't rewrite unrelated code
4. Explain what was wrong and what you fixed
5. Output the COMPLETE fixed file(s)

${body.errorContext ? `\n━━━ ERROR CONTEXT ━━━\n${body.errorContext}\n` : ""}
━━━ CURRENT PROJECT FILES ━━━
${projectContext}`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...(body.conversationHistory || []).slice(-10).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, 2000), // Keep history compact
    })),
    { role: "user" as const, content: body.prompt },
  ];

  // Try best model first, fallback chain
  const modelChain = ["openai/gpt-6.1-terra", "openai/gpt-5.5", "openai/gpt-5.4-nano"];

  for (const model of modelChain) {
    try {
      const upstream = await chatCompletionStream({
        model,
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
      await logApiError(`/api/builder/generate:${model}`, e, user.id);
      // Try next model
      continue;
    }
  }

  return err("All AI models are currently unavailable. Please retry.", 503);
}
