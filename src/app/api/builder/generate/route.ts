import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
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
    context?: string;
  }>(req);
  
  if (!body?.prompt) return err("Prompt required.");

  const systemPrompt = `You are an expert full-stack developer and AI App Builder.
Your task is to build or modify a web application based on the user's request.

Output the project structure and file contents using this EXACT format for EVERY file you create or modify:
---FILE:path/to/file.ext---
[file content here]
---END---

Guidelines:
- Tech Stack: Vanilla JS with Tailwind CSS or React (UMD/Babel).
- Entry Point: ALWAYS output an 'index.html'.
- Formatting: Use the format ---FILE:filename--- code ---END--- for EVERY file.
- UI: Premium black and gold theme. Use Tailwind classes like 'bg-[#050505]', 'text-[#c9a227]', 'border-[#c9a227]/20'.
- Icons: Use Lucide Icons (<script src="https://unpkg.com/lucide@latest"></script>). Initialize them in JS with 'lucide.createIcons()'.
- Animations: Use Framer Motion (via 'https://cdn.jsdelivr.net/npm/framer-motion@11.0.8/+esm' if module) or simply CSS Transitions.
- Images: Use 'https://image.pollinations.ai/prompt/{description}?width=1024&height=1024&nologo=true&seed={random}'.
- Responsiveness: Always use 'flex', 'grid', and 'sm:', 'md:', 'lg:' breakpoints.
- Interactive: Add hover effects, clicking interactions, and smooth reveals.
- NO PLACEHOLDERS: Generate real, high-quality content. Do not use 'lorem ipsum'.
- COMPLEXITY: Build robust layouts (Header, Hero, Features, Footer, etc.).
- REFINEMENT: If modifying, only output the files that changed, but output the WHOLE content of those files.
- ALWAYS initialize lucide icons after any DOM update.

Current project files:
${body.projectFiles ? Object.entries(body.projectFiles).map(([path, content]) => `FILE: ${path}\nCONTENT:\n${content}`).join('\n\n') : "None (Starting new project)"}

Previous context:
${body.context || "No previous context."}`;

  try {
    const upstream = await chatCompletionStream({
      model: "openai/gpt-5.4-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: body.prompt }
      ],
      stream: true,
      max_tokens: 8000
    }, user.id);

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (e) {
    await logApiError("/api/builder/generate", e, user.id);
    return err("Generation failed.", 500);
  }
}
