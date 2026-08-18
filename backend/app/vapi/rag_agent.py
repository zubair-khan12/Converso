"""The LangGraph agent that answers a caller mid-call.

This is the conversational *brain* for an agent that Vapi's built-in model can't
serve on its own. Vapi routes every turn to us as a custom-LLM request, and this
graph runs:

    retrieve (embed query → pgvector search)
        ↓
    agent  ⇄  tools        (loops while the model wants to call a tool)
        ↓
    END

Two capabilities plug into it, and either one is enough to switch the brain on:

  - **Knowledge base** (tool #1) — retrieval happens up front in its own node,
    because a trained agent should answer *every* turn from its knowledge
    without having to decide to look something up.
  - **Cal.com scheduling** (tool #2) — genuine model-chosen tool calls, since
    booking is a deliberate multi-turn act (ask name → ask email → offer times →
    book), not something to do on every turn.

Retrieval and every tool call are traced to the console (and persisted by the
caller) so the steps are inspectable while learning.
"""
import time
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from ..config import settings
from ..knowledge.embeddings import embed_query
from ..knowledge.service import search_by_vector
from .scheduling_tools import build_scheduling_tools, today_in

# How many chunks to pull into context per turn.
TOP_K = 4

# Backstop on the agent⇄tools loop. The real cap is
# `scheduling_tools.MAX_TOOL_CALLS_PER_TURN`, which stops the loop *with an
# answer*; this only catches a model that keeps calling tools even after being
# told to stop. Each agent⇄tools round trip costs 2, plus 1 for retrieve, so
# this allows comfortably more than the tool budget — hitting it means something
# is genuinely stuck, not merely slow.
RECURSION_LIMIT = 16

# Said out loud when the brain can't produce a real answer. A caller is on the
# line, so silence is the one unacceptable outcome — better a graceful sentence
# than a 500 and dead air.
FALLBACK_ANSWER = (
    "Sorry, I'm having a bit of trouble on my end just now. "
    "Could you say that again?"
)

# Appended to the tenant's base prompt so a trained agent knows to lean on the
# retrieved knowledge (and not to invent answers it can't find).
KB_SECTION = """# Answering from the knowledge base
You are a voice assistant for this business and have access to its knowledge
base. Use the KNOWLEDGE section below to answer the caller's question. If the
answer isn't there, say you don't have that information instead of guessing.
Keep answers short, spoken-friendly, and to the point — this is a phone call.

# KNOWLEDGE
{context}"""

# The dates/times the scheduling tools need in order to be usable. The booking
# *behaviour* comes from the prompt the tenant copied into their base prompt;
# this section only supplies facts the model can't know on its own — crucially
# today's date, so "next Tuesday" can become a real YYYY-MM-DD.
SCHEDULING_SECTION = """# Scheduling context
Today is {today} ({weekday}). All times are in {time_zone}; speak only in that
timezone and never ask the caller for theirs. Meetings you book are
"{event_title}".
Use `find_available_slots` to see real free times (never guess one) and
`book_meeting` to confirm. Convert anything the caller says — "tomorrow", "next
Tuesday" — into a YYYY-MM-DD date yourself before calling the tool."""

# Cal.com is connected per tenant but armed for exactly ONE agent, so a tenant
# can paste the scheduling prompt into an agent that has no booking tools. The
# model then plays along and says "you're booked" — the worst possible failure,
# since the customer believes a meeting exists and nobody is told otherwise.
# This is the counterweight: when the prompt talks about booking and the tools
# aren't there, the model is told plainly that it cannot book.
NO_SCHEDULING_SECTION = """# You cannot book meetings
You have NO scheduling tools on this conversation. Never say a meeting is
booked, confirmed, or scheduled, and never invent a time or a confirmation.
If someone asks to book, tell them you can't book it yourself and offer to pass
the request on."""

