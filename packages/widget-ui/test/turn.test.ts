import { describe, expect, it, vi } from "vitest";
import { buildTurns, deriveTurn, type TurnView } from "../src/turn.ts";
import {
  assistant,
  escalation,
  richCitation,
  sources,
  text,
  user,
  wireCitation,
} from "./fixtures.ts";

const Q = "Can I pause my plan?";

function expectKind<K extends TurnView["kind"]>(
  turn: TurnView,
  kind: K,
): Extract<TurnView, { kind: K }> {
  expect(turn.kind).toBe(kind);
  // Cast justified: the assertion above has just narrowed this at runtime, and
  // `expect` is not a type guard, so the compiler cannot see it.
  return turn as Extract<TurnView, { kind: K }>;
}

describe("deriveTurn: in flight", () => {
  it("is searching before anything arrives", () => {
    const turn = expectKind(deriveTurn(Q, undefined, "submitted"), "searching");
    expect(turn.searched).toEqual([]);
  });

  it("is still searching once sources arrive but text has not", () => {
    const turn = deriveTurn(Q, assistant(sources(wireCitation("a", "Billing"))), "streaming");
    expect(expectKind(turn, "searching").searched.map((c) => c.title)).toEqual(["Billing"]);
  });

  it("is answered and streaming once text starts", () => {
    const turn = deriveTurn(
      Q,
      assistant(sources(wireCitation("a", "Billing")), text("Yes")),
      "streaming",
    );
    expect(expectKind(turn, "answered").streaming).toBe(true);
  });
});

