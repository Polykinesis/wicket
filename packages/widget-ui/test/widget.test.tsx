import { err, ok } from "@cf-chat/shared/result";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fragmentLink } from "../src/components/SourceExcerpt.tsx";
import type { SubmitHandoff } from "../src/handoff.ts";
import { scopeLine, type WidgetScope } from "../src/scope.ts";
import { deriveTurn, type TurnView } from "../src/turn.ts";
import { Widget, type WidgetProps } from "../src/Widget.tsx";
import {
  assistant,
  escalation,
  NOW,
  richCitation,
  SCOPE,
  sources,
  text,
  wireCitation,
} from "./fixtures.ts";

// No vitest globals in this package, so Testing Library cannot register its
// own cleanup.
afterEach(cleanup);

const sent: SubmitHandoff = async (input) => ok({ reference: "NR-4F2K", email: input.email });

function renderWidget(overrides: Partial<WidgetProps> = {}) {
  const props: WidgetProps = {
    scope: SCOPE,
    turns: [],
    open: true,
    onOpenChange: vi.fn(),
    onAsk: vi.fn(),
    onSubmitHandoff: sent,
    now: NOW,
    ...overrides,
  };
  return { props, ...render(<Widget {...props} />) };
}

const turn = (reply: ReturnType<typeof assistant>, question = "Can I pause?"): TurnView =>
  deriveTurn(question, reply, "ready");

describe("launcher", () => {
  it("names what it knows about and opens on click", () => {
    const { props } = renderWidget({ open: false });
    const button = screen.getByRole("button", { name: "Ask about pricing, setup and refunds" });
    fireEvent.click(button);
    expect(props.onOpenChange).toHaveBeenCalledWith(true);
  });

  it("falls back to a plain label with no topics", () => {
    renderWidget({ open: false, scope: { tenantName: "Acme" } });
    expect(screen.getByRole("button", { name: "Ask a question" })).toBeTruthy();
  });

  it("is icon-only when asked, keeping the label for assistive tech", () => {
    renderWidget({ open: false, launcher: "icon" });
    const button = screen.getByRole("button", { name: "Ask about pricing, setup and refunds" });
    expect(button.textContent).toBe("");
  });

  it("does not take focus when the widget first mounts, closed or open", () => {
    const closed = renderWidget({ open: false });
    expect(document.activeElement).toBe(document.body);
    closed.unmount();

    renderWidget({ open: true });
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus into the panel on open and back to the launcher on close", () => {
    const { props, rerender } = renderWidget({ open: false });
    rerender(<Widget {...props} open={true} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    rerender(<Widget {...props} open={false} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Ask about pricing, setup and refunds" }),
    );
  });
});

describe("scope line", () => {
  it("counts documents and says how fresh they are", () => {
    expect(scopeLine(SCOPE, NOW)).toBe(
      "Answers from 42 documents published by Northwind Rota, updated 2 days ago",
    );
  });

  it("names the tenant instead of counting on a small site", () => {
    const small: WidgetScope = { ...SCOPE, documentCount: 5 };
    expect(scopeLine(small, NOW)).toBe(
      "Answers from Northwind Rota's published help content, updated 2 days ago",
    );
  });

  it("says nothing rather than something unproven", () => {
    expect(scopeLine({ tenantName: "Acme" }, NOW)).toBeNull();
    expect(scopeLine({ tenantName: "Acme", documentCount: 0 }, NOW)).toBeNull();
  });

  it("is the dialog's description", () => {
    renderWidget();
    expect(
      screen.getByRole("dialog", { name: "Ask Northwind Rota" }).getAttribute("aria-describedby"),
    ).toBeTruthy();
  });
});

describe("empty state", () => {
  it("sends a suggested question when picked", () => {
    const { props } = renderWidget();
    fireEvent.click(screen.getByRole("button", { name: /Can I pause my subscription/ }));
    expect(props.onAsk).toHaveBeenCalledWith("Can I pause my subscription over summer?");
  });
});

describe("answered", () => {
  it("highlights the verified quote inside the excerpt", () => {
    renderWidget({ turns: [turn(assistant(sources(richCitation("a")), text("Yes.")))] });
    const mark = document.querySelector("mark");
    expect(mark?.textContent).toBe("pause any paid plan for up to 3 months a year");
    expect(screen.getByText(/as of 28 Oct/)).toBeTruthy();
  });

  it("renders no highlight for a quote that is not in the excerpt", () => {
    const forged = richCitation("a", { quote: "every plan is free forever" });
    renderWidget({ turns: [turn(assistant(sources(forged), text("Yes.")))] });
    expect(document.querySelector("mark")).toBeNull();
    expect(screen.queryByText(/free forever/)).toBeNull();
  });

  it("shows a title and no link when the source has no URL", () => {
    renderWidget({
      turns: [turn(assistant(sources(wireCitation("a", "Billing.pdf")), text("Yes.")))],
    });
    expect(screen.getByText("Billing.pdf")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links to the passage when the source has a URL", () => {
    const withUrl = richCitation("a", { url: "https://acme.example/help/billing#top" });
    renderWidget({ turns: [turn(assistant(sources(withUrl), text("Yes.")))] });
    const link = screen.getByRole("link", { name: /Open the page at this passage/ });
    expect(link.getAttribute("href")).toBe(
      fragmentLink(
        "https://acme.example/help/billing",
        "pause any paid plan for up to 3 months a year",
      ),
    );
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders model text as text, never as markup", () => {
    renderWidget({ turns: [turn(assistant(text("<img src=x onerror=alert(1)>")))] });
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("lists further sources behind a button", () => {
    const reply = assistant(
      sources(wireCitation("a", "Billing"), wireCitation("b", "Settings")),
      text("Yes."),
    );
    renderWidget({ turns: [turn(reply)] });
    fireEvent.click(screen.getByRole("button", { name: "1 more source: Settings" }));
    expect(screen.getByText("Settings")).toBeTruthy();
  });
});

describe("fragmentLink", () => {
  it("encodes the directive's own syntax characters", () => {
    expect(fragmentLink("https://a.example/p", "pre-paid, monthly & annual")).toBe(
      "https://a.example/p#:~:text=pre%2Dpaid%2C%20monthly%20%26%20annual",
    );
  });

  it("uses start and end words for a long quote", () => {
    const quote = "one two three four five six seven eight nine ten eleven twelve";
    expect(fragmentLink("https://a.example/p", quote)).toBe(
      "https://a.example/p#:~:text=one%20two%20three%20four%20five,eight%20nine%20ten%20eleven%20twelve",
    );
  });
});

describe("not found and handoff", () => {
  const notFound = (): TurnView =>
    turn(
      assistant(
        sources(wireCitation("a", "Pricing"), wireCitation("b", "FAQ")),
        escalation({
          escalated: true,
          signal: 1,
          rule: "no_chunks",
          reason: "No sources matched.",
        }),
        text("No sources matched. Let me pass you to someone who can help."),
      ),
      "Do you do charity discounts?",
    );

  it("says so plainly, shows where it looked, and hides the canned text", () => {
    renderWidget({ turns: [notFound()] });
    expect(
      screen.getByRole("heading", { name: "Nothing Northwind Rota has published covers this" }),
    ).toBeTruthy();
    expect(screen.getByText("Looked in: Pricing, FAQ")).toBeTruthy();
    expect(screen.queryByText(/Let me pass you/)).toBeNull();
    expect(screen.getByLabelText("Your question")).toHaveProperty(
      "value",
      "Do you do charity discounts?",
    );
  });

  it("validates before sending and puts the error by the field", async () => {
    const submit = vi.fn(sent);
    renderWidget({ turns: [notFound()], onSubmitHandoff: submit });
    fireEvent.click(screen.getByRole("button", { name: "Send to Sam" }));
    expect(await screen.findByText(/Enter an email address/)).toBeTruthy();
    expect(screen.getByLabelText("Your email").getAttribute("aria-invalid")).toBe("true");
    expect(submit).not.toHaveBeenCalled();
  });

  it("sends and confirms with the reference", async () => {
    const submit = vi.fn(sent);
    renderWidget({ turns: [notFound()], onSubmitHandoff: submit });
    fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "jo@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Sam" }));
    expect(await screen.findByText("NR-4F2K")).toBeTruthy();
    expect(submit).toHaveBeenCalledWith({
      email: "jo@example.com",
      name: null,
      question: "Do you do charity discounts?",
    });
  });

  it("keeps what was typed when sending fails", async () => {
    const failing: SubmitHandoff = async () => err({ kind: "unavailable" });
    renderWidget({ turns: [notFound()], onSubmitHandoff: failing });
    fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "jo@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Sam" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/did not send/);
    expect(screen.getByLabelText("Your email")).toHaveProperty("value", "jo@example.com");
  });
});

