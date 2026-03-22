"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChatMessage,
  ChatSession,
  LlmProvider,
  Project,
  ProjectFile,
} from "@/lib/types";

type SpreadsheetSheet = {
  name: string;
  rows: string[][];
};

type IndexJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  scannedFiles: number;
  processedFiles: number;
  changedFiles: number;
  skippedFiles: number;
  indexedChunks: number;
  currentFile: string;
  currentFileChunkIndex: number;
  currentFileChunkTotal: number;
  error?: string;
};

type LlmAvailability = Record<LlmProvider, boolean>;

const MODEL_OPTIONS: Record<LlmProvider, string[]> = {
  openai: ["gpt-5.4-nano", "gpt-5.4", "gpt-4.1"],
  gemini: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
  perplexity: ["sonar", "sonar-pro"],
};

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [activeView, setActiveView] = useState<"chat" | "files">("chat");
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileEditable, setFileEditable] = useState(false);
  const [fileDirty, setFileDirty] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [spreadsheetSheets, setSpreadsheetSheets] = useState<SpreadsheetSheet[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [pdfViewerUrl, setPdfViewerUrl] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>("openai");
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS.openai[0]);
  const [customModel, setCustomModel] = useState("");
  const [isModelSwitcherOpen, setIsModelSwitcherOpen] = useState(false);
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [llmAvailability, setLlmAvailability] = useState<LlmAvailability>({
    openai: false,
    gemini: false,
    perplexity: false,
  });
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [createShouldIndex, setCreateShouldIndex] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexJobId, setIndexJobId] = useState("");
  const [indexJob, setIndexJob] = useState<IndexJob | null>(null);
  const [indexingProjectId, setIndexingProjectId] = useState("");
  const [hasElectronPicker, setHasElectronPicker] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const chatFormRef = useRef<HTMLFormElement | null>(null);

  function parseFolderPaths(input: string): string[] {
    return Array.from(
      new Set(
        input
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectedFile = useMemo(
    () => projectFiles.find((file) => file.relativePath === selectedFilePath) ?? null,
    [projectFiles, selectedFilePath],
  );

  const selectedSession = useMemo(
    () => chatSessions.find((session) => session.id === selectedSessionId) ?? null,
    [chatSessions, selectedSessionId],
  );

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = (await res.json()) as { projects: Project[] };
    setProjects(data.projects || []);
    if (!selectedProjectId && data.projects?.[0]) {
      setSelectedProjectId(data.projects[0].id);
    }
  }, [selectedProjectId]);

  const loadSessions = useCallback(async (projectId: string) => {
    if (!projectId) {
      setChatSessions([]);
      setSelectedSessionId("");
      return;
    }
    const res = await fetch(`/api/chat/sessions?projectId=${encodeURIComponent(projectId)}`);
    const data = (await res.json()) as { sessions?: ChatSession[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Failed to load chat sessions");
    }
    const sessions = data.sessions || [];
    setChatSessions(sessions);
    if (sessions.length === 0) {
      setSelectedSessionId("");
      setChatHistory([]);
      return;
    }
    if (!sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [selectedSessionId]);

  const loadHistory = useCallback(async (projectId: string, sessionId: string) => {
    if (!projectId || !sessionId) {
      setChatHistory([]);
      return;
    }

    const res = await fetch(
      `/api/chat?projectId=${encodeURIComponent(projectId)}&sessionId=${encodeURIComponent(sessionId)}`,
    );
    const data = (await res.json()) as { messages?: ChatMessage[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Failed to load chat history");
    }
    setChatHistory(data.messages || []);
  }, []);

  const loadFiles = useCallback(async (projectId: string) => {
    if (!projectId) {
      setProjectFiles([]);
      return;
    }

    const res = await fetch(`/api/files?projectId=${encodeURIComponent(projectId)}`);
    const data = (await res.json()) as { files?: ProjectFile[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Failed to load files");
    }
    const files = data.files || [];
    setProjectFiles(files);

    if (files.length === 0) {
      setSelectedFilePath("");
      setFileContent("");
      setFileEditable(false);
      setFileDirty(false);
      setSpreadsheetSheets([]);
      setActiveSheetIndex(0);
      setPdfViewerUrl("");
      return;
    }

    if (!files.some((file) => file.relativePath === selectedFilePath)) {
      setSelectedFilePath(files[0].relativePath);
    }
  }, [selectedFilePath]);

  const loadFileContent = useCallback(
    async (projectId: string, filePath: string) => {
      if (!projectId || !filePath) {
        setFileContent("");
        setFileEditable(false);
        setFileDirty(false);
        setSpreadsheetSheets([]);
        setActiveSheetIndex(0);
        setPdfViewerUrl("");
        return;
      }

      setIsFileLoading(true);
      try {
        const extension = filePath.split(".").pop()?.toLowerCase();

        if (extension === "pdf") {
          setFileContent("");
          setFileEditable(false);
          setFileDirty(false);
          setSpreadsheetSheets([]);
          setActiveSheetIndex(0);
          setPdfViewerUrl(
            `/api/files/raw?projectId=${encodeURIComponent(projectId)}&filePath=${encodeURIComponent(filePath)}`,
          );
          return;
        }

        if (extension === "xlsx") {
          const res = await fetch(
            `/api/files/spreadsheet?projectId=${encodeURIComponent(projectId)}&filePath=${encodeURIComponent(filePath)}`,
          );
          const data = (await res.json()) as { sheets?: SpreadsheetSheet[]; error?: string };
          if (!res.ok) {
            throw new Error(data.error || "Failed to load spreadsheet");
          }
          setFileContent("");
          setFileEditable(false);
          setFileDirty(false);
          setPdfViewerUrl("");
          setSpreadsheetSheets(data.sheets || []);
          setActiveSheetIndex(0);
          return;
        }

        const res = await fetch(
          `/api/files/content?projectId=${encodeURIComponent(projectId)}&filePath=${encodeURIComponent(filePath)}`,
        );
        const data = (await res.json()) as {
          content?: string;
          editable?: boolean;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "Failed to load file");
        }

        setFileContent(data.content || "");
        setFileEditable(Boolean(data.editable));
        setFileDirty(false);
        setSpreadsheetSheets([]);
        setActiveSheetIndex(0);
        setPdfViewerUrl("");
      } finally {
        setIsFileLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setHasElectronPicker(Boolean(window.electronAPI?.pickFolder));
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/models/availability");
      const data = (await res.json()) as Partial<LlmAvailability>;
      if (res.ok) {
        setLlmAvailability((prev) => ({
          ...prev,
          openai: Boolean(data.openai),
          gemini: Boolean(data.gemini),
          perplexity: Boolean(data.perplexity),
        }));
      }
    })();
  }, []);

  useEffect(() => {
    void loadProjects().catch((error) => {
      setStatus(error instanceof Error ? error.message : "Failed to load projects");
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setChatHistory([]);
      setChatSessions([]);
      setSelectedSessionId("");
      setProjectFiles([]);
      setSelectedFilePath("");
      setFileContent("");
      setFileEditable(false);
      setFileDirty(false);
      setSpreadsheetSheets([]);
      setActiveSheetIndex(0);
      setPdfViewerUrl("");
      return;
    }
    void loadSessions(selectedProjectId).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Failed to load chat sessions");
    });
    void loadFiles(selectedProjectId).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Failed to load files");
    });
  }, [selectedProjectId, loadSessions, loadFiles]);

  useEffect(() => {
    if (!selectedProjectId || !selectedSessionId) {
      setChatHistory([]);
      return;
    }
    void loadHistory(selectedProjectId, selectedSessionId).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Failed to load chat history");
    });
  }, [selectedProjectId, selectedSessionId, loadHistory]);

  useEffect(() => {
    if (!selectedProjectId || !selectedFilePath) {
      return;
    }
    void loadFileContent(selectedProjectId, selectedFilePath).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Failed to load file");
    });
  }, [selectedProjectId, selectedFilePath, loadFileContent]);

  async function handlePickFolder() {
    if (!hasElectronPicker || !window.electronAPI?.pickFolder) {
      setStatus("Folder picker is available in Electron desktop mode only.");
      return;
    }

    const picked = await window.electronAPI.pickFolder();
    if (picked.length > 0) {
      const existing = parseFolderPaths(folderPath);
      const merged = Array.from(new Set([...existing, ...picked]));
      setFolderPath(merged.join("\n"));
      setStatus(picked.length > 1 ? `${picked.length} folders selected.` : "Folder selected.");
    }
  }

  const activeSheet = spreadsheetSheets[activeSheetIndex];

  async function startIndexForProject(projectId: string) {
    setIsLoading(true);
    setIsIndexing(true);
    setIndexingProjectId(projectId);
    setIndexJob(null);
    setIndexJobId("");
    setStatus("Indexing files...");

    try {
      const res = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = (await res.json()) as { error?: string; job?: IndexJob };

      if (!res.ok) {
        throw new Error(data.error || "Failed to index project");
      }

      if (!data.job) {
        throw new Error("Index job did not start");
      }
      setIndexJobId(data.job.id);
      setIndexJob(data.job);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unknown error");
      setIsIndexing(false);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    const folderPaths = parseFolderPaths(folderPath);
    if (!projectName.trim() || folderPaths.length === 0) {
      setStatus("Project name and folder path are required.");
      return;
    }

    setIsLoading(true);
    setStatus("Creating project...");

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, folderPaths }),
      });
      const data = (await res.json()) as { error?: string; project?: Project };
      if (!res.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      setProjectName("");
      setFolderPath("");
      setChatHistory([]);
      setIsCreateProjectModalOpen(false);
      setStatus("Project created.");
      await loadProjects();
      if (data.project?.id) {
        setSelectedProjectId(data.project.id);
        await loadSessions(data.project.id);
        await loadFiles(data.project.id);
        if (createShouldIndex) {
          await startIndexForProject(data.project.id);
        }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddFolderToProject() {
    if (!selectedProjectId) {
      setStatus("Select a project first.");
      return;
    }

    let pickedFolders: string[] = [];
    if (hasElectronPicker && window.electronAPI?.pickFolder) {
      pickedFolders = await window.electronAPI.pickFolder();
    } else {
      const one = window.prompt("Enter absolute folder path to add:")?.trim() || "";
      pickedFolders = one ? [one] : [];
    }
    if (pickedFolders.length === 0) {
      return;
    }

    setIsLoading(true);
    try {
      for (const pickedFolder of pickedFolders) {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_folder",
            projectId: selectedProjectId,
            folderPath: pickedFolder,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Failed to add folder");
        }
      }
      await loadProjects();
      await loadFiles(selectedProjectId);
      setStatus(
        pickedFolders.length > 1
          ? `${pickedFolders.length} folders added to project.`
          : "Folder added to project.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleIndexProject() {
    if (!selectedProjectId) {
      setStatus("Select a project first.");
      return;
    }
    await startIndexForProject(selectedProjectId);
  }

  async function handleCreateChatSession() {
    if (!selectedProjectId) {
      setStatus("Select a project first.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId, title: "New chat" }),
      });
      const data = (await res.json()) as { session?: ChatSession; error?: string };
      if (!res.ok || !data.session) {
        throw new Error(data.error || "Failed to create chat session");
      }
      await loadSessions(selectedProjectId);
      setSelectedSessionId(data.session.id);
      setChatHistory([]);
      setStatus("New chat created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteProject(projectId: string, projectName: string) {
    const confirmed = window.confirm(
      `Delete project "${projectName}"? This will remove indexed documents, chunks, and chats.`,
    );
    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete project");
      }

      if (selectedProjectId === projectId) {
        setSelectedProjectId("");
        setSelectedSessionId("");
        setChatHistory([]);
        setChatSessions([]);
        setProjectFiles([]);
      }
      await loadProjects();
      setStatus("Project deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteChatSession(sessionId: string) {
    if (!selectedProjectId) {
      return;
    }
    const confirmed = window.confirm("Delete this chat?");
    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId, sessionId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete chat");
      }
      if (selectedSessionId === sessionId) {
        setSelectedSessionId("");
        setChatHistory([]);
      }
      await loadSessions(selectedProjectId);
      setStatus("Chat deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    if (!selectedProjectId) {
      setStatus("Select a project first.");
      return;
    }
    if (!message.trim()) {
      setStatus("Enter a message first.");
      return;
    }
    if (!llmAvailability[selectedProvider]) {
      const keyName =
        selectedProvider === "openai"
          ? "OPENAI_API_KEY"
          : selectedProvider === "gemini"
            ? "GEMINI_API_KEY"
            : "PERPLEXITY_API_KEY";
      setStatus(
        `Missing ${keyName}. Add it to your .env.local and restart the app before using ${selectedProvider}.`,
      );
      return;
    }

    setIsLoading(true);
    setIsAsking(true);
    setStatus("Asking...");

    try {
      const userMessage = message;
      setMessage("");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          sessionId: selectedSessionId || undefined,
          message: userMessage,
          provider: selectedProvider,
          model: selectedModel === "__custom__" ? customModel.trim() : selectedModel,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        sessionId?: string;
        chunksUsed?: number;
        reason?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Chat failed");
      }
      if (data.sessionId) {
        setSelectedSessionId(data.sessionId);
      }
      await loadSessions(selectedProjectId);
      await loadHistory(selectedProjectId, data.sessionId || selectedSessionId);
      if (data.reason === "no_indexed_chunks" || (data.chunksUsed ?? 0) === 0) {
        setStatus("No indexed context found for this project. Try Re-index Project first.");
      } else {
        setStatus(`Done. Retrieved ${data.chunksUsed} context chunks.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoading(false);
      setIsAsking(false);
    }
  }

  async function handleSaveFile() {
    if (!selectedProjectId || !selectedFilePath || !fileEditable) {
      return;
    }

    setIsLoading(true);
    setStatus("Saving file...");
    try {
      const res = await fetch("/api/files/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          filePath: selectedFilePath,
          content: fileContent,
        }),
      });
      const data = (await res.json()) as { error?: string; reindexed?: boolean; chunks?: number };
      if (!res.ok) {
        throw new Error(data.error || "Failed to save file");
      }
      setFileDirty(false);
      setStatus(
        data.reindexed
          ? `Saved and re-indexed (${data.chunks} chunks).`
          : "Saved. No indexing changes detected.",
      );
      await loadFiles(selectedProjectId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  function handleProviderChange(provider: LlmProvider) {
    setSelectedProvider(provider);
    setSelectedModel(MODEL_OPTIONS[provider][0]);
    setCustomModel("");
  }

  useEffect(() => {
    const storedProvider = localStorage.getItem("llm_provider") as LlmProvider | null;
    const storedModel = localStorage.getItem("llm_model");
    const storedCustom = localStorage.getItem("llm_custom_model");

    if (storedProvider && MODEL_OPTIONS[storedProvider]) {
      setSelectedProvider(storedProvider);
    }
    if (storedModel) {
      setSelectedModel(storedModel);
    }
    if (storedCustom) {
      setCustomModel(storedCustom);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("llm_provider", selectedProvider);
    localStorage.setItem("llm_model", selectedModel);
    localStorage.setItem("llm_custom_model", customModel);
  }, [selectedProvider, selectedModel, customModel]);

  useEffect(() => {
    if (!isModelSwitcherOpen) {
      setIsProviderDropdownOpen(false);
    }
  }, [isModelSwitcherOpen]);

  useEffect(() => {
    if (!isIndexing || !indexJobId || !indexingProjectId) {
      return;
    }
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/index?jobId=${encodeURIComponent(indexJobId)}`);
      const data = (await res.json()) as { error?: string; job?: IndexJob };
      if (!res.ok || !data.job) {
        setStatus(data.error || "Failed to fetch indexing progress");
        setIsIndexing(false);
        return;
      }

      setIndexJob(data.job);
      if (data.job.status === "completed") {
        setIsIndexing(false);
        setStatus(
          `Indexed. scanned=${data.job.scannedFiles} changed=${data.job.changedFiles} skipped=${data.job.skippedFiles} chunks=${data.job.indexedChunks}`,
        );
        await loadFiles(indexingProjectId);
      } else if (data.job.status === "failed") {
        setIsIndexing(false);
        setStatus(data.job.error || "Indexing failed");
      }
    }, 900);

    return () => window.clearInterval(timer);
  }, [isIndexing, indexJobId, indexingProjectId, loadFiles]);

  return (
    <main className="h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid h-full min-h-0 grid-cols-[320px_1fr] gap-4 p-4">
        <aside className="flex h-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h1 className="text-xl font-semibold">Local Wikis</h1>

          <section className="space-y-2">
            <button
              className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              type="button"
              onClick={() => setIsCreateProjectModalOpen(true)}
            >
              + New Project
            </button>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Projects
            </h2>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {projects.map((project) => {
                const active = project.id === selectedProjectId;
                return (
                  <div
                    key={project.id}
                    className={`flex items-start gap-2 rounded-lg border px-2 py-2 text-sm transition ${active
                      ? "border-emerald-600 bg-emerald-900/30"
                      : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                      }`}
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setSelectedProjectId(project.id)}
                      type="button"
                    >
                      <p className="font-medium">{project.name}</p>
                      <p className="truncate text-xs text-zinc-400">{project.folderPath}</p>
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteProject(project.id, project.name);
                      }}
                      title="Delete project"
                      aria-label="Delete project"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                        <path d="M9 3.75A2.25 2.25 0 0 1 11.25 1.5h1.5A2.25 2.25 0 0 1 15 3.75V4.5h4.5a.75.75 0 0 1 0 1.5h-1.03l-.68 13.03A2.25 2.25 0 0 1 15.55 21H8.45a2.25 2.25 0 0 1-2.24-1.97L5.53 6H4.5a.75.75 0 0 1 0-1.5H9v-.75ZM13.5 4.5v-.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4.5h3Zm-4.27 3.22a.75.75 0 0 1 .75.71l.33 8.25a.75.75 0 1 1-1.5.06l-.33-8.25a.75.75 0 0 1 .71-.77h.04Zm5.54 0a.75.75 0 0 1 .71.77l-.33 8.25a.75.75 0 1 1-1.5-.06l.33-8.25a.75.75 0 0 1 .75-.71h.04Z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Chats
              </h2>
              <button
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                type="button"
                onClick={handleCreateChatSession}
                disabled={isLoading || !selectedProject}
              >
                New
              </button>
            </div>
            <div className="space-y-1 overflow-y-auto pr-1">
              {chatSessions.length === 0 && (
                <p className="text-xs text-zinc-500">No chats yet.</p>
              )}
              {chatSessions.map((session) => {
                const active = session.id === selectedSessionId;
                return (
                  <div
                    key={session.id}
                    className={`flex items-start gap-2 rounded-lg border p-2 text-xs transition ${active
                      ? "border-emerald-600 bg-emerald-900/25"
                      : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate font-medium text-zinc-200">{session.title}</p>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {new Date(session.updatedAt).toLocaleString()}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteChatSession(session.id);
                      }}
                      title="Delete chat"
                      aria-label="Delete chat"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                        <path d="M9 3.75A2.25 2.25 0 0 1 11.25 1.5h1.5A2.25 2.25 0 0 1 15 3.75V4.5h4.5a.75.75 0 0 1 0 1.5h-1.03l-.68 13.03A2.25 2.25 0 0 1 15.55 21H8.45a2.25 2.25 0 0 1-2.24-1.97L5.53 6H4.5a.75.75 0 0 1 0-1.5H9v-.75ZM13.5 4.5v-.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4.5h3Zm-4.27 3.22a.75.75 0 0 1 .75.71l.33 8.25a.75.75 0 1 1-1.5.06l-.33-8.25a.75.75 0 0 1 .71-.77h.04Zm5.54 0a.75.75 0 0 1 .71.77l-.33 8.25a.75.75 0 1 1-1.5-.06l.33-8.25a.75.75 0 0 1 .75-.71h.04Z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Files
            </h2>
            <p className="text-xs text-zinc-500">
              {selectedProject ? `${projectFiles.length} supported files` : "Select a project"}
            </p>
          </section>
        </aside>

        <section className="flex h-full min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">
                {selectedProject ? selectedProject.name : "Select a project"}
              </h2>
              <p className="text-sm text-zinc-400">
                {selectedProject
                  ? `${selectedProject.folderPaths.length} folder(s) indexed`
                  : "No project selected"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-600 disabled:opacity-60"
                onClick={handleIndexProject}
                disabled={isLoading || !selectedProject}
                type="button"
              >
                Re-index Project
              </button>
              <button
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
                onClick={handleAddFolderToProject}
                disabled={isLoading || !selectedProject}
                type="button"
              >
                Add Folder
              </button>
              <button
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
                onClick={() => setIsModelSwitcherOpen((prev) => !prev)}
                type="button"
              >
                {selectedProvider.toUpperCase()} -{" "}
                {selectedModel === "__custom__" ? customModel || "custom model" : selectedModel}
              </button>
            </div>
          </div>

          {isModelSwitcherOpen && (
            <div className="grid gap-4 border-b border-zinc-800 bg-zinc-900/60 px-5 py-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Provider
                </p>
                <div className="relative">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                    onClick={() => setIsProviderDropdownOpen((prev) => !prev)}
                  >
                    <span>{selectedProvider.toUpperCase()}</span>
                    <span className="text-zinc-500">v</span>
                  </button>
                  {isProviderDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
                      {(["openai", "gemini", "perplexity"] as LlmProvider[]).map((provider) => (
                        <button
                          key={provider}
                          type="button"
                          title={`Available: ${MODEL_OPTIONS[provider].join(", ")}`}
                          className={`w-full rounded-md px-3 py-2 text-left text-xs ${selectedProvider === provider
                            ? "bg-emerald-900/40 text-emerald-200"
                            : "text-zinc-300 hover:bg-zinc-800"
                            }`}
                          onClick={() => {
                            handleProviderChange(provider);
                            setIsProviderDropdownOpen(false);
                          }}
                        >
                          <p className="font-medium">{provider.toUpperCase()}</p>
                          <p className="truncate text-[10px] text-zinc-500">
                            {MODEL_OPTIONS[provider].join(", ")}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Model
                </p>
                <select
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                >
                  {MODEL_OPTIONS[selectedProvider].map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                  <option value="__custom__">Custom model...</option>
                </select>
                {selectedModel === "__custom__" && (
                  <input
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
                    placeholder="Enter custom model id"
                    value={customModel}
                    onChange={(event) => setCustomModel(event.target.value)}
                  />
                )}
                <p className="text-xs text-zinc-400">
                  API keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`
                </p>
                {!llmAvailability[selectedProvider] && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-900/20 px-2 py-1 text-xs text-amber-300">
                    Missing key for {selectedProvider}. Add it to `.env.local` and restart.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
            <button
              className={`rounded-lg px-3 py-1.5 text-sm ${activeView === "chat"
                ? "bg-emerald-700 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              onClick={() => setActiveView("chat")}
              type="button"
            >
              Chat
            </button>
            <button
              className={`rounded-lg px-3 py-1.5 text-sm ${activeView === "files"
                ? "bg-emerald-700 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              onClick={() => setActiveView("files")}
              type="button"
            >
              Files
            </button>
          </div>
          {status && (
            <div className="border-b border-zinc-800 px-5 py-2 text-xs text-zinc-400">
              {status}
            </div>
          )}

          {activeView === "chat" ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {selectedSession && (
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Chat: {selectedSession.title}
                  </p>
                )}
                {chatHistory.length === 0 && (
                  <p className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
                    Ask a question to start the project conversation.
                  </p>
                )}
                {chatHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${item.role === "user"
                      ? "ml-auto bg-emerald-800/60 text-zinc-100"
                      : "bg-zinc-800 text-zinc-100"
                      }`}
                  >
                    {item.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 whitespace-pre-wrap">{children}</p>,
                          ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                          code: ({ children }) => (
                            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs">{children}</code>
                          ),
                          pre: ({ children }) => (
                            <pre className="mb-2 overflow-x-auto rounded-md bg-zinc-900 p-3 text-xs">
                              {children}
                            </pre>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-300 underline"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {item.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="mb-2 whitespace-pre-wrap">{item.content}</p>
                    )}
                    {item.role === "assistant" && item.sources.length > 0 && (
                      <p className="text-xs text-zinc-300">
                        Sources: {item.sources.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
                {isAsking && (
                  <div className="max-w-[90%] rounded-xl bg-zinc-800 px-4 py-3 text-sm text-zinc-200">
                    <p className="mb-2 text-zinc-300">Thinking...</p>
                    <div className="space-y-2">
                      <div className="h-2 w-5/6 animate-pulse rounded bg-zinc-700" />
                      <div className="h-2 w-2/3 animate-pulse rounded bg-zinc-700" />
                      <div className="h-2 w-3/4 animate-pulse rounded bg-zinc-700" />
                    </div>
                  </div>
                )}
              </div>

              <form className="border-t border-zinc-800 p-4" onSubmit={handleAsk} ref={chatFormRef}>
                <div className="flex items-end gap-3 rounded-3xl border border-zinc-700 bg-zinc-950 px-3 py-2">
                  <textarea
                    className="min-h-12 max-h-40 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        if (!isLoading && selectedProject && message.trim()) {
                          chatFormRef.current?.requestSubmit();
                        }
                      }
                    }}
                    placeholder="Ask a question about your indexed files..."
                  />
                  <button
                    className="grid h-10 w-10 place-items-center rounded-full bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-60"
                    type="submit"
                    disabled={isLoading || !selectedProject || !message.trim()}
                    aria-label="Send message"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M3.4 20.6 21.2 13a1 1 0 0 0 0-1.8L3.4 3.4a.8.8 0 0 0-1.1 1l2.5 7.3a.8.8 0 0 0 .75.54h7.4a.75.75 0 0 1 0 1.5H5.55a.8.8 0 0 0-.75.54L2.3 21.6a.8.8 0 0 0 1.1 1Z" />
                    </svg>
                  </button>
                </div>
                <p className="mt-2 px-2 text-[11px] text-zinc-500">
                  Enter to send, Shift+Enter for a new line.
                </p>
              </form>
            </>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr]">
              <div className="min-h-0 border-r border-zinc-800 p-3">
                <div className="h-full space-y-1 overflow-y-auto">
                  {projectFiles.length === 0 && (
                    <p className="text-xs text-zinc-500">No supported files found.</p>
                  )}
                  {projectFiles.map((file) => {
                    const active = file.relativePath === selectedFilePath;
                    return (
                      <button
                        key={file.relativePath}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${active
                          ? "border-emerald-600 bg-emerald-900/25"
                          : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                          }`}
                        onClick={() => setSelectedFilePath(file.relativePath)}
                        type="button"
                      >
                        <p className="truncate">{file.relativePath}</p>
                        <p className="text-xs text-zinc-400">
                          {file.editable ? "Editable" : "Read-only"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
                  <p className="truncate text-sm text-zinc-300">
                    {selectedFile?.relativePath || "Select a file"}
                  </p>
                  <button
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600 disabled:opacity-60"
                    type="button"
                    onClick={handleSaveFile}
                    disabled={!fileEditable || !fileDirty || isLoading || !selectedFile}
                  >
                    Save
                  </button>
                </div>
                {isFileLoading ? (
                  <p className="p-4 text-sm text-zinc-400">Loading file...</p>
                ) : selectedFile?.extension === ".pdf" ? (
                  pdfViewerUrl ? (
                    <iframe
                      className="h-full w-full bg-white"
                      src={pdfViewerUrl}
                      title={selectedFile.relativePath}
                    />
                  ) : (
                    <p className="p-4 text-sm text-zinc-400">Preparing PDF viewer...</p>
                  )
                ) : selectedFile?.extension === ".xlsx" ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 px-3 py-2">
                      {spreadsheetSheets.map((sheet, index) => (
                        <button
                          key={sheet.name}
                          className={`rounded-md px-3 py-1 text-xs ${index === activeSheetIndex
                            ? "bg-emerald-700 text-white"
                            : "bg-zinc-800 text-zinc-300"
                            }`}
                          onClick={() => setActiveSheetIndex(index)}
                          type="button"
                        >
                          {sheet.name}
                        </button>
                      ))}
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      {activeSheet ? (
                        <table className="min-w-full border-collapse text-xs">
                          <tbody>
                            {activeSheet.rows.map((row, rowIndex) => (
                              <tr key={`${activeSheet.name}-${rowIndex}`}>
                                {row.map((cell, cellIndex) => (
                                  <td
                                    key={`${activeSheet.name}-${rowIndex}-${cellIndex}`}
                                    className="border border-zinc-800 px-2 py-1 align-top"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="p-4 text-sm text-zinc-400">No sheets found in workbook.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="h-full w-full resize-none bg-zinc-950 p-4 font-mono text-sm text-zinc-100 outline-none"
                    value={fileContent}
                    onChange={(event) => {
                      setFileContent(event.target.value);
                      setFileDirty(true);
                    }}
                    readOnly={!fileEditable}
                    placeholder={
                      selectedFile
                        ? fileEditable
                          ? "Edit file content..."
                          : "This file type is read-only here."
                        : "Select a file to preview."
                    }
                  />
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {isCreateProjectModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Create Project</h3>
                <p className="text-sm text-zinc-400">
                  Add a name, choose a folder, and optionally index immediately.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                onClick={() => setIsCreateProjectModalOpen(false)}
              >
                Close
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleCreateProject}>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
                placeholder="Project name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <textarea
                className="min-h-24 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
                placeholder="One folder path per line"
                value={folderPath}
                onChange={(event) => setFolderPath(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
                  type="button"
                  onClick={handlePickFolder}
                >
                  Pick Folder(s)
                </button>
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={createShouldIndex}
                    onChange={(event) => setCreateShouldIndex(event.target.checked)}
                  />
                  Index right after create
                </label>
              </div>
              {!hasElectronPicker && (
                <p className="text-xs text-amber-400">
                  Electron not detected here. Paste an absolute path or open Electron window.
                </p>
              )}
              {hasElectronPicker && (
                <p className="text-xs text-zinc-500">
                  You can multi-select folders or files; files are mapped to their parent folder.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  onClick={() => setIsCreateProjectModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
                  disabled={isLoading || !projectName.trim() || !folderPath.trim()}
                >
                  {createShouldIndex ? "Create & Index" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isIndexing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <p className="text-lg font-semibold text-zinc-100">Indexing project</p>
            <p className="mt-1 text-sm text-zinc-400">{indexJob?.stage || "Preparing..."}</p>
            {indexJob?.currentFile && (
              <p className="mt-1 truncate text-xs text-zinc-500" title={indexJob.currentFile}>
                File: {indexJob.currentFile}
              </p>
            )}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{
                  width: `${indexJob && indexJob.scannedFiles > 0
                    ? Math.max(
                      8,
                      Math.round((indexJob.processedFiles / indexJob.scannedFiles) * 100),
                    )
                    : 15
                    }%`,
                }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
              <p>Processed: {indexJob?.processedFiles ?? 0}</p>
              <p>Total: {indexJob?.scannedFiles ?? 0}</p>
              <p>Changed: {indexJob?.changedFiles ?? 0}</p>
              <p>Chunks: {indexJob?.indexedChunks ?? 0}</p>
            </div>
            {indexJob && indexJob.currentFileChunkTotal > 0 && (
              <p className="mt-2 text-xs text-zinc-400">
                Current file chunks: {indexJob.currentFileChunkIndex}/{indexJob.currentFileChunkTotal}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <span className="inline-block h-2 w-2 animate-ping rounded-full bg-emerald-500" />
              <span>Indexing your files. Please wait...</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