describe("deriveTurn: answered", () => {
  it("treats the first distinct source as cited when the server does not say", () => {
    const reply = assistant(
      sources(
        wireCitation("a", "Billing"),
        wireCitation("a", "Billing"),
        wireCitation("b", "Settings"),
      ),
      text("Yes, for up to 3 months."),
    );
    const turn = expectKind(deriveTurn(Q, reply, "ready"), "answered");
    expect(turn.text).toBe("Yes, for up to 3 months.");
    expect(turn.cited.map((c) => c.id)).toEqual(["a"]);
    expect(turn.searched.map((c) => c.id)).toEqual(["b"]);
  });

  it("never carries the retrieval score into the view", () => {
    const turn = expectKind(
      deriveTurn(Q, assistant(sources(wireCitation("a", "Billing")), text("Yes")), "ready"),
      "answered",
    );
    expect(turn.cited[0]).not.toHaveProperty("score");
  });

  it("splits on `used` when the server sends it (ADR-017)", () => {
    const reply = assistant(
      sources(richCitation("a", { used: false }), richCitation("b"), richCitation("c")),
      text("Yes"),
    );
    const turn = expectKind(deriveTurn(Q, reply, "ready"), "answered");
    expect(turn.cited.map((c) => c.id)).toEqual(["b", "c"]);
    expect(turn.searched.map((c) => c.id)).toEqual(["a"]);
  });

  it("drops a quote that is not in the excerpt", () => {
    const reply = assistant(
      sources(richCitation("a", { quote: "refunds are always given" })),
      text("Yes"),
    );
    const turn = expectKind(deriveTurn(Q, reply, "ready"), "answered");
    expect(turn.cited[0]?.quote).toBeNull();
    expect(turn.cited[0]?.excerpt).toContain("pause any paid plan");
  });

  it("drops only the malformed citation, not the rest", () => {
    const reply = assistant(
      sources(wireCitation("a", "Bad", "javascript:alert(1)"), wireCitation("b", "Good")),
      text("Yes"),
    );
    const turn = expectKind(deriveTurn(Q, reply, "ready"), "answered");
    expect(turn.cited.map((c) => c.id)).toEqual(["b"]);
  });

  it("ignores a malformed sources part without failing the turn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const turn = deriveTurn(Q, assistant(sources(...Array(25).fill({})), text("Yes")), "ready");
    expect(expectKind(turn, "answered").cited).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("deriveTurn: escalations", () => {
  const canned = text("No sources matched. Let me pass you to someone who can help.");

  it.each(["no_chunks", "below_retrieval_threshold"] as const)(
    "%s is not_found, lists what was searched, and drops the canned text",
    (rule) => {
      const reply = assistant(
        sources(wireCitation("a", "Pricing")),
        escalation({ escalated: true, signal: 1, rule, reason: "No sources matched." }),
        canned,
      );
      const turn = expectKind(deriveTurn(Q, reply, "ready"), "not_found");
      expect(turn.searched.map((c) => c.title)).toEqual(["Pricing"]);
      expect(JSON.stringify(turn)).not.toContain("Let me pass you");
    },
  );

  it("retrieval_failed is unavailable", () => {
    const reply = assistant(
      escalation({ escalated: true, signal: 1, rule: "retrieval_failed", reason: "x" }),
      canned,
    );
    expectKind(deriveTurn(Q, reply, "ready"), "unavailable");
  });

  it.each([
    ["asked_for_human", "asked"],
    ["sensitive_topic", "sensitive"],
  ] as const)("%s is person_requested (%s)", (rule, why) => {
    const reply = assistant(escalation({ escalated: true, signal: 3, rule, reason: "x" }), canned);
    expect(expectKind(deriveTurn(Q, reply, "ready"), "person_requested").why).toBe(why);
  });

  it.each(["below_confidence_threshold", "model_requested_human", "no_self_report"] as const)(
    "%s after the model spoke is partial",
    (rule) => {
      const reply = assistant(
        sources(wireCitation("a", "Billing")),
        text("Probably yes."),
        escalation({ escalated: true, signal: 2, rule, reason: "x" }),
      );
      const turn = expectKind(deriveTurn(Q, reply, "ready"), "partial");
      expect(turn.text).toBe("Probably yes.");
      expect(turn.uncovered).toBeNull();
    },
  );

  it("no_self_report before any text (generator failed to start) is unavailable", () => {
    const reply = assistant(
      sources(wireCitation("a", "Billing")),
      escalation({ escalated: true, signal: 2, rule: "no_self_report", reason: "x" }),
      canned,
    );
    expectKind(deriveTurn(Q, reply, "ready"), "unavailable");
  });

  it("coverage partial without escalation is partial with the uncovered part (ADR-017)", () => {
    const reply = assistant(
      sources(richCitation("a")),
      text("You can pause for 3 months."),
      escalation({
        escalated: false,
        coverage: "partial",
        uncovered: "Whether Slack keeps running while paused.",
      }),
    );
    const turn = expectKind(deriveTurn(Q, reply, "ready"), "partial");
    expect(turn.uncovered).toBe("Whether Slack keeps running while paused.");
  });

  it("an unknown rule is ignored rather than trusted", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reply = assistant(
      text("Yes"),
      escalation({ escalated: true, signal: 2, rule: "made_up", reason: "x" }),
    );
    expectKind(deriveTurn(Q, reply, "ready"), "answered");
    warn.mockRestore();
  });
});

describe("deriveTurn: failures", () => {
  it("finished with nothing is failed", () => {
    expectKind(deriveTurn(Q, assistant(), "ready"), "failed");
  });

  it("a stream error with nothing shown is failed", () => {
    expectKind(deriveTurn(Q, undefined, "error"), "failed");
  });

  it("a stream error after text keeps the text as partial", () => {
    expectKind(deriveTurn(Q, assistant(text("Yes, you")), "error"), "partial");
  });
});

describe("buildTurns", () => {
  it("pairs questions with replies and applies status only to the last turn", () => {
    const turns = buildTurns(
      [user("first"), assistant(sources(wireCitation("a", "A")), text("one")), user("second")],
      "submitted",
    );
    expect(turns.map((t) => [t.kind, t.question])).toEqual([
      ["answered", "first"],
      ["searching", "second"],
    ]);
    const first = turns[0];
    expect(first?.kind === "answered" && first.streaming).toBe(false);
  });

  it("returns nothing for an empty conversation", () => {
    expect(buildTurns([], "ready")).toEqual([]);
  });
});
