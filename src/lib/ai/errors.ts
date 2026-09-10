// Provider-agnostic error shape returned by the AI service. Every adapter
// (Gemini now, OpenAI/Anthropic later — see Phase 8/9) must translate its
// own provider's error format into one of these codes instead of letting
// raw provider errors/status codes leak up to the application.
//
// The codes are deliberately chosen to match the cross-provider fallback rules:
// "invalid_request" / "unsupported_provider" / "blocked" / "unknown" should
// NOT burn through every configured connection, while "auth" / "rate_limit" /
// "timeout" / "network" / "server_error" are exactly the cases fallback
// exists for. Defining the taxonomy now (Phase 4) means Phase 7 can switch on
// `error.code` instead of re-deriving this classification later.
export type AiErrorCode =
  | "auth" // key rejected / unauthorized
  | "rate_limit" // 429 / quota exceeded
  | "invalid_request" // malformed request, bad model name, etc. — an application bug, not a bad key
  | "blocked" // provider refused to answer this specific input (safety filtering)
  | "timeout" // request timed out
  | "network" // could not reach the provider at all
  | "server_error" // temporary provider/server failure
  | "unsupported_provider" // AiConnection.provider isn't implemented yet
  | "unknown";

export class AiServiceError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiServiceError";
    this.code = code;
  }
}
