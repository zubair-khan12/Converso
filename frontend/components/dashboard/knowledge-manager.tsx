"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import {
  addKnowledgeText,
  deleteDocument,
  trainAgent,
  uploadKnowledgeFile,
} from "@/lib/api";
import type { Agent, DocumentStatus, KnowledgeDocument, TrainingSummary } from "@/lib/types";

const DOC_STATUS: Record<DocumentStatus, { label: string; tone: PillTone }> = {
  ready: { label: "Trained", tone: "success" },
  pending: { label: "Not trained", tone: "pending" },
  processing: { label: "Embedding…", tone: "pending" },
  failed: { label: "Failed", tone: "danger" },
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeManager({
  agent,
  documents,
}: {
  agent: Agent;
  documents: KnowledgeDocument[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"text" | "file" | "train" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trained, setTrained] = useState<TrainingSummary | null>(null);

  const hasPending = documents.some((d) => d.status !== "ready");
  const untrainedFailures = documents.filter((d) => d.status === "failed");

  async function onAddText(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy("text");
    const result = await addKnowledgeText(agent.id, { title, text });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle("");
    setText("");
    setTrained(null);
    router.refresh();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || busy) return;
    setError(null);
    setBusy("file");
    const result = await uploadKnowledgeFile(agent.id, file);
    setBusy(null);
    if (fileInput.current) fileInput.current.value = "";
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTrained(null);
    router.refresh();
  }

  async function onDelete(doc: KnowledgeDocument) {
    if (deletingId) return;
    setError(null);
    setDeletingId(doc.id);
    const result = await deleteDocument(agent.id, doc.id);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTrained(null);
    router.refresh();
  }

  async function onTrain() {
    if (busy) return;
    setError(null);
    setTrained(null);
    setBusy("train");
    const result = await trainAgent(agent.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTrained(result.training);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">
              Knowledge base
            </h1>
            {agent.knowledge_trained && (
              <StatusPill tone="success" dot={false}>
                <Sparkles className="h-3.5 w-3.5" />
                RAG enabled
              </StatusPill>
            )}
          </div>
          <p className="page-sub">
            Give <span className="font-medium text-[var(--ink)]">{agent.name}</span>{" "}
            text and documents to answer from, then train it.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link href="/dashboard/agents" />}
          nativeButton={false}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to agents
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Add pasted text */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add text</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={onAddText}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="kb-title">Title (optional)</Label>
                <Input
                  id="kb-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Business hours & location"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="kb-text">Text</Label>
                <Textarea
                  id="kb-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste anything the agent should know — hours, policies, FAQs…"
                  rows={6}
                  required
                />
              </div>
              <div>
                <Button
                  type="submit"
                  disabled={busy !== null || !text.trim()}
                  className="gap-1.5"
                >
                  {busy === "text" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {busy === "text" ? "Adding…" : "Add text"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Upload a document */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload a document</CardTitle>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={onPickFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy !== null}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-sunk)] px-4 py-10 text-center transition-colors hover:border-[var(--amber)] hover:bg-[var(--accent-softer)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "file" ? (
                <Loader2 className="h-6 w-6 animate-spin text-[var(--amber-ink)]" />
              ) : (
                <Upload className="h-6 w-6 text-[var(--amber-ink)]" />
              )}
              <span className="text-sm font-medium text-[var(--ink)]">
                {busy === "file" ? "Uploading…" : "Click to upload"}
              </span>
              <span className="text-xs text-[var(--ink-muted)]">
                PDF or .txt / .md · up to 10 MB
              </span>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Sources + train */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Knowledge sources
            <span className="ml-2 text-sm font-normal text-[var(--ink-muted)]">
              {documents.length}
            </span>
          </CardTitle>
          <CardAction className="self-center">
            <Button
              size="lg"
              variant="brand"
              onClick={onTrain}
              disabled={busy !== null || documents.length === 0}
              title={
                documents.length === 0
                  ? "Add at least one source first"
                  : "Chunk + embed sources and enable RAG on this agent"
              }
            >
              {busy === "train" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {busy === "train" ? "Training…" : "Train agent"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {trained && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] px-3 py-2.5 text-sm text-[var(--success-ink)]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Embedded {trained.documents_trained} source
                {trained.documents_trained === 1 ? "" : "s"} into{" "}
                <span className="font-semibold">{trained.chunks}</span> chunks.
                {trained.documents_failed > 0 &&
                  ` ${trained.documents_failed} failed — see below.`}{" "}
                {agent.knowledge_trained && (
                  <>
                    This agent now answers from its knowledge base —{" "}
                    <Link href="/dashboard/agents" className="font-semibold underline">
                      test it from Agents
                    </Link>
                    .
                  </>
                )}
              </span>
            </div>
          )}

          {documents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--amber-ink)]">
                <BookOpen className="h-5 w-5" />
              </span>
              <p className="text-sm text-[var(--ink-muted)]">
                No sources yet. Add text or upload a document above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-sunk)] text-[var(--ink-muted)]">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-[var(--ink)]">
                          {doc.filename}
                        </p>
                        <StatusPill tone={DOC_STATUS[doc.status].tone}>
                          {DOC_STATUS[doc.status].label}
                        </StatusPill>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        {doc.status === "ready"
                          ? `${doc.chunk_count} chunk${doc.chunk_count === 1 ? "" : "s"}`
                          : "Not embedded yet"}
                        {formatSize(doc.size_bytes) && ` · ${formatSize(doc.size_bytes)}`}
                      </p>
                      {doc.status === "failed" && doc.error && (
                        <p className="mt-1 text-xs text-[var(--danger)]">{doc.error}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(doc)}
                    disabled={deletingId !== null}
                    className="shrink-0 gap-1.5 text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === doc.id ? "Removing…" : "Remove"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-[var(--ink-muted)]">
            {hasPending
              ? "You have untrained changes. Click “Train agent” to embed them."
              : "All sources are embedded and searchable."}{" "}
            While you test the agent, the retrieval trace (query, embedding,
            matched chunks + scores) prints to the backend console.
          </p>
          {untrainedFailures.length > 0 && !trained && (
            <p className="mt-1 text-xs text-[var(--danger)]">
              {untrainedFailures.length} source
              {untrainedFailures.length === 1 ? "" : "s"} failed to embed — check
              that OPENAI_API_KEY is configured, then train again.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
