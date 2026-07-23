"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Columns3,
  FileUp,
  GripVertical,
  LayoutDashboard,
  LoaderCircle,
  Mail,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { logout } from "@/app/login/actions";
import { type FormEvent, type DragEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  advancePlacement,
  createCandidate,
  createClient,
  createJobOrder,
  createPlacement,
  createRecruitmentTask,
  deleteCandidate,
  deleteClient,
  deleteJobOrder,
  deletePlacement,
  deleteRecruitmentTask,
  loadRecruitmentSampleData,
  movePlacement,
  resetRecruitmentWorkspace,
  setRecruitmentTaskCompleted,
  updateCandidate,
  updateClient,
  updateJobOrder,
  updateJobOrderStatus,
} from "./actions";
import { parseCvFile } from "./cv-actions";
import type { ParsedCvFields } from "@/lib/cv-parser";
import {
  type CandidateView,
  type ClientView,
  type JobOrderView,
  type PlacementView,
  computeRecruitmentMetrics,
  feeByMonth,
  feeForSalary,
  guaranteeDaysRemaining,
  initialsFromName,
  percentDelta,
  pickPriorityPlacement,
  pipelineStages,
  priorityReason,
  relativeLabel,
} from "@/lib/recruitment-metrics";

type TaskView = {
  id: number;
  title: string;
  relatedLabel: string;
  type: string;
  dueLabel: string;
  completed: boolean;
};

type SnapshotView = {
  day: string;
  activePipelineValue: number;
  placementsThisMonth: number;
  openJobOrders: number;
  avgTimeToFillDays: number | null;
} | null;

type ViewName = "Overview" | "Pipeline" | "Candidates" | "Clients & Roles" | "Activities" | "Reports";

type DashboardProps = {
  clients: ClientView[];
  candidates: CandidateView[];
  jobOrders: JobOrderView[];
  placements: PlacementView[];
  tasks: TaskView[];
  previousSnapshot: SnapshotView;
};

const navItems: Array<{ label: ViewName; icon: LucideIcon }> = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Pipeline", icon: Columns3 },
  { label: "Candidates", icon: Users },
  { label: "Clients & Roles", icon: Briefcase },
  { label: "Activities", icon: CalendarDays },
  { label: "Reports", icon: BarChart3 },
];

const avatarColors = [
  "bg-[#dfe7ff] text-[#4359a7]",
  "bg-[#f9e6d1] text-[#9a5a25]",
  "bg-[#dff3e9] text-[#26745a]",
  "bg-[#f0e2f7] text-[#774694]",
];

function money(value: number, compact = false) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    currencyDisplay: "code",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
}

function formatDelta(value: number | null) {
  if (value === null) return { label: "New", positive: true, isNew: true };
  const rounded = Math.round(value * 10) / 10;
  return { label: `${Math.abs(rounded)}%`, positive: rounded >= 0, isNew: false };
}