# Words that mean the tenant's prompt is promising scheduling. Only then is the
# note above worth spending prompt space on — an agent that never mentions
# booking doesn't need to be told it can't.
_SCHEDULING_WORDS = (
    "book", "booking", "meeting", "appointment", "schedule", "scheduling",
    "slot", "calendar", "consultation",
)

# The couple of sentences seeded into a new agent's base prompt so, even before
# the tenant writes their own, the agent is oriented toward the knowledge base.
DEFAULT_KB_BASE_PROMPT = (
    "You are a friendly, concise voice assistant for this business. Answer "
    "caller questions using the business's knowledge base, and if something "
    "isn't covered there, say so honestly and offer to help another way."
)


class BrainState(TypedDict, total=False):
    # Runtime handles (not serialized — we run in-process without a checkpointer).
    db: Any
    agent_id: str
    base_prompt: str
    temperature: float
    # Which capabilities are on for this turn.
    rag_enabled: bool
    calcom: dict | None
    # The caller's latest utterance, plus the running message list. `add_messages`
    # makes this append-only, so the agent node and the tool node can each add to
    # it without clobbering the other.
    query: str
    messages: Annotated[list[AnyMessage], add_messages]
    # Produced by the retrieve node.
    chunks: list[dict]
    retrieval_ms: int
    context: str


def _format_context(chunks: list[dict]) -> str:
    if not chunks:
        return "(no relevant knowledge found)"
    return "\n\n".join(
        f"[{i + 1}] (from {c['filename']}) {c['content']}"
        for i, c in enumerate(chunks)
    )


def _print_trace(agent_id: str, query: str, qvec: list[float], chunks: list[dict], ms: int) -> None:
    """Console RAG trace — the learning-visibility part of the feature."""
    head = ", ".join(f"{v:+.4f}" for v in qvec[:8])
    print("\n" + "=" * 68)
    print(f"[RAG] agent={agent_id}")
    print(f"[RAG] query: {query!r}")
    print(f"[RAG] query embedding: dim={len(qvec)}  [{head}, ...]")
    print(f"[RAG] retrieval: {len(chunks)} chunks in {ms} ms (top-{TOP_K} by cosine)")
    for c in chunks:
        preview = c["content"].replace("\n", " ")
        if len(preview) > 90:
            preview = preview[:90] + "…"
        print(f"   {c['score']:.4f}  {c['filename']}#{c['chunk_index']}  {preview}")
    if not chunks:
        print("   (no chunks — agent has no trained knowledge, or none matched)")
    print("=" * 68 + "\n")


def _retrieve(state: BrainState) -> dict:
    db = state["db"]
    agent_id = state["agent_id"]
    query = (state.get("query") or "").strip()

    # An agent whose brain is on purely for scheduling has nothing to search —
    # skip the embedding round trip rather than paying for it every turn.
    if not state.get("rag_enabled") or not query:
        return {"chunks": [], "retrieval_ms": 0, "context": _format_context([])}

    t0 = time.perf_counter()
    qvec = embed_query(query)
    chunks = search_by_vector(db, agent_id, qvec, k=TOP_K)
    ms = int((time.perf_counter() - t0) * 1000)

    _print_trace(agent_id, query, qvec, chunks, ms)
    return {"chunks": chunks, "retrieval_ms": ms, "context": _format_context(chunks)}


def _llm(temperature: float) -> ChatOpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not set — the knowledge-base agent can't generate."
        )
    return ChatOpenAI(
        model=settings.RAG_LLM_MODEL,
        temperature=temperature,
        api_key=settings.OPENAI_API_KEY,
    )


def _promises_scheduling(base_prompt: str) -> bool:
    lowered = base_prompt.lower()
    return any(word in lowered for word in _SCHEDULING_WORDS)


