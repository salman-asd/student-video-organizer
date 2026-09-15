import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUid } from "@/lib/server/requireAuth";

import type { AiProvider } from "@/types";

const MODEL_ENDPOINTS: Record<AiProvider, string> = {
  gemini:
    "https://generativelanguage.googleapis.com/v1beta/models",

  openai:
    "https://api.openai.com/v1/models",

  anthropic:
    "https://api.anthropic.com/v1/models",

  openrouter:
    "https://openrouter.ai/api/v1/models",

  groq:
    "https://api.groq.com/openai/v1/models",
};

export async function POST(req: NextRequest) {
  // Make sure the caller is logged in.
  const uid = await requireAuthenticatedUid(req);

  if (!uid) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const provider = body?.provider as AiProvider;
    const apiKey = body?.apiKey as string;

    if (!provider) {
      return NextResponse.json(
        { error: "Provider is required." },
        { status: 400 }
      );
    }

    if (!apiKey?.trim()) {
      return NextResponse.json(
        { error: "API key is required." },
        { status: 400 }
      );
    }

    const endpoint = MODEL_ENDPOINTS[provider];

    if (!endpoint) {
      return NextResponse.json(
        {
          error: `Unsupported provider: ${provider}`,
        },
        { status: 400 }
      );
    }

    const trimmedApiKey = apiKey.trim();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${trimmedApiKey}`,
      "Content-Type": "application/json",
    };

    // Anthropic uses x-api-key instead of Authorization: Bearer.
    if (provider === "anthropic") {
      delete headers.Authorization;

      headers["x-api-key"] = trimmedApiKey;
      headers["anthropic-version"] = "2023-06-01";
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        data?.error ||
        `Unable to fetch models (${response.status})`;

      return NextResponse.json(
        {
          error: errorMessage,
        },
        {
          status: response.status,
        }
      );
    }

    const models = Array.isArray(data?.data)
      ? data.data
          .map((m: any) => ({
            id: m?.id || m?.name || "",
            name: m?.name || m?.id || "",
          }))
          .filter(
            (m: { id: string; name: string }) =>
              m.id.trim().length > 0
          )
          .sort(
            (
              a: { name: string },
              b: { name: string }
            ) => a.name.localeCompare(b.name)
          )
      : [];

    return NextResponse.json(
      { models },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error: any) {
    console.error("Fetch AI models error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to fetch AI models.",
      },
      {
        status: 500,
      }
    );
  }
}