export default function RecruitmentDashboard({
  clients,
  candidates,
  jobOrders,
  placements,
  tasks,
  previousSnapshot,
}: DashboardProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const profileContainerRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<ViewName>("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [jobOrderModalOpen, setJobOrderModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<CandidateView | null>(null);
  const [candidateDraft, setCandidateDraft] = useState<Partial<CandidateView> | null>(null);
  const [importCvOpen, setImportCvOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientView | null>(null);
  const [editingJobOrder, setEditingJobOrder] = useState<JobOrderView | null>(null);
  const [addToPipelineFor, setAddToPipelineFor] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localPlacements, setLocalPlacements] = useState(placements);
  const [localTasks, setLocalTasks] = useState(tasks);
  const [isPending, startTransition] = useTransition();

  const [syncedPlacements, setSyncedPlacements] = useState(placements);
  if (syncedPlacements !== placements) {
    setSyncedPlacements(placements);
    setLocalPlacements(placements);
  }
  const [syncedTasks, setSyncedTasks] = useState(tasks);
  if (syncedTasks !== tasks) {
    setSyncedTasks(tasks);
    setLocalTasks(tasks);
  }

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (searchOpen && searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (profileOpen && profileContainerRef.current && !profileContainerRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [searchOpen, profileOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const candidateMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const jobOrderMap = useMemo(() => new Map(jobOrders.map((jo) => [jo.id, jo])), [jobOrders]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const metrics = useMemo(() => computeRecruitmentMetrics(localPlacements, jobOrders), [localPlacements, jobOrders]);
  const deltas = useMemo(
    () => ({
      activePipelineValue: percentDelta(metrics.activePipelineValue, previousSnapshot?.activePipelineValue),
      placementsThisMonth: percentDelta(metrics.placementsThisMonth, previousSnapshot?.placementsThisMonth),
      openJobOrders: percentDelta(metrics.openJobOrders, previousSnapshot?.openJobOrders),
      avgTimeToFillDays: percentDelta(metrics.avgTimeToFillDays ?? 0, previousSnapshot?.avgTimeToFillDays),
    }),
    [metrics, previousSnapshot],
  );

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return { candidates: [] as CandidateView[], jobOrders: [] as JobOrderView[], clients: [] as ClientView[] };
    return {
      candidates: candidates.filter((c) => `${c.name} ${c.currentTitle} ${c.location}`.toLowerCase().includes(normalized)).slice(0, 4),
      jobOrders: jobOrders.filter((jo) => `${jo.title} ${clientMap.get(jo.clientId)?.name ?? ""}`.toLowerCase().includes(normalized)).slice(0, 3),
      clients: clients.filter((c) => `${c.name} ${c.industry}`.toLowerCase().includes(normalized)).slice(0, 3),
    };
  }, [query, candidates, jobOrders, clients, clientMap]);

  function changeView(view: ViewName) {
    setActiveView(view);
    setSidebarOpen(false);
    setQuery("");
    setSearchOpen(false);
  }

  function handleMove(placementId: number, stage: string, agreedSalary?: number) {
    const previous = localPlacements;
    const now = new Date().toISOString();
    setLocalPlacements((current) =>
      current.map((p) => (p.id === placementId ? { ...p, stage: stage as PlacementView["stage"], lastActivityAt: now } : p)),
    );
    startTransition(async () => {
      const result = await movePlacement(placementId, stage, agreedSalary);
      if (!result.ok) {
        setLocalPlacements(previous);
        setToast("Could not move this candidate. Try again.");
      } else {
        setToast(`Moved to ${pipelineStages.find((s) => s.key === stage)?.label ?? stage}.`);
        router.refresh();
      }
    });
  }

  function handleAdvance(placementId: number) {
    startTransition(async () => {
      const result = await advancePlacement(placementId);
      if (result.ok) {
        setToast("Candidate advanced to the next stage.");
        router.refresh();
      } else {
        setToast("Could not advance this candidate.");
      }
    });
  }

  function handleDeletePlacement(placementId: number) {
    if (!window.confirm("Remove this candidate from the pipeline?")) return;
    const previous = localPlacements;
    setLocalPlacements((current) => current.filter((p) => p.id !== placementId));
    startTransition(async () => {
      const result = await deletePlacement(placementId);
      if (!result.ok) {
        setLocalPlacements(previous);
        setToast("Could not remove this candidate. Try again.");
      } else {
        setToast("Removed from pipeline.");
        router.refresh();
      }
    });
  }

  function handleTaskToggle(taskId: number, completed: boolean) {
    const previous = localTasks;
    setLocalTasks((current) => current.map((t) => (t.id === taskId ? { ...t, completed } : t)));
    startTransition(async () => {
      const result = await setRecruitmentTaskCompleted(taskId, completed);
      if (!result.ok) {
        setLocalTasks(previous);
        setToast("Task update failed.");
      } else {
        router.refresh();
      }
    });
  }

  function handleDeleteTask(taskId: number) {
    if (!window.confirm("Delete this activity?")) return;
    const previous = localTasks;
    setLocalTasks((current) => current.filter((t) => t.id !== taskId));
    startTransition(async () => {
      const result = await deleteRecruitmentTask(taskId);
      if (!result.ok) {
        setLocalTasks(previous);
        setToast("Could not delete this activity.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-[#1f2429]">
      {sidebarOpen && (
        <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-[#15181c]/30 backdrop-blur-[2px] lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col border-r border-[#e6e8eb] bg-white transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[72px] items-center justify-between border-b border-[#eef0f2] px-5">
          <button className="flex items-center gap-3" onClick={() => changeView("Overview")}>
            <span className="brand-mark"><span /><span /><span /></span>
            <span className="text-[19px] font-bold tracking-[-0.04em]">Northstar</span>
          </button>
          <button className="icon-button lg:hidden" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="px-4 pt-4">
          <WorkspaceSwitcher current="recruitment" />
        </div>

        <div className="px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a2a8af]">Navigate</p>
          <nav className="space-y-1">
            {navItems.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => changeView(label)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activeView === label ? "bg-[#eef6f2] text-[#17785a]" : "text-[#687078] hover:bg-[#f5f6f7] hover:text-[#252a2f]"}`}
              >
                <Icon size={18} strokeWidth={activeView === label ? 2.3 : 1.8} />
                <span>{label}</span>
                {label === "Activities" && (
                  <span className="ml-auto rounded-md bg-[#f1d7c7] px-1.5 py-0.5 text-[10px] font-bold text-[#9b4d24]">
                    {localTasks.filter((t) => !t.completed).length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="mx-4 border-t border-[#eef0f2] pt-5">
          <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a2a8af]">This month</p>
          <div className="rounded-2xl bg-[#f7f7f4] p-3.5">
            <div className="mb-2.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-[#555c62]">Placements</span>
              <span className="font-bold text-[#20262a]">{metrics.placementsThisMonth} / 4 goal</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#e4e6e2]">
              <div className="h-full rounded-full bg-[#1d9a70]" style={{ width: `${Math.min(100, Math.round((metrics.placementsThisMonth / 4) * 100))}%` }} />
            </div>
            <p className="mt-2.5 text-[11px] leading-4 text-[#858b91]">{money(metrics.totalFeesEarned, true)} in fees earned</p>
          </div>
        </div>

        <div className="mt-auto border-t border-[#eef0f2] p-3">
          <button onClick={() => setSettingsOpen(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#687078] hover:bg-[#f5f6f7] hover:text-[#252a2f]">
            <Settings2 size={18} /> Settings
          </button>
          <div className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#252b2f] text-xs font-bold text-white">AM</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Alex Morgan</p>
              <p className="truncate text-[11px] text-[#8e949a]">Recruiter</p>
            </div>
            <MoreHorizontal size={17} className="text-[#989ea4]" />
          </div>
        </div>
      </aside>

      <div className="lg:pl-[236px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-[#e6e8eb] bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button className="icon-button mr-2 lg:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <div ref={searchContainerRef} className="relative w-full max-w-[420px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#858c92]" size={17} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search candidates, roles, clients..."
              className="h-10 w-full rounded-xl border border-transparent bg-[#f4f5f6] pl-10 pr-4 text-sm outline-none transition placeholder:text-[#9da3a8] focus:border-[#cfe3da] focus:bg-white focus:shadow-[0_0_0_3px_rgba(29,154,112,0.08)]"
            />
            {searchOpen && query.trim() && (
              <RecruitmentSearchResults
                query={query}
                candidates={results.candidates}
                jobOrders={results.jobOrders}
                clients={results.clients}
                clientMap={clientMap}
                onClose={() => setSearchOpen(false)}
                onNavigate={changeView}
              />
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button onClick={() => setImportCvOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border border-[#dfe2e4] bg-white px-3.5 text-sm font-bold text-[#454c51] transition hover:border-[#8fc7ae] hover:text-[#17805e]">
              <FileUp size={16} />
              <span className="hidden sm:inline">Import CV</span>
            </button>
            <button onClick={() => setCandidateModalOpen(true)} className="flex h-10 items-center gap-2 rounded-xl bg-[#1c8e68] px-3.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(28,142,104,0.18)] transition hover:-translate-y-0.5 hover:bg-[#177b5a] sm:px-4">
              <Plus size={17} strokeWidth={2.5} />
              <span className="hidden sm:inline">Add candidate</span>
            </button>
            <div ref={profileContainerRef} className="relative">
              <button onClick={() => setProfileOpen((v) => !v)} className="ml-0.5 flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-[#f4f5f6]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#efe4d8] text-[11px] font-extrabold text-[#795434]">AM</span>
                <ChevronDown size={14} className="hidden text-[#8c9298] sm:block" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-[#e1e3e5] bg-white p-2 shadow-[0_18px_50px_rgba(30,36,40,0.14)] animate-pop-in">
                  <div className="border-b border-[#eceeef] px-2 py-2.5">
                    <p className="text-xs font-bold">Alex Morgan</p>
                    <p className="mt-0.5 text-[10px] text-[#92989d]">alex@northstar.co</p>
                  </div>
                  <button onClick={() => { setProfileOpen(false); setSettingsOpen(true); }} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs font-semibold text-[#626a70] hover:bg-[#f5f6f7]">
                    <Settings2 size={15} /> Account settings
                  </button>
                  <form action={logout}>
                    <button type="submit" className="mt-1 w-full border-t border-[#eceeef] px-2 pt-3 pb-1 text-left text-xs font-semibold text-[#b24d41]">Sign out</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-72px)] p-4 sm:p-6 lg:p-8">
          {activeView === "Overview" && (
            <Overview
              placements={localPlacements}
              jobOrders={jobOrders}
              candidateMap={candidateMap}
              jobOrderMap={jobOrderMap}
              clientMap={clientMap}
              tasks={localTasks}
              metrics={metrics}
              deltas={deltas}
              isEmpty={clients.length === 0 && candidates.length === 0}
              onViewChange={changeView}
              onTaskToggle={handleTaskToggle}
              onAdvance={handleAdvance}
              onAddCandidate={() => setCandidateModalOpen(true)}
              onLoadSample={() => {
                startTransition(async () => {
                  const result = await loadRecruitmentSampleData();
                  setToast(result.message ?? "Done.");
                  router.refresh();
                });
              }}
            />
          )}
          {activeView === "Pipeline" && (
            <PipelineView
              placements={localPlacements}
              candidateMap={candidateMap}
              jobOrderMap={jobOrderMap}
              clientMap={clientMap}
              onMove={handleMove}
              onDelete={handleDeletePlacement}
              onAddToPipeline={() => setAddToPipelineFor(-1)}
            />
          )}
          {activeView === "Candidates" && (
            <CandidatesView
              candidates={candidates}
              placements={localPlacements}
              jobOrderMap={jobOrderMap}
              onAdd={() => setCandidateModalOpen(true)}
              onEdit={setEditingCandidate}
              onDelete={(id) => {
                if (!window.confirm("Delete this candidate?")) return;
                startTransition(async () => {
                  const result = await deleteCandidate(id);
                  setToast(result.ok ? "Candidate deleted." : "Could not delete candidate.");
                  router.refresh();
                });
              }}
              onAddToPipeline={(candidateId) => setAddToPipelineFor(candidateId)}
            />
          )}
          {activeView === "Clients & Roles" && (
            <ClientsView
              clients={clients}
              jobOrders={jobOrders}
              onAddClient={() => setClientModalOpen(true)}
              onAddJobOrder={() => setJobOrderModalOpen(true)}
              onEditClient={setEditingClient}
              onEditJobOrder={setEditingJobOrder}
              onDeleteClient={(id) => {
                if (!window.confirm("Delete this client and its job orders?")) return;
                startTransition(async () => {
                  const result = await deleteClient(id);
                  setToast(result.ok ? "Client deleted." : "Could not delete client.");
                  router.refresh();
                });
              }}
              onDeleteJobOrder={(id) => {
                if (!window.confirm("Delete this job order?")) return;
                startTransition(async () => {
                  const result = await deleteJobOrder(id);
                  setToast(result.ok ? "Job order deleted." : "Could not delete job order.");
                  router.refresh();
                });
              }}
              onStatusChange={(id, status) => {
                startTransition(async () => {
                  await updateJobOrderStatus(id, status);
                  router.refresh();
                });
              }}
            />
          )}
          {activeView === "Activities" && (
            <ActivitiesView tasks={localTasks} onTaskToggle={handleTaskToggle} onSchedule={() => setTaskModalOpen(true)} onDelete={handleDeleteTask} />
          )}
          {activeView === "Reports" && <ReportsView placements={localPlacements} jobOrders={jobOrders} metrics={metrics} />}
        </main>
      </div>

      {(candidateModalOpen || editingCandidate || candidateDraft) && (
        <CreateCandidateModal
          editingCandidate={editingCandidate}
          prefill={candidateDraft}
          onClose={() => { setCandidateModalOpen(false); setEditingCandidate(null); setCandidateDraft(null); }}
          onSuccess={(m) => { setCandidateModalOpen(false); setEditingCandidate(null); setCandidateDraft(null); setToast(m); router.refresh(); }}
        />
      )}
      {importCvOpen && (
        <ImportCvModal
          onClose={() => setImportCvOpen(false)}
          onParsed={(fields) => {
            setImportCvOpen(false);
            setCandidateDraft(fields);
          }}
        />
      )}
      {(clientModalOpen || editingClient) && (
        <CreateClientModal
          editingClient={editingClient}
          onClose={() => { setClientModalOpen(false); setEditingClient(null); }}
          onSuccess={(m) => { setClientModalOpen(false); setEditingClient(null); setToast(m); router.refresh(); }}
        />
      )}
      {(jobOrderModalOpen || editingJobOrder) && (
        <CreateJobOrderModal
          clients={clients}
          editingJobOrder={editingJobOrder}
          onClose={() => { setJobOrderModalOpen(false); setEditingJobOrder(null); }}
          onSuccess={(m) => { setJobOrderModalOpen(false); setEditingJobOrder(null); setToast(m); router.refresh(); }}
        />
      )}
      {taskModalOpen && (
        <CreateTaskModal onClose={() => setTaskModalOpen(false)} onSuccess={(m) => { setTaskModalOpen(false); setToast(m); router.refresh(); }} />
      )}
      {addToPipelineFor !== null && (
        <AddToPipelineModal
          candidates={candidates}
          jobOrders={jobOrders}
          clientMap={clientMap}
          defaultCandidateId={addToPipelineFor > 0 ? addToPipelineFor : undefined}
          onClose={() => setAddToPipelineFor(null)}
          onSuccess={(m) => { setAddToPipelineFor(null); setToast(m); router.refresh(); }}
        />
      )}
      {settingsOpen && (
        <RecruitmentSettingsPanel
          hasData={clients.length > 0 || candidates.length > 0}
          onClose={() => setSettingsOpen(false)}
          onLoadSample={() => {
            startTransition(async () => {
              const result = await loadRecruitmentSampleData();
              setSettingsOpen(false);
              setToast(result.message ?? "Done.");
              router.refresh();
            });
          }}
          onReset={() => {
            startTransition(async () => {
              const result = await resetRecruitmentWorkspace();
              setSettingsOpen(false);
              setToast(result.message ?? "Done.");
              router.refresh();
            });
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2.5 rounded-xl bg-[#20262a] px-4 py-3 text-sm font-semibold text-white shadow-2xl animate-toast-in">
          <CheckCircle2 size={17} className="text-[#62d2a7]" />
          {toast}
        </div>
      )}
      {isPending && <span className="sr-only">Saving changes</span>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#1c8e68]">{eyebrow}</p>}
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.04em] text-[#202529] sm:text-[32px]">{title}</h1>
        <p className="mt-1.5 text-sm text-[#7a8187]">{description}</p>
      </div>
      {action}
    </div>
  );
}

type CoreMetrics = ReturnType<typeof computeRecruitmentMetrics>;
type Deltas = { activePipelineValue: number | null; placementsThisMonth: number | null; openJobOrders: number | null; avgTimeToFillDays: number | null };

function Overview({
  placements,
  jobOrders,
  candidateMap,
  jobOrderMap,
  clientMap,
  tasks,
  metrics,
  deltas,
  isEmpty,
  onViewChange,
  onTaskToggle,
  onAdvance,
  onAddCandidate,
  onLoadSample,
}: {
  placements: PlacementView[];
  jobOrders: JobOrderView[];
  candidateMap: Map<number, CandidateView>;
  jobOrderMap: Map<number, JobOrderView>;
  clientMap: Map<number, ClientView>;
  tasks: TaskView[];
  metrics: CoreMetrics;
  deltas: Deltas;
  isEmpty: boolean;
  onViewChange: (view: ViewName) => void;
  onTaskToggle: (id: number, completed: boolean) => void;
  onAdvance: (id: number) => void;
  onAddCandidate: () => void;
  onLoadSample: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1480px] animate-page-in">
      {isEmpty && (
        <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-[#cfe7db] bg-[#eef8f3] p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#18805e]"><Sparkles size={18} /></span>
            <div>
              <p className="text-sm font-bold text-[#1c4c39]">Your desk is empty</p>
              <p className="mt-0.5 text-xs text-[#3f6b57]">Load a sample desk (clients, candidates, an active pipeline) to explore every feature, or start adding your own.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={onLoadSample} className="secondary-button">Load sample data</button>
            <button onClick={onAddCandidate} className="primary-button"><Plus size={16} /> Add my first candidate</button>
          </div>
        </div>
      )}
      <PageHeading title="Good morning, Alex" description={`${todayLabel()} · Here's what needs your attention across the desk.`} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active pipeline value" value={money(metrics.activePipelineValue, true)} delta={deltas.activePipelineValue} note="Projected fees across open placements" icon={Target} accent="green" />
        <MetricCard label="Placements this month" value={`${metrics.placementsThisMonth}`} delta={deltas.placementsThisMonth} note="Toward a monthly goal of 4" icon={ShieldCheck} accent="violet" />
        <MetricCard label="Open job orders" value={`${metrics.openJobOrders}`} delta={deltas.openJobOrders} note={`${jobOrders.length} total roles tracked`} icon={Briefcase} accent="amber" />
        <MetricCard label="Avg. time to fill" value={metrics.avgTimeToFillDays !== null ? `${Math.round(metrics.avgTimeToFillDays)}d` : "—"} delta={deltas.avgTimeToFillDays} note={metrics.avgTimeToFillDays !== null ? "Job opened to candidate placed" : "No completed placements yet"} icon={Clock3} accent="blue" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.75fr)]">
        <FeeChart placements={placements} />
        <PriorityCard placements={placements} jobOrders={jobOrders} candidateMap={candidateMap} jobOrderMap={jobOrderMap} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.75fr)]">
        <PipelineSnapshot placements={placements} candidateMap={candidateMap} jobOrderMap={jobOrderMap} clientMap={clientMap} onView={() => onViewChange("Pipeline")} onAdvance={onAdvance} />
        <TasksCard tasks={tasks} onView={() => onViewChange("Activities")} onTaskToggle={onTaskToggle} />
      </section>
    </div>
  );
}

function MetricCard({ label, value, delta, note, icon: Icon, accent }: { label: string; value: string; delta: number | null; note: string; icon: LucideIcon; accent: "green" | "violet" | "amber" | "blue" }) {
  const styles = {
    green: "bg-[#e6f4ee] text-[#187a59]",
    violet: "bg-[#eee9fb] text-[#6f50b5]",
    amber: "bg-[#fbefdc] text-[#a66c18]",
    blue: "bg-[#e6eef8] text-[#426a97]",
  };
  const parsed = formatDelta(delta);
  return (
    <article className="surface group p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className={`grid h-9 w-9 place-items-center rounded-xl ${styles[accent]}`}><Icon size={17} /></div>
        <span className={`flex items-center gap-1 text-[11px] font-bold ${parsed.isNew ? "text-[#8c9298]" : parsed.positive ? "text-[#19815f]" : "text-[#c04f3d]"}`}>
          {parsed.isNew ? null : parsed.positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {parsed.label}
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold text-[#7e858b]">{label}</p>
      <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.045em] text-[#24292d]">{value}</p>
      <p className="mt-3 text-[11px] text-[#9a9fa4]">{note}</p>
    </article>
  );
}

function FeeChart({ placements }: { placements: PlacementView[] }) {
  const buckets = useMemo(() => feeByMonth(placements, 6), [placements]);
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const width = 720;
  const height = 210;
  const chartHeight = 185;
  const chartBottom = 7 + chartHeight;
  const stepX = width / Math.max(buckets.length - 1, 1);
  const points = buckets.map((b, i) => ({ x: i * stepX, y: chartBottom - (b.total / max) * chartHeight }));
  const linePath = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const growth = buckets.length >= 2 && buckets[buckets.length - 2].total > 0
    ? ((buckets[buckets.length - 1].total - buckets[buckets.length - 2].total) / buckets[buckets.length - 2].total) * 100
    : null;

  return (
    <article className="surface overflow-hidden p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold">Fee revenue</p>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-[27px] font-bold tracking-[-0.04em]">{money(total, true)}</span>
            {growth !== null && <span className={`text-xs font-bold ${growth >= 0 ? "text-[#1b9069]" : "text-[#c04f3d]"}`}>{growth >= 0 ? "+" : ""}{Math.round(growth * 10) / 10}%</span>}
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg border border-[#e3e5e7] px-2.5 py-1.5 text-[11px] font-semibold text-[#687078]">Last {buckets.length} months</span>
      </div>
      <div className="relative mt-5 h-[225px] w-full">
        <div className="absolute inset-0 flex flex-col justify-between pb-7 text-[10px] text-[#a7acb0]">
          {[max, max * 0.66, max * 0.33, 0].map((label, i) => (
            <div key={i} className="flex items-center gap-3"><span className="w-9">{money(Math.round(label), true)}</span><span className="h-px flex-1 bg-[#eef0f1]" /></div>
          ))}
        </div>
        {total > 0 ? (
          <svg viewBox={`0 0 ${width} ${height}`} className="absolute bottom-7 left-11 right-0 h-[185px] w-[calc(100%-44px)]" preserveAspectRatio="none" aria-label="Fee revenue trend">
            <defs><linearGradient id="feeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#39a982" stopOpacity="0.22" /><stop offset="100%" stopColor="#39a982" stopOpacity="0" /></linearGradient></defs>
            <path d={areaPath} fill="url(#feeFill)" />
            <path d={linePath} fill="none" stroke="#1c956d" strokeWidth="3" strokeLinecap="round" />
            {points.length > 0 && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="5" fill="white" stroke="#1c956d" strokeWidth="3" />}
          </svg>
        ) : (
          <div className="absolute bottom-7 left-11 right-0 flex h-[185px] items-center justify-center text-xs text-[#a1a6aa]">No completed placements yet</div>
        )}
        <div className="absolute bottom-0 left-11 right-0 flex justify-between text-[10px] font-medium text-[#9ba0a5]">{buckets.map((b) => <span key={b.key}>{b.label}</span>)}</div>
      </div>
    </article>
  );
}

function PriorityCard({
  placements,
  jobOrders,
  candidateMap,
  jobOrderMap,
}: {
  placements: PlacementView[];
  jobOrders: JobOrderView[];
  candidateMap: Map<number, CandidateView>;
  jobOrderMap: Map<number, JobOrderView>;
}) {
  const priority = useMemo(() => pickPriorityPlacement(placements, jobOrders), [placements, jobOrders]);
  const jobOrder = priority ? jobOrderMap.get(priority.jobOrderId) : undefined;
  const candidate = priority ? candidateMap.get(priority.candidateId) : undefined;
  const estimatedFee = priority?.feeAmount ?? (jobOrder ? feeForSalary((jobOrder.salaryMin + jobOrder.salaryMax) / 2, jobOrder.feePercentage) : 0);

  return (
    <article className="relative overflow-hidden rounded-[18px] bg-[#242a2e] p-5 text-white shadow-[0_12px_35px_rgba(31,37,41,0.14)] sm:p-6">
      <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full border-[36px] border-white/[0.035]" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold text-[#7ce1b9]"><Sparkles size={15} /> Smart priority</span>
          <MoreHorizontal size={18} className="text-white/40" />
        </div>
        <p className="mt-8 max-w-[260px] text-[22px] font-semibold leading-[1.25] tracking-[-0.03em]">
          {priority && candidate ? `${candidate.name} needs your next move.` : "Your pipeline is ready for its next candidate."}
        </p>
        <p className="mt-3 text-xs leading-5 text-white/55">
          {priority ? priorityReason(priority, jobOrder, candidate) : "Add a candidate to a job order and Northstar will surface the best next action."}
        </p>
        <div className="my-5 h-px bg-white/10" />
        <div className="flex items-center justify-between">
          {priority ? (
            <div><p className="text-[10px] uppercase tracking-[0.13em] text-white/40">Potential fee</p><p className="mt-1 text-lg font-bold">{money(estimatedFee)}</p></div>
          ) : <span />}
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#252b2f]"><ArrowRight size={18} /></span>
        </div>
      </div>
    </article>
  );
}

function PipelineSnapshot({
  placements,
  candidateMap,
  jobOrderMap,
  clientMap,
  onView,
  onAdvance,
}: {
  placements: PlacementView[];
  candidateMap: Map<number, CandidateView>;
  jobOrderMap: Map<number, JobOrderView>;
  clientMap: Map<number, ClientView>;
  onView: () => void;
  onAdvance: (id: number) => void;
}) {
  const active = placements.filter((p) => !["placed", "guarantee", "completed", "fell_through"].includes(p.stage)).slice(0, 5);
  return (
    <article className="surface p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-base font-bold tracking-[-0.02em]">Candidates in motion</h2><p className="mt-1 text-xs text-[#8a9095]">Your most active pipeline entries</p></div>
        <button onClick={onView} className="text-button">View pipeline <ArrowRight size={14} /></button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[650px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#eef0f1] text-[10px] font-bold uppercase tracking-[0.11em] text-[#a0a5aa]">
              <th className="pb-3 font-bold">Candidate</th><th className="pb-3 font-bold">Stage</th><th className="pb-3 font-bold">Role</th><th className="pb-3 font-bold">Last activity</th><th className="pb-3 text-right font-bold">Next</th>
            </tr>
          </thead>
          <tbody>
            {active.map((p, index) => {
              const candidate = candidateMap.get(p.candidateId);
              const jobOrder = jobOrderMap.get(p.jobOrderId);
              const client = jobOrder ? clientMap.get(jobOrder.clientId) : undefined;
              const stage = pipelineStages.find((s) => s.key === p.stage);
              return (
                <tr key={p.id} className="border-b border-[#f0f1f2] last:border-0">
                  <td className="py-3.5">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold ${avatarColors[index % avatarColors.length]}`}>{candidate ? initialsFromName(candidate.name) : "??"}</span>
                      <div><p className="text-xs font-bold text-[#343a3e]">{candidate?.name ?? "Unknown"}</p><p className="mt-0.5 text-[10px] text-[#959ba0]">{candidate?.currentTitle}</p></div>
                    </div>
                  </td>
                  <td className="py-3.5"><span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#626a70]"><span className={`h-1.5 w-1.5 rounded-full ${stage?.dot}`} /> {stage?.label}</span></td>
                  <td className="py-3.5 text-xs font-semibold text-[#596168]">{jobOrder?.title} <span className="text-[#a0a5aa]">· {client?.name}</span></td>
                  <td className="py-3.5 text-[11px] text-[#7f868c]">{relativeLabel(p.lastActivityAt)}</td>
                  <td className="py-3.5 text-right">
                    <button onClick={() => onAdvance(p.id)} className="rounded-lg p-1.5 text-[#92989d] transition hover:bg-[#eef6f2] hover:text-[#17805e]" aria-label="Advance candidate">
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {active.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-xs text-[#8c9297]">No active pipeline entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TasksCard({ tasks, onView, onTaskToggle }: { tasks: TaskView[]; onView: () => void; onTaskToggle: (id: number, completed: boolean) => void }) {
  const open = tasks.filter((t) => !t.completed).slice(0, 4);
  return (
    <article className="surface p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-base font-bold tracking-[-0.02em]">Up next</h2><p className="mt-1 text-xs text-[#8a9095]">{open.length} actions need attention</p></div>
        <button onClick={onView} className="text-button">All tasks <ArrowRight size={14} /></button>
      </div>
      <div className="mt-4 space-y-1">
        {open.map((task) => (
          <div key={task.id} className="group flex items-start gap-3 rounded-xl px-1 py-2.5">
            <button onClick={() => onTaskToggle(task.id, true)} aria-label={`Complete ${task.title}`} className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border border-[#cfd3d6] text-transparent transition hover:border-[#1c926b] hover:text-[#1c926b]">
              <Check size={12} strokeWidth={3} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#3d4348]">{task.title}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[#989da2]"><span className="text-[#697177]">{task.relatedLabel}</span><span>·</span><span>{task.dueLabel}</span></p>
            </div>
            <TaskIcon type={task.type} />
          </div>
        ))}
        {open.length === 0 && <p className="py-6 text-center text-xs text-[#8c9297]">Nothing pending. Nice work.</p>}
      </div>
    </article>
  );
}

function PipelineView({
  placements,
  candidateMap,
  jobOrderMap,
  clientMap,
  onMove,
  onDelete,
  onAddToPipeline,
}: {
  placements: PlacementView[];
  candidateMap: Map<number, CandidateView>;
  jobOrderMap: Map<number, JobOrderView>;
  clientMap: Map<number, ClientView>;
  onMove: (id: number, stage: string, agreedSalary?: number) => void;
  onDelete: (id: number) => void;
  onAddToPipeline: () => void;
}) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [salaryPromptFor, setSalaryPromptFor] = useState<{ placementId: number; jobOrder?: JobOrderView } | null>(null);
  const activeValue = placements
    .filter((p) => !["placed", "guarantee", "completed", "fell_through"].includes(p.stage))
    .reduce((sum, p) => {
      const jo = jobOrderMap.get(p.jobOrderId);
      return sum + (p.feeAmount ?? (jo ? feeForSalary((jo.salaryMin + jo.salaryMax) / 2, jo.feePercentage) : 0));
    }, 0);

  function drop(event: DragEvent<HTMLDivElement>, stage: string) {
    event.preventDefault();
    setOverStage(null);
    if (draggedId === null) return;
    const placement = placements.find((p) => p.id === draggedId);
    setDraggedId(null);
    if (!placement) return;
    if (stage === "offer") {
      setSalaryPromptFor({ placementId: placement.id, jobOrder: jobOrderMap.get(placement.jobOrderId) });
      return;
    }
    onMove(placement.id, stage);
  }

  return (
    <div className="mx-auto max-w-[1650px] animate-page-in">
      <PageHeading
        eyebrow="Desk workspace"
        title="Candidate pipeline"
        description={`${placements.length} pipeline entries · ${money(activeValue)} projected fees`}
        action={<button onClick={onAddToPipeline} className="primary-button"><Plus size={17} /> Add to pipeline</button>}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5e7e8] bg-white px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] text-[#8b9298]"><GripVertical size={14} /> Drag candidates to update their stage. Moving to &quot;Offer&quot; locks in the fee.</p>
      </div>
      <div className="grid items-start gap-3 overflow-x-auto pb-4 xl:grid-cols-6">
        {pipelineStages.map((stage) => {
          const stageDeals = placements.filter((p) => p.stage === stage.key);
          const total = stageDeals.reduce((sum, p) => {
            const jo = jobOrderMap.get(p.jobOrderId);
            return sum + (p.feeAmount ?? (jo ? feeForSalary((jo.salaryMin + jo.salaryMax) / 2, jo.feePercentage) : 0));
          }, 0);
          return (
            <div
              key={stage.key}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage.key); }}
              onDragLeave={() => setOverStage(null)}
              onDrop={(e) => drop(e, stage.key)}
              className={`min-w-[240px] rounded-[18px] border p-3 transition ${overStage === stage.key ? "border-[#81c2a9] bg-[#edf7f2]" : "border-[#e5e7e8] bg-[#f0f1f2]/70"}`}
            >
              <div className="mb-3 flex items-center justify-between px-1 py-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                  <h2 className="text-xs font-bold text-[#454c51]">{stage.label}</h2>
                  <span className="text-[10px] font-bold text-[#a0a5aa]">{stageDeals.length}</span>
                </div>
              </div>
              <p className="mb-2 px-1 text-[10px] font-bold text-[#70777d]">{money(total, true)}</p>
              <div className="space-y-2.5">
                {stageDeals.map((placement, index) => (
                  <PlacementCard
                    key={placement.id}
                    placement={placement}
                    candidate={candidateMap.get(placement.candidateId)}
                    jobOrder={jobOrderMap.get(placement.jobOrderId)}
                    client={jobOrderMap.get(placement.jobOrderId) ? clientMap.get(jobOrderMap.get(placement.jobOrderId)!.clientId) : undefined}
                    colorIndex={index}
                    dragging={draggedId === placement.id}
                    onDragStart={() => setDraggedId(placement.id)}
                    onDragEnd={() => { setDraggedId(null); setOverStage(null); }}
                    onDelete={() => onDelete(placement.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {salaryPromptFor && (
        <SalaryPromptModal
          jobOrder={salaryPromptFor.jobOrder}
          onClose={() => setSalaryPromptFor(null)}
          onConfirm={(salary) => {
            onMove(salaryPromptFor.placementId, "offer", salary);
            setSalaryPromptFor(null);
          }}
        />
      )}
    </div>
  );
}

function PlacementCard({
  placement,
  candidate,
  jobOrder,
  client,
  colorIndex,
  dragging,
  onDragStart,
  onDragEnd,
  onDelete,
}: {
  placement: PlacementView;
  candidate: CandidateView | undefined;
  jobOrder: JobOrderView | undefined;
  client: ClientView | undefined;
  colorIndex: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDelete: () => void;
}) {
  const estimatedFee = placement.feeAmount ?? (jobOrder ? feeForSalary((jobOrder.salaryMin + jobOrder.salaryMax) / 2, jobOrder.feePercentage) : 0);
  const guaranteeRemaining = guaranteeDaysRemaining(placement);
  return (
    <article draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className={`group cursor-grab rounded-2xl border border-[#e4e6e8] bg-white p-3.5 shadow-[0_2px_8px_rgba(31,37,41,0.035)] transition active:cursor-grabbing ${dragging ? "rotate-1 scale-[1.02] opacity-60 shadow-xl" : "hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(31,37,41,0.07)]"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-[#f0f1f2] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#70777d]">{jobOrder?.seniority ?? "—"}</span>
        <button onClick={onDelete} className="text-[#a1a6aa] opacity-0 transition hover:text-[#c04f3d] group-hover:opacity-100" aria-label="Remove from pipeline"><Trash2 size={14} /></button>
      </div>
      <h3 className="mt-3 text-[13px] font-bold leading-5 text-[#30363a]">{candidate?.name ?? "Unknown candidate"}</h3>
      <p className="mt-1 text-[11px] text-[#8e9499]">{jobOrder?.title} · {client?.name}</p>
      <p className="mt-3 text-base font-bold tracking-[-0.03em]">{money(estimatedFee)}</p>
      {guaranteeRemaining !== null && guaranteeRemaining >= 0 && (
        <p className="mt-1 text-[10px] font-semibold text-[#a66c18]">{guaranteeRemaining}d left in guarantee</p>
      )}
      <div className="my-3 h-px bg-[#f0f1f2]" />
      <div className="flex items-center justify-between">
        <span className={`grid h-6 w-6 place-items-center rounded-lg text-[9px] font-bold ${avatarColors[colorIndex % avatarColors.length]}`}>{candidate ? initialsFromName(candidate.name) : "??"}</span>
        <span className="text-[10px] text-[#81888d]">{relativeLabel(placement.lastActivityAt)}</span>
      </div>
    </article>
  );
}

function CandidatesView({
  candidates,
  placements,
  jobOrderMap,
  onAdd,
  onEdit,
  onDelete,
  onAddToPipeline,
}: {
  candidates: CandidateView[];
  placements: PlacementView[];
  jobOrderMap: Map<number, JobOrderView>;
  onAdd: () => void;
  onEdit: (candidate: CandidateView) => void;
  onDelete: (id: number) => void;
  onAddToPipeline: (candidateId: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const visible = candidates.filter((c) => `${c.name} ${c.currentTitle} ${c.location} ${c.skills.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="mx-auto max-w-[1400px] animate-page-in">
      <PageHeading eyebrow="Talent pool" title="Candidates" description={`${candidates.length} people in your talent database`} action={<button onClick={onAdd} className="primary-button"><Plus size={17} /> Add candidate</button>} />
      <div className="surface overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-[#eceeef] p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="relative max-w-sm flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ba0a4]" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, title, skill..." className="h-9 w-full rounded-lg bg-[#f4f5f6] pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[#d9eee6]" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead className="bg-[#fafafa] text-[10px] uppercase tracking-[0.1em] text-[#9ca1a6]">
              <tr><th className="px-5 py-3 font-bold">Candidate</th><th className="px-5 py-3 font-bold">Skills</th><th className="px-5 py-3 font-bold">Experience</th><th className="px-5 py-3 font-bold">Desired salary</th><th className="px-5 py-3 font-bold">Status</th><th className="px-5 py-3 font-bold">Contact</th><th className="px-5 py-3" /></tr>
            </thead>
            <tbody>
              {visible.map((candidate, index) => {
                const inPipeline = placements.some((p) => p.candidateId === candidate.id && !["fell_through"].includes(p.stage));
                return (
                  <tr key={candidate.id} className="border-t border-[#eef0f1] transition hover:bg-[#fbfcfc]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-9 w-9 place-items-center rounded-xl text-[10px] font-bold ${avatarColors[index % avatarColors.length]}`}>{initialsFromName(candidate.name)}</span>
                        <div><p className="text-xs font-bold">{candidate.name}</p><p className="mt-0.5 text-[10px] text-[#92989d]">{candidate.currentTitle}{candidate.currentCompany ? ` · ${candidate.currentCompany}` : ""}</p></div>
                      </div>
                    </td>
                    <td className="px-5 py-4"><div className="flex flex-wrap gap-1 max-w-[220px]">{candidate.skills.slice(0, 3).map((skill) => <span key={skill} className="rounded-md bg-[#f0f1f2] px-1.5 py-0.5 text-[9px] font-semibold text-[#626a70]">{skill}</span>)}{candidate.skills.length > 3 && <span className="text-[9px] text-[#a0a5aa]">+{candidate.skills.length - 3}</span>}</div></td>
                    <td className="px-5 py-4 text-xs font-semibold text-[#596168]">{candidate.yearsExperience}y</td>
                    <td className="px-5 py-4 text-xs font-bold">{money(candidate.desiredSalary, true)}</td>
                    <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${candidate.status === "Placed" ? "text-[#328064]" : candidate.status === "Active" ? "text-[#4359a7]" : "text-[#8b9298]"}`}><span className={`h-1.5 w-1.5 rounded-full ${candidate.status === "Placed" ? "bg-[#46b98e]" : candidate.status === "Active" ? "bg-[#5b7cd6]" : "bg-[#b1b6ba]"}`} /> {candidate.status}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1">
                        <a href={`mailto:${candidate.email}`} className="contact-button" aria-label={`Email ${candidate.name}`}><Mail size={14} /></a>
                        {candidate.phone ? <a href={`tel:${candidate.phone}`} className="contact-button" aria-label={`Call ${candidate.name}`}><Phone size={14} /></a> : <span className="contact-button cursor-not-allowed opacity-30"><Phone size={14} /></span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!inPipeline && (
                          <button onClick={() => onAddToPipeline(candidate.id)} className="rounded-lg border border-[#dfe2e4] px-2 py-1 text-[10px] font-bold text-[#454c51] transition hover:border-[#8fc7ae] hover:text-[#17805e]">
                            Add to pipeline
                          </button>
                        )}
                        <button onClick={() => onEdit(candidate)} className="text-[#a0a5a9] hover:text-[#177b5a]" aria-label={`Edit ${candidate.name}`}><Pencil size={15} /></button>
                        <button onClick={() => onDelete(candidate.id)} className="text-[#a0a5a9] hover:text-[#c04f3d]" aria-label={`Delete ${candidate.name}`}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 && <p className="py-16 text-center text-sm text-[#8c9297]">No candidates match &quot;{filter}&quot;.</p>}
        </div>
      </div>
    </div>
  );
}

function ClientsView({
  clients,
  jobOrders,
  onAddClient,
  onAddJobOrder,
  onEditClient,
  onEditJobOrder,
  onDeleteClient,
  onDeleteJobOrder,
  onStatusChange,
}: {
  clients: ClientView[];
  jobOrders: JobOrderView[];
  onAddClient: () => void;
  onAddJobOrder: () => void;
  onEditClient: (client: ClientView) => void;
  onEditJobOrder: (jobOrder: JobOrderView) => void;
  onDeleteClient: (id: number) => void;
  onDeleteJobOrder: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
}) {
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  return (
    <div className="mx-auto max-w-[1400px] animate-page-in">
      <PageHeading
        eyebrow="Client relationships"
        title="Clients & job orders"
        description={`${clients.length} clients · ${jobOrders.filter((jo) => jo.status === "Open").length} open roles`}
        action={
          <div className="flex gap-2">
            <button onClick={onAddClient} className="secondary-button"><Plus size={16} /> Add client</button>
            <button onClick={onAddJobOrder} className="primary-button"><Plus size={17} /> New job order</button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {clients.map((client) => {
          const openRoles = jobOrders.filter((jo) => jo.clientId === client.id && jo.status === "Open").length;
          return (
            <article key={client.id} className="surface p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold">{client.name}</h3>
                  <p className="mt-0.5 text-[11px] text-[#8e9499]">{client.industry}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => onEditClient(client)} className="text-[#a0a5a9] hover:text-[#177b5a]" aria-label={`Edit ${client.name}`}><Pencil size={14} /></button>
                  <button onClick={() => onDeleteClient(client.id)} className="text-[#a0a5a9] hover:text-[#c04f3d]" aria-label={`Delete ${client.name}`}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#596168]">
                <span className={`h-1.5 w-1.5 rounded-full ${client.status === "Active" ? "bg-[#46b98e]" : "bg-[#e0b355]"}`} /> {client.status}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-[#8b9298]">
                <a href={`mailto:${client.contactEmail}`} className="contact-button" aria-label={`Email ${client.contactName}`}><Mail size={13} /></a>
                {client.contactPhone && <a href={`tel:${client.contactPhone}`} className="contact-button" aria-label={`Call ${client.contactName}`}><Phone size={13} /></a>}
                <span>{client.contactName}</span>
              </div>
              <div className="mt-4 rounded-xl bg-[#f7f7f4] px-3 py-2.5 text-[11px] font-semibold text-[#596168]">{openRoles} open role{openRoles === 1 ? "" : "s"}</div>
            </article>
          );
        })}
        {clients.length === 0 && <p className="py-8 text-center text-sm text-[#8c9297] lg:col-span-3">No clients yet.</p>}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold">Job orders</h2>
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-[#fafafa] text-[10px] uppercase tracking-[0.1em] text-[#9ca1a6]">
              <tr><th className="px-5 py-3 font-bold">Role</th><th className="px-5 py-3 font-bold">Client</th><th className="px-5 py-3 font-bold">Salary range</th><th className="px-5 py-3 font-bold">Fee %</th><th className="px-5 py-3 font-bold">Priority</th><th className="px-5 py-3 font-bold">Status</th><th className="px-5 py-3" /></tr>
            </thead>
            <tbody>
              {jobOrders.map((jo) => (
                <tr key={jo.id} className="border-t border-[#eef0f1] transition hover:bg-[#fbfcfc]">
                  <td className="px-5 py-4"><p className="text-xs font-bold">{jo.title}</p><p className="mt-0.5 text-[10px] text-[#92989d]">{jo.seniority} · {jo.employmentType}</p></td>
                  <td className="px-5 py-4 text-xs font-semibold text-[#596168]">{clientMap.get(jo.clientId)?.name}</td>
                  <td className="px-5 py-4 text-xs font-bold">{money(jo.salaryMin, true)}–{money(jo.salaryMax, true)}</td>
                  <td className="px-5 py-4 text-xs font-semibold">{jo.feePercentage}%</td>
                  <td className="px-5 py-4"><span className={`text-[11px] font-bold ${jo.priority === "High" ? "text-[#c04f3d]" : jo.priority === "Medium" ? "text-[#a66c18]" : "text-[#8b9298]"}`}>{jo.priority}</span></td>
                  <td className="px-5 py-4">
                    <select value={jo.status} onChange={(e) => onStatusChange(jo.id, e.target.value)} className="rounded-lg border border-[#dfe2e4] bg-white px-2 py-1 text-[11px] font-semibold text-[#454c51] outline-none">
                      <option value="Open">Open</option><option value="OnHold">On hold</option><option value="Filled">Filled</option><option value="Cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => onEditJobOrder(jo)} className="text-[#a0a5a9] hover:text-[#177b5a]" aria-label={`Edit ${jo.title}`}><Pencil size={15} /></button>
                      <button onClick={() => onDeleteJobOrder(jo.id)} className="text-[#a0a5a9] hover:text-[#c04f3d]" aria-label={`Delete ${jo.title}`}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {jobOrders.length === 0 && <p className="py-16 text-center text-sm text-[#8c9297]">No job orders yet.</p>}
        </div>
      </div>
    </div>
  );
}

function ActivitiesView({ tasks, onTaskToggle, onSchedule, onDelete }: { tasks: TaskView[]; onTaskToggle: (id: number, completed: boolean) => void; onSchedule: () => void; onDelete: (id: number) => void }) {
  const completed = tasks.filter((t) => t.completed).length;
  return (
    <div className="mx-auto max-w-[1150px] animate-page-in">
      <PageHeading eyebrow="Daily focus" title="Activities" description={`${tasks.length - completed} open tasks · ${completed} completed`} action={<button onClick={onSchedule} className="primary-button"><Plus size={17} /> Schedule activity</button>} />
      <article className="surface p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-[#eceeef] pb-4">
          <div><h2 className="text-sm font-bold">Today&apos;s focus</h2><p className="mt-1 text-[11px] text-[#92989d]">All scheduled activities</p></div>
          <span className="rounded-lg bg-[#eef6f2] px-2.5 py-1.5 text-[10px] font-bold text-[#21805f]">{Math.round((completed / Math.max(tasks.length, 1)) * 100)}% complete</span>
        </div>
        <div className="mt-2 divide-y divide-[#eef0f1]">
          {tasks.map((task) => (
            <div key={task.id} className={`group flex items-center gap-4 py-4 transition ${task.completed ? "opacity-55" : ""}`}>
              <button onClick={() => onTaskToggle(task.id, !task.completed)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${task.completed ? "border-[#1e9870] bg-[#1e9870] text-white" : "border-[#cfd3d6] text-transparent hover:border-[#1e9870] hover:text-[#1e9870]"}`} aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}>
                <Check size={14} strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${task.completed ? "line-through" : ""}`}>{task.title}</p>
                <p className="mt-1 text-[11px] text-[#91979c]">{task.relatedLabel} · {task.dueLabel}</p>
              </div>
              <span className="hidden rounded-lg bg-[#f5f6f6] px-2.5 py-1.5 text-[10px] font-semibold text-[#687078] sm:flex sm:items-center sm:gap-1.5"><TaskIcon type={task.type} /> {task.type}</span>
              <button onClick={() => onDelete(task.id)} className="text-[#9ca2a6] opacity-0 transition hover:text-[#c04f3d] group-hover:opacity-100" aria-label={`Delete ${task.title}`}><Trash2 size={16} /></button>
            </div>
          ))}
          {tasks.length === 0 && <p className="py-10 text-center text-xs text-[#8c9297]">No activities yet.</p>}
        </div>
      </article>
    </div>
  );
}

function ReportsView({ placements, jobOrders, metrics }: { placements: PlacementView[]; jobOrders: JobOrderView[]; metrics: CoreMetrics }) {
  return (
    <div className="mx-auto max-w-[1350px] animate-page-in">
      <PageHeading eyebrow="Desk performance" title="Recruitment reports" description="Fee revenue, funnel health, and time-to-fill" />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total fees earned" value={money(metrics.totalFeesEarned, true)} delta={null} note="Across all completed placements" icon={ShieldCheck} accent="green" />
        <MetricCard label="Open job orders" value={`${metrics.openJobOrders}`} delta={null} note={`${jobOrders.length} total roles tracked`} icon={Briefcase} accent="violet" />
        <MetricCard label="Active pipeline value" value={money(metrics.activePipelineValue, true)} delta={null} note="Projected fees in motion" icon={Target} accent="blue" />
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]">
        <FeeChart placements={placements} />
        <article className="surface p-5 sm:p-6">
          <h2 className="text-sm font-bold">Stage distribution</h2>
          <p className="mt-1 text-[11px] text-[#91979c]">Where active candidates sit today</p>
          <div className="mt-7 space-y-5">
            {pipelineStages.map((stage) => {
              const count = placements.filter((p) => p.stage === stage.key).length;
              const total = placements.length || 1;
              const percent = Math.round((count / total) * 100);
              return (
                <div key={stage.key}>
                  <div className="mb-2 flex justify-between text-[11px]"><span className="flex items-center gap-2 font-semibold text-[#596168]"><span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />{stage.label}</span><span className="font-bold">{percent}%</span></div>
                  <div className="h-2 rounded-full bg-[#eef0f1]"><div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: stage.color }} /></div>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}

function TaskIcon({ type }: { type: string }) {
  const Icon = type === "Call" ? Phone : type === "Email" ? Mail : type === "Interview" ? Users : type === "Submission" ? Briefcase : MessageSquareText;
  return <Icon size={14} className="text-[#9aa0a5]" />;
}

function RecruitmentSearchResults({
  query,
  candidates,
  jobOrders,
  clients,
  clientMap,
  onClose,
  onNavigate,
}: {
  query: string;
  candidates: CandidateView[];
  jobOrders: JobOrderView[];
  clients: ClientView[];
  clientMap: Map<number, ClientView>;
  onClose: () => void;
  onNavigate: (view: ViewName) => void;
}) {
  const empty = candidates.length === 0 && jobOrders.length === 0 && clients.length === 0;
  return (
    <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-[#e0e3e5] bg-white shadow-[0_18px_50px_rgba(30,36,40,0.14)] animate-pop-in">
      <div className="flex items-center justify-between border-b border-[#eceeef] px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#999fa4]">Search results</span>
        <button onClick={onClose}><X size={14} className="text-[#9aa0a5]" /></button>
      </div>
      <div className="max-h-[390px] overflow-y-auto p-2">
        {empty && <p className="px-3 py-8 text-center text-xs text-[#858c92]">No results found for &quot;{query}&quot;</p>}
        {candidates.length > 0 && (
          <div>
            <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#a1a6aa]">Candidates</p>
            {candidates.map((c) => (
              <button key={c.id} onClick={() => onNavigate("Candidates")} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#f5f7f6]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8f2ed] text-[#217c5e]"><Users size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{c.name}</span><span className="mt-0.5 block text-[10px] text-[#90969b]">{c.currentTitle} · {c.location}</span></span>
                <ChevronRight size={14} className="text-[#a1a6aa]" />
              </button>
            ))}
          </div>
        )}
        {jobOrders.length > 0 && (
          <div>
            <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#a1a6aa]">Job orders</p>
            {jobOrders.map((jo) => (
              <button key={jo.id} onClick={() => onNavigate("Clients & Roles")} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#f5f7f6]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f5f0e0] text-[#9b6a1f]"><Briefcase size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{jo.title}</span><span className="mt-0.5 block text-[10px] text-[#90969b]">{clientMap.get(jo.clientId)?.name}</span></span>
                <ChevronRight size={14} className="text-[#a1a6aa]" />
              </button>
            ))}
          </div>
        )}
        {clients.length > 0 && (
          <div>
            <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#a1a6aa]">Clients</p>
            {clients.map((c) => (
              <button key={c.id} onClick={() => onNavigate("Clients & Roles")} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#f5f7f6]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eee9fa] text-[#6f52ae]"><Briefcase size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{c.name}</span><span className="mt-0.5 block text-[10px] text-[#90969b]">{c.industry}</span></span>
                <ChevronRight size={14} className="text-[#a1a6aa]" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SalaryPromptModal({ jobOrder, onClose, onConfirm }: { jobOrder: JobOrderView | undefined; onClose: () => void; onConfirm: (salary: number) => void }) {
  const [salary, setSalary] = useState(jobOrder ? Math.round((jobOrder.salaryMin + jobOrder.salaryMax) / 2) : 0);
  const fee = jobOrder ? feeForSalary(salary, jobOrder.feePercentage) : 0;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-[420px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]">Lock in the fee</p><h2 className="mt-1.5 text-lg font-bold tracking-[-0.03em]">Agreed salary for the offer</h2></div>
          <button onClick={onClose} className="icon-button" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">
          <label className="field"><span>Agreed annual salary</span>
            <input type="number" min="1" value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
          </label>
          {jobOrder && <p className="mt-3 rounded-xl bg-[#f7f7f4] px-3 py-2.5 text-xs font-semibold text-[#596168]">Fee at {jobOrder.feePercentage}%: <span className="text-[#17805e]">{money(fee)}</span></p>}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eef0f1] pt-5">
            <button onClick={onClose} className="secondary-button">Cancel</button>
            <button onClick={() => onConfirm(salary)} disabled={!salary || salary <= 0} className="primary-button disabled:opacity-60">Confirm offer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecruitmentSettingsPanel({
  hasData,
  onClose,
  onLoadSample,
  onReset,
}: {
  hasData: boolean;
  onClose: () => void;
  onLoadSample: () => void;
  onReset: () => void;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="w-full max-w-[480px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]">Workspace</p>
            <h2 className="mt-1.5 text-lg font-bold tracking-[-0.03em]">Settings</h2>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-[#e5e7e8] p-4">
            <p className="text-sm font-bold">Sample data</p>
            <p className="mt-1 text-xs leading-5 text-[#7d848a]">
              {hasData
                ? "Your workspace already has data, so this won't add duplicates or overwrite anything."
                : "Load a realistic demo desk (clients, candidates, and an active pipeline) to explore every feature."}
            </p>
            <button onClick={onLoadSample} className="secondary-button mt-3">
              <Sparkles size={15} /> Load sample data
            </button>
          </div>

          <div className="rounded-2xl border border-[#f3d9d2] bg-[#fff8f6] p-4">
            <p className="text-sm font-bold text-[#9a3f2f]">Danger zone</p>
            <p className="mt-1 text-xs leading-5 text-[#a8574a]">
              Permanently deletes every client, candidate, job order, and placement in this workspace. This can&apos;t be undone.
            </p>
            {!confirmingReset ? (
              <button onClick={() => setConfirmingReset(true)} className="mt-3 flex items-center gap-2 rounded-xl border border-[#e3a89b] bg-white px-3.5 py-2 text-xs font-bold text-[#9a3f2f] transition hover:bg-[#fdeeea]">
                <Trash2 size={14} /> Clear all data
              </button>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <button onClick={onReset} className="rounded-xl bg-[#c04f3d] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#a8402f]">
                  Yes, delete everything
                </button>
                <button onClick={() => setConfirmingReset(false)} className="rounded-xl px-3.5 py-2 text-xs font-bold text-[#7d848a] hover:bg-[#f0f1f2]">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateCandidateModal({
  editingCandidate,
  prefill,
  onClose,
  onSuccess,
}: {
  editingCandidate?: CandidateView | null;
  prefill?: Partial<CandidateView> | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editingCandidate);
  const draft = editingCandidate ?? prefill ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
      birthDate: String(data.get("birthDate") ?? ""),
      currentTitle: String(data.get("currentTitle") ?? ""),
      currentCompany: String(data.get("currentCompany") ?? ""),
      location: String(data.get("location") ?? ""),
      skills: String(data.get("skills") ?? ""),
      yearsExperience: Number(data.get("yearsExperience") ?? 0),
      desiredSalary: Number(data.get("desiredSalary") ?? 0),
      availability: String(data.get("availability") ?? ""),
      source: String(data.get("source") ?? "Sourced"),
    };
    const result = editingCandidate ? await updateCandidate(editingCandidate.id, payload) : await createCandidate(payload);
    setSubmitting(false);
    if (!result.ok) { setError(result.message ?? "Could not save this candidate."); return; }
    onSuccess(result.message ?? "Candidate saved.");
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-[620px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]">
              {isEditing ? <Pencil size={13} /> : <Users size={13} />} {isEditing ? "Edit candidate" : prefill ? "Imported from CV" : "New candidate"}
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em]">{isEditing ? "Update this candidate" : "Add to your talent pool"}</h2>
            {prefill && !isEditing && (
              <p className="mt-1.5 text-xs text-[#8a9095]">Fields were filled in automatically from the uploaded file — check them over before saving.</p>
            )}
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2"><span>Full name</span><input name="name" required autoFocus defaultValue={draft?.name} placeholder="Jordan Reyes" /></label>
            <label className="field"><span>Current title</span><input name="currentTitle" required defaultValue={draft?.currentTitle} placeholder="Senior Backend Engineer" /></label>
            <label className="field"><span>Current company</span><input name="currentCompany" defaultValue={draft?.currentCompany ?? ""} placeholder="Optional" /></label>
            <label className="field"><span>Email</span><input name="email" type="email" required defaultValue={draft?.email} placeholder="jordan@mail.com" /></label>
            <label className="field"><span>Phone (optional)</span><input name="phone" type="tel" defaultValue={draft?.phone ?? ""} placeholder="+48 500 000 000" /></label>
            <label className="field"><span>Date of birth (optional)</span><input name="birthDate" type="date" defaultValue={draft?.birthDate ?? ""} /></label>
            <label className="field"><span>Location</span><input name="location" required defaultValue={draft?.location} placeholder="Austin, TX" /></label>
            <label className="field"><span>Years of experience</span><input name="yearsExperience" type="number" min="0" defaultValue={draft?.yearsExperience ?? 3} /></label>
            <label className="field"><span>Desired salary</span><input name="desiredSalary" type="number" min="1" required defaultValue={draft?.desiredSalary} placeholder="150 000" /></label>
            <label className="field"><span>Availability</span><select name="availability" defaultValue={draft?.availability ?? "2 weeks notice"}><option>Immediate</option><option>2 weeks notice</option><option>1 month notice</option></select></label>
            <label className="field"><span>Source</span><select name="source" defaultValue={isEditing ? draft?.source : prefill ? "Applied" : "Sourced"}><option>Referral</option><option>Sourced</option><option>Applied</option><option>Network</option></select></label>
            <label className="field sm:col-span-2"><span>Skills (comma separated)</span><input name="skills" defaultValue={draft?.skills?.join(", ") ?? ""} placeholder="Go, PostgreSQL, Kubernetes" /></label>
          </div>
          {error && <p className="mt-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">{error}</p>}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eef0f1] pt-5">
            <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
            <button type="submit" disabled={submitting} className="primary-button min-w-[140px] justify-center disabled:opacity-60">
              {submitting ? (
                <><LoaderCircle size={16} className="animate-spin" /> {isEditing ? "Saving..." : "Adding..."}</>
              ) : isEditing ? (
                <><Pencil size={16} /> Save changes</>
              ) : (
                <><Plus size={16} /> Add candidate</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportCvModal({
  onClose,
  onParsed,
}: {
  onClose: () => void;
  onParsed: (fields: Partial<CandidateView>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const result = await parseCvFile(formData);
    setUploading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const fields: ParsedCvFields = result.fields;
    const draft: Partial<CandidateView> = {
      name: fields.fullName ?? undefined,
      email: fields.email ?? undefined,
      phone: fields.phone ?? undefined,
      birthDate: fields.birthDate ?? undefined,
      location: fields.city ?? undefined,
    };
    onParsed(draft);
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-[480px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]"><FileUp size={13} /> Import CV</p>
            <h2 className="mt-1.5 text-lg font-bold tracking-[-0.03em]">Create a candidate from a file</h2>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">
          <p className="mb-3 text-xs leading-5 text-[#7d848a]">
            Upload a .pdf or .docx CV. Name, email, phone, date of birth, and city are pulled out automatically — you&apos;ll get a chance to check and correct everything before it&apos;s saved.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#d3d7da] bg-[#fafafa] px-4 py-8 text-center transition hover:border-[#8fc7ae] hover:bg-[#f4faf7]">
            <input
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {uploading ? (
              <><LoaderCircle size={22} className="animate-spin text-[#17805e]" /><span className="text-xs font-semibold text-[#596168]">Reading {fileName}...</span></>
            ) : (
              <>
                <FileUp size={22} className="text-[#8d9398]" />
                <span className="text-xs font-semibold text-[#596168]">Click to choose a file</span>
                <span className="text-[10px] text-[#a0a5aa]">PDF or DOCX</span>
              </>
            )}
          </label>
          {error && <p className="mt-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function CreateClientModal({
  editingClient,
  onClose,
  onSuccess,
}: {
  editingClient?: ClientView | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editingClient);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? ""),
      industry: String(data.get("industry") ?? ""),
      contactName: String(data.get("contactName") ?? ""),
      contactEmail: String(data.get("contactEmail") ?? ""),
      contactPhone: String(data.get("contactPhone") ?? ""),
    };
    const result = editingClient ? await updateClient(editingClient.id, payload) : await createClient(payload);
    setSubmitting(false);
    if (!result.ok) { setError(result.message ?? "Could not save this client."); return; }
    onSuccess(result.message ?? "Client saved.");
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]">
              {isEditing ? <Pencil size={13} /> : <Briefcase size={13} />} {isEditing ? "Edit client" : "New client"}
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em]">{isEditing ? "Update this client" : "Add a hiring client"}</h2>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2"><span>Company name</span><input name="name" required autoFocus defaultValue={editingClient?.name} placeholder="Atlas Labs" /></label>
            <label className="field"><span>Industry</span><input name="industry" required defaultValue={editingClient?.industry} placeholder="B2B SaaS" /></label>
            <label className="field"><span>Contact name</span><input name="contactName" required defaultValue={editingClient?.contactName} placeholder="Priya Shah" /></label>
            <label className="field"><span>Contact email</span><input name="contactEmail" type="email" required defaultValue={editingClient?.contactEmail} placeholder="priya@company.com" /></label>
            <label className="field"><span>Contact phone (optional)</span><input name="contactPhone" type="tel" defaultValue={editingClient?.contactPhone ?? ""} placeholder="+48 500 000 000" /></label>
          </div>
          {error && <p className="mt-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">{error}</p>}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eef0f1] pt-5">
            <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
            <button type="submit" disabled={submitting} className="primary-button min-w-[140px] justify-center disabled:opacity-60">
              {submitting ? (
                <><LoaderCircle size={16} className="animate-spin" /> {isEditing ? "Saving..." : "Adding..."}</>
              ) : isEditing ? (
                <><Pencil size={16} /> Save changes</>
              ) : (
                <><Plus size={16} /> Add client</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateJobOrderModal({
  clients,
  editingJobOrder,
  onClose,
  onSuccess,
}: {
  clients: ClientView[];
  editingJobOrder?: JobOrderView | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editingJobOrder);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      title: String(data.get("title") ?? ""),
      clientId: Number(data.get("clientId") ?? 0),
      seniority: String(data.get("seniority") ?? "Mid"),
      employmentType: String(data.get("employmentType") ?? "Permanent"),
      salaryMin: Number(data.get("salaryMin") ?? 0),
      salaryMax: Number(data.get("salaryMax") ?? 0),
      feePercentage: Number(data.get("feePercentage") ?? 20),
      openings: Number(data.get("openings") ?? 1),
      priority: String(data.get("priority") ?? "Medium"),
    };
    const result = editingJobOrder
      ? await updateJobOrder(editingJobOrder.id, payload)
      : await createJobOrder(payload);
    setSubmitting(false);
    if (!result.ok) { setError(result.message ?? "Could not save this job order."); return; }
    onSuccess(result.message ?? "Job order saved.");
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-[620px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]">
              {isEditing ? <Pencil size={13} /> : <Briefcase size={13} />} {isEditing ? "Edit job order" : "New job order"}
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em]">{isEditing ? "Update this role" : "Open a role for a client"}</h2>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 sm:p-6">
          {clients.length === 0 ? (
            <p className="rounded-xl bg-[#fff7e8] px-3 py-2.5 text-xs font-semibold text-[#8a6416]">Add a client first before opening a job order.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field sm:col-span-2"><span>Role title</span><input name="title" required autoFocus defaultValue={editingJobOrder?.title} placeholder="Senior Backend Engineer" /></label>
              <label className="field sm:col-span-2"><span>Client</span><select name="clientId" required defaultValue={editingJobOrder?.clientId ?? clients[0]?.id}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="field"><span>Seniority</span><select name="seniority" defaultValue={editingJobOrder?.seniority ?? "Mid"}><option>Junior</option><option>Mid</option><option>Senior</option><option>Lead</option><option>Executive</option></select></label>
              <label className="field"><span>Employment type</span><select name="employmentType" defaultValue={editingJobOrder?.employmentType ?? "Permanent"}><option>Permanent</option><option>Contract</option><option>Temp</option></select></label>
              <label className="field"><span>Salary min</span><input name="salaryMin" type="number" min="1" required defaultValue={editingJobOrder?.salaryMin} placeholder="130 000" /></label>
              <label className="field"><span>Salary max</span><input name="salaryMax" type="number" min="1" required defaultValue={editingJobOrder?.salaryMax} placeholder="160 000" /></label>
              <label className="field"><span>Fee %</span><input name="feePercentage" type="number" min="1" max="100" step="0.5" defaultValue={editingJobOrder?.feePercentage ?? 20} /></label>
              <label className="field"><span>Openings</span><input name="openings" type="number" min="1" defaultValue={editingJobOrder?.openings ?? 1} /></label>
              <label className="field sm:col-span-2"><span>Priority</span><select name="priority" defaultValue={editingJobOrder?.priority ?? "Medium"}><option>Low</option><option>Medium</option><option>High</option></select></label>
            </div>
          )}
          {error && <p className="mt-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">{error}</p>}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eef0f1] pt-5">
            <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
            <button type="submit" disabled={submitting || clients.length === 0} className="primary-button min-w-[140px] justify-center disabled:opacity-60">
              {submitting ? (
                <><LoaderCircle size={16} className="animate-spin" /> {isEditing ? "Saving..." : "Opening..."}</>
              ) : isEditing ? (
                <><Pencil size={16} /> Save changes</>
              ) : (
                <><Plus size={16} /> Open role</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateTaskModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (message: string) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const result = await createRecruitmentTask({
      title: String(data.get("title") ?? ""),
      relatedLabel: String(data.get("relatedLabel") ?? ""),
      type: String(data.get("type") ?? "Call"),
      dueLabel: String(data.get("dueLabel") ?? ""),
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.message ?? "Could not schedule this activity."); return; }
    onSuccess(result.message ?? "Activity scheduled.");
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5 sm:px-6">
          <div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]"><CalendarDays size={13} /> New activity</p><h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em]">Schedule an activity</h2></div>
          <button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2"><span>Title</span><input name="title" required autoFocus placeholder="e.g. Reference check" /></label>
            <label className="field sm:col-span-2"><span>Related to</span><input name="relatedLabel" required placeholder="e.g. Jordan Reyes · Senior Backend Engineer" /></label>
            <label className="field"><span>Type</span><select name="type" defaultValue="Call"><option>Call</option><option>Email</option><option>Interview</option><option>Submission</option><option>Reference check</option></select></label>
            <label className="field"><span>Due</span><input name="dueLabel" required placeholder="e.g. Tomorrow, 2:00 PM" /></label>
          </div>
          {error && <p className="mt-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">{error}</p>}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eef0f1] pt-5">
            <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
            <button type="submit" disabled={submitting} className="primary-button min-w-[140px] justify-center disabled:opacity-60">
              {submitting ? <><LoaderCircle size={16} className="animate-spin" /> Scheduling...</> : <><Plus size={16} /> Schedule</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddToPipelineModal({
  candidates,
  jobOrders,
  clientMap,
  defaultCandidateId,
  onClose,
  onSuccess,
}: {
  candidates: CandidateView[];
  jobOrders: JobOrderView[];
  clientMap: Map<number, ClientView>;
  defaultCandidateId?: number;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openJobOrders = jobOrders.filter((jo) => jo.status === "Open");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const result = await createPlacement({
      candidateId: Number(data.get("candidateId") ?? 0),
      jobOrderId: Number(data.get("jobOrderId") ?? 0),
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.message ?? "Could not add to pipeline."); return; }
    onSuccess(result.message ?? "Added to pipeline.");
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="w-full max-w-[520px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]">Pipeline</p><h2 className="mt-1.5 text-lg font-bold tracking-[-0.03em]">Add candidate to a job order</h2></div>
          <button onClick={onClose} className="icon-button" aria-label="Close"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5">
          {candidates.length === 0 || openJobOrders.length === 0 ? (
            <p className="rounded-xl bg-[#fff7e8] px-3 py-2.5 text-xs font-semibold text-[#8a6416]">You need at least one candidate and one open job order first.</p>
          ) : (
            <div className="grid gap-4">
              <label className="field"><span>Candidate</span>
                <select name="candidateId" required defaultValue={defaultCandidateId ?? candidates[0]?.id}>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.currentTitle}</option>)}
                </select>
              </label>
              <label className="field"><span>Job order</span>
                <select name="jobOrderId" required defaultValue={openJobOrders[0]?.id}>
                  {openJobOrders.map((jo) => <option key={jo.id} value={jo.id}>{jo.title} — {clientMap.get(jo.clientId)?.name}</option>)}
                </select>
              </label>
            </div>
          )}
          {error && <p className="mt-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">{error}</p>}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eef0f1] pt-5">
            <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
            <button type="submit" disabled={submitting || candidates.length === 0 || openJobOrders.length === 0} className="primary-button min-w-[140px] justify-center disabled:opacity-60">
              {submitting ? <><LoaderCircle size={16} className="animate-spin" /> Adding...</> : <><Plus size={16} /> Add to pipeline</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
