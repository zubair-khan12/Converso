"""The LangGraph agent that answers a caller mid-call, grounded in the agent's
knowledge base.

This is the conversational *brain* for a trained agent: Vapi routes every turn
to us as a custom-LLM request, and this graph runs

    retrieve (embed query → pgvector search)  →  generate (LLM with context)

It's our first agentic workflow — the knowledge base is "tool #1"; Cal.com
scheduling will slot in as a second node/tool later. Retrieval is traced to the
console (and persisted by the caller) so the RAG steps are inspectable while
learning.
"""
import time
from typing import Any, TypedDict

from langchain_core.messages import AnyMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

from ..config import settings
from ..knowledge.embeddings import embed_query
from ..knowledge.service import search_by_vector

# How many chunks to pull into context per turn.
TOP_K = 4

# Appended to the tenant's base prompt so a trained agent knows to lean on the
# retrieved knowledge (and not to invent answers it can't find).
KB_SYSTEM_TEMPLATE = """{base_prompt}

# Answering from the knowledge base
You are a voice assistant for this business and have access to its knowledge
base. Use the KNOWLEDGE section below to answer the caller's question. If the
answer isn't there, say you don't have that information instead of guessing.
Keep answers short, spoken-friendly, and to the point — this is a phone call.

# KNOWLEDGE
{context}"""

# The couple of sentences seeded into a new agent's base prompt so, even before
# the tenant writes their own, the agent is oriented toward the knowledge base.
DEFAULT_KB_BASE_PROMPT = (
    "You are a friendly, concise voice assistant for this business. Answer "
    "caller questions using the business's knowledge base, and if something "
    "isn't covered there, say so honestly and offer to help another way."
)


class RagState(TypedDict, total=False):
    # Runtime handles (not serialized — we run in-process without a checkpointer).
    db: Any
    agent_id: str
    base_prompt: str
    temperature: float
    # The caller's latest utterance, and the full prior turn history as
    # LangChain messages (user/assistant), used to give the LLM context.
    query: str
    history: list[AnyMessage]
    # Produced by the graph.
    chunks: list[dict]
    retrieval_ms: int
    context: str
    answer: str


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


def _retrieve(state: RagState) -> dict:
    db = state["db"]
    agent_id = state["agent_id"]
    query = (state.get("query") or "").strip()

    if not query:
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


def _generate(state: RagState) -> dict:
    system = KB_SYSTEM_TEMPLATE.format(
        base_prompt=(state.get("base_prompt") or "").strip(),
        context=state.get("context") or _format_context([]),
    )
    messages: list[AnyMessage] = [SystemMessage(content=system), *state.get("history", [])]
    resp = _llm(state.get("temperature", 0.7)).invoke(messages)
    return {"answer": resp.content}


def _build_graph():
    g = StateGraph(RagState)
    g.add_node("retrieve", _retrieve)
    g.add_node("generate", _generate)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "generate")
    g.add_edge("generate", END)
    return g.compile()


# Compiled once at import — the graph is stateless across calls (state is passed
# in per invocation), so a single instance is safe to reuse.
rag_graph = _build_graph()


def run_rag(
    *,
    db: Any,
    agent_id: str,
    base_prompt: str,
    temperature: float,
    query: str,
    history: list[AnyMessage],
) -> dict:
    """Run one turn through the graph. Returns the final state
    (`answer`, `chunks`, `retrieval_ms`, `context`)."""
    return rag_graph.invoke(
        {
            "db": db,
            "agent_id": agent_id,
            "base_prompt": base_prompt,
            "temperature": temperature,
            "query": query,
            "history": history,
        }
    )
