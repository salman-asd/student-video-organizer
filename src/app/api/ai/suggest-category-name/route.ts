import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { listCategories } from "@/lib/firestore/categoriesTags";
import { withAiConnection } from "@/lib/server/resolveAiConnection";
import { AiServiceError } from "@/lib/ai/aiService";

const STATUS_BY_CODE: Record<string, number> = {
  auth: 400,
  rate_limit: 429,
  invalid_request: 502,
  blocked: 422,
  timeout: 504,
  network: 502,
  server_error: 502,
  unsupported_provider: 400,
  unknown: 500,
};

export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const typedValue = String(body?.otherText ?? "").trim();
  if (!typedValue) {
    return NextResponse.json({ error: "The typed topic is required." }, { status: 400 });
  }

  try {
    const candidateCategories = await listCategories(uid);
    const suggestion = await withAiConnection(uid, async (apiKey, provider, model) => {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `Clean up this learning interest label and decide if it matches an existing category.\n\nInput: "${typedValue}"\nExisting categories: ${candidateCategories.map((c) => c.name).join(", ") || "(none)"}\n\nReturn JSON only in this exact shape:\n{\n  "cleanedName": "string",\n  "isDuplicate": boolean,\n  "matchingCategory": "string or null"\n}` } ] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new AiServiceError("invalid_request", errorText || "AI suggestion request failed.");
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? "").join("") ?? "";
      const parsed = JSON.parse((text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"));
      return {
        cleanedName: String(parsed.cleanedName || typedValue).trim(),
        isDuplicate: Boolean(parsed.isDuplicate),
        matchingCategory: parsed.matchingCategory ? String(parsed.matchingCategory).trim() : null,
      };
    });

    return NextResponse.json({ suggestion }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    if (err instanceof AiServiceError) {
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] ?? 500 });
    }
    console.error("Failed to suggest category name", err);
    return NextResponse.json({ error: "Something went wrong creating a category suggestion." }, { status: 500 });
  }
}