def _system_prompt(state: BrainState) -> str:
    parts = [(state.get("base_prompt") or "").strip()]
    if state.get("rag_enabled"):
        parts.append(KB_SECTION.format(context=state.get("context") or _format_context([])))
    calcom = state.get("calcom")
    if not calcom and _promises_scheduling(state.get("base_prompt") or ""):
        parts.append(NO_SCHEDULING_SECTION)
    if calcom:
        today = today_in(calcom)
        parts.append(
            SCHEDULING_SECTION.format(
                today=today.isoformat(),
                weekday=today.strftime("%A"),
                time_zone=calcom.get("time_zone") or "UTC",
                event_title=calcom.get("event_title") or "meeting",
            )
        )
    return "\n\n".join(p for p in parts if p)


def _make_agent_node(tools: list[BaseTool]):
    def _agent(state: BrainState) -> dict:
        model = _llm(state.get("temperature", 0.7))
        if tools:
            model = model.bind_tools(tools)
        messages = [SystemMessage(content=_system_prompt(state)), *state.get("messages", [])]
        return {"messages": [model.invoke(messages)]}

    return _agent


def _build_graph(tools: list[BaseTool] | None = None):
    tools = tools or []
    g = StateGraph(BrainState)
    g.add_node("retrieve", _retrieve)
    g.add_node("agent", _make_agent_node(tools))
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "agent")
    if tools:
        g.add_node("tools", ToolNode(tools))
        # `tools_condition` sends us to "tools" when the model asked for one and
        # to END otherwise; the tool results come back to "agent" so it can turn
        # them into something to say.
        g.add_conditional_edges("agent", tools_condition)
        g.add_edge("tools", "agent")
    else:
        g.add_edge("agent", END)
    return g.compile()


# The tool-free graph is compiled once at import — it's stateless across calls
# (state is passed in per invocation), so one instance is safe to reuse. A graph
# *with* tools has to be built per turn, since the tools close over the calling
# tenant's Cal.com credentials.
rag_graph = _build_graph()


def _final_answer(state: dict) -> str:
    for message in reversed(state.get("messages", [])):
        if isinstance(message, AIMessage) and message.content:
            return message.content if isinstance(message.content, str) else str(message.content)
    return ""


def run_brain(
    *,
    db: Any,
    agent_id: str,
    base_prompt: str,
    temperature: float,
    query: str,
    history: list[AnyMessage],
    rag_enabled: bool = True,
    calcom: dict | None = None,
) -> dict:
    """Run one conversational turn. Returns `answer`, the RAG trace
    (`chunks`, `retrieval_ms`, `context`) and `tool_calls` — the scheduling
    tools that ran, for persisting alongside the retrieval trace."""
    tool_trace: list[dict] = []
    tools = build_scheduling_tools(calcom, tool_trace) if calcom else []
    graph = _build_graph(tools) if tools else rag_graph

    try:
        state = graph.invoke(
            {
                "db": db,
                "agent_id": agent_id,
                "base_prompt": base_prompt,
                "temperature": temperature,
                "rag_enabled": rag_enabled,
                "calcom": calcom,
                "query": query,
                "messages": history,
            },
            {"recursion_limit": RECURSION_LIMIT},
        )
    except GraphRecursionError:
        # The model wouldn't stop calling tools. The caller can't be left in
        # silence, so answer with something speakable and keep the trace — the
        # tool calls it made are exactly what's needed to diagnose the loop.
        print(
            f"[BRAIN] recursion limit hit for agent={agent_id} after "
            f"{len(tool_trace)} tool calls: {[t['tool_name'] for t in tool_trace]}"
        )
        return {
            "answer": FALLBACK_ANSWER,
            "chunks": [],
            "retrieval_ms": None,
            "context": "",
            "tool_calls": tool_trace,
        }

    return {
        "answer": _final_answer(state) or FALLBACK_ANSWER,
        "chunks": state.get("chunks", []),
        "retrieval_ms": state.get("retrieval_ms"),
        "context": state.get("context", ""),
        "tool_calls": tool_trace,
    }