describe("partial", () => {
  it("offers the handoff instead of opening it, then opens on request", () => {
    const reply = assistant(
      sources(richCitation("a")),
      text("You can pause for 3 months."),
      escalation({
        escalated: false,
        coverage: "partial",
        uncovered: "Whether Slack keeps running.",
      }),
    );
    renderWidget({ turns: [turn(reply)] });
    expect(screen.queryByLabelText("Your email")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send this part to Sam" }));
    expect(screen.getByLabelText("Your question")).toHaveProperty(
      "value",
      "Whether Slack keeps running.",
    );
  });

  it("does not open the form just because the turn started out searching", () => {
    const { rerender, props } = renderWidget({ turns: [deriveTurn("Q", undefined, "submitted")] });
    const partial = turn(
      assistant(
        text("Probably."),
        escalation({ escalated: true, signal: 2, rule: "below_confidence_threshold", reason: "x" }),
      ),
    );
    rerender(<Widget {...props} turns={[partial]} />);
    expect(screen.queryByLabelText("Your email")).toBeNull();
    expect(screen.getByRole("button", { name: "Check with Sam" })).toBeTruthy();
  });
});

describe("composer", () => {
  it("sends on Enter and clears", () => {
    const { props } = renderWidget();
    const input = screen.getByRole("textbox", { name: "Ask a question" });
    fireEvent.change(input, { target: { value: "  Do you integrate with Slack? " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onAsk).toHaveBeenCalledWith("Do you integrate with Slack?");
    expect(input).toHaveProperty("value", "");
  });

  it("will not send while a turn is in flight", () => {
    const { props } = renderWidget({ turns: [deriveTurn("Q", undefined, "submitted")] });
    const input = screen.getByRole("textbox", { name: "Ask a question" });
    fireEvent.change(input, { target: { value: "Another" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onAsk).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send question" })).toHaveProperty("disabled", true);
  });

  it("always offers a person, independent of any turn", async () => {
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "Talk to a person" }));
    const section = screen.getByRole("region", { name: "Message Sam" });
    fireEvent.change(within(section).getByLabelText("Your email"), {
      target: { value: "jo@example.com" },
    });
    fireEvent.change(within(section).getByLabelText("Your question"), {
      target: { value: "Hello" },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Send to Sam" }));
    expect(await screen.findByText("Sent to Sam")).toBeTruthy();
  });
});

describe("panel", () => {
  it("closes on Escape", () => {
    const { props } = renderWidget();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
