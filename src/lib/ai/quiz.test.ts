import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseQuizQuestionsFromText } from "./aiService";

describe("parseQuizQuestionsFromText", () => {
  it("parses a valid JSON quiz response with the expected shape", () => {
    const result = parseQuizQuestionsFromText([
      "```json",
      "[",
      "  {",
      "    \"id\": \"q1\",",
      "    \"prompt\": \"What is the main idea?\",",
      "    \"options\": [{ \"id\": \"a\", \"text\": \"Alpha\" }, { \"id\": \"b\", \"text\": \"Beta\" }],",
      "    \"correctOptionId\": \"a\",",
      "    \"explanation\": \"Alpha is correct because it matches the transcript.\"",
      "  }",
      "]",
      "```",
    ].join("\n"));

    assert.deepEqual(result, [{
      id: "q1",
      prompt: "What is the main idea?",
      options: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }],
      correctOptionId: "a",
      explanation: "Alpha is correct because it matches the transcript.",
    }]);
  });

  it("accepts markdown-fenced JSON with surrounding explanation text", () => {
    const result = parseQuizQuestionsFromText([
      "Here is the quiz you asked for:",
      "```json",
      "[",
      "  {",
      "    \"id\": \"q1\",",
      "    \"prompt\": \"What is the main idea?\",",
      "    \"options\": [{ \"id\": \"a\", \"text\": \"Alpha\" }, { \"id\": \"b\", \"text\": \"Beta\" }],",
      "    \"correctOptionId\": \"a\",",
      "    \"explanation\": \"Alpha is correct because it matches the transcript.\"",
      "  }",
      "]",
      "```",
      "Thanks!",
    ].join("\n"));

    assert.equal(result.length, 1);
    assert.equal(result[0].prompt, "What is the main idea?");
  });

  it("accepts a raw JSON array with leading or trailing prose", () => {
    const result = parseQuizQuestionsFromText([
      "Here is the quiz:",
      "[",
      "  {",
      "    \"id\": \"q1\",",
      "    \"prompt\": \"What is the main idea?\",",
      "    \"options\": [{ \"id\": \"a\", \"text\": \"Alpha\" }, { \"id\": \"b\", \"text\": \"Beta\" }],",
      "    \"correctOptionId\": \"a\",",
      "    \"explanation\": \"Alpha is correct because it matches the transcript.\"",
      "  }",
      "]",
      "Thanks!",
    ].join("\n"));

    assert.equal(result.length, 1);
    assert.equal(result[0].prompt, "What is the main idea?");
  });

  it("rejects malformed JSON or missing required fields", () => {
    assert.throws(() => parseQuizQuestionsFromText("not-json"), /Invalid quiz response/);
    assert.throws(() => parseQuizQuestionsFromText(JSON.stringify([{ prompt: "oops" }])), /Invalid quiz response/);
  });
});
