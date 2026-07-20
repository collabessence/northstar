"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Columns3,
  Command,
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
  Rows3,
  Search,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  createContact,
  createDeal,
  createTask,
  deleteContact,
  deleteDeal,
  deleteTask,
  loadSampleData,
  moveDeal,
  resetWorkspace,
  setTaskCompleted,
  updateContact,
  updateDeal,
} from "./actions";
import {
  computeCoreMetrics,
  percentDelta,
  pickPriorityDeal,
  priorityReason,
  relativeLabel,
  revenueByMonth,
  type DealView,
} from "@/lib/metrics";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { logout } from "@/app/login/actions";
import { money, todayLabel } from "@/lib/format";

type ContactView = {
  id: number;
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string | null;
  initials: string;
  status: string;
};

type TaskView = {
  id: number;
  title: string;
  company: string;
  type: string;
  dueLabel: string;
  dueAt: string | null;
  completed: boolean;
};

type SnapshotView = {
  day: string;
  pipeline: number;
  forecast: number;
  wonValue: number;
  winRate: number;
  avgCycleDays: number | null;
} | null;

type ActivityEntry = {
  id: number;
  message: string;
  kind: string;
  createdAt: string;
};

type ViewName = "Overview" | "Pipeline" | "Contacts" | "Activities" | "Reports";

type DashboardProps = {
  deals: DealView[];
  contacts: ContactView[];
  tasks: TaskView[];
  activity: ActivityEntry[];
  previousSnapshot: SnapshotView;
};

const navItems: Array<{ label: ViewName; icon: LucideIcon; shortcut?: string }> = [
  { label: "Overview", icon: LayoutDashboard, shortcut: "⌘ 1" },
  { label: "Pipeline", icon: Columns3, shortcut: "⌘ 2" },
  { label: "Contacts", icon: UsersRound, shortcut: "⌘ 3" },
  { label: "Activities", icon: CalendarDays },
  { label: "Reports", icon: BarChart3 },
];

const stageConfig = [
  { key: "new", label: "New lead", color: "#7c8a9e", dot: "bg-slate-400" },
  { key: "qualified", label: "Qualified", color: "#8b5cf6", dot: "bg-violet-500" },
  { key: "proposal", label: "Proposal", color: "#f59e0b", dot: "bg-amber-500" },
  { key: "won", label: "Closed won", color: "#18a676", dot: "bg-emerald-500" },
] as const;

const avatarColors = [
  "bg-[#dfe7ff] text-[#4359a7]",
  "bg-[#f9e6d1] text-[#9a5a25]",
  "bg-[#dff3e9] text-[#26745a]",
  "bg-[#f0e2f7] text-[#774694]",
];

function formatDelta(value: number | null) {
  if (value === null) return { label: "New", positive: true, isNew: true };
  const rounded = Math.round(value * 10) / 10;
  return { label: `${Math.abs(rounded)}%`, positive: rounded >= 0, isNew: false };
}

function isOverdue(task: TaskView, now: Date) {
  return !task.completed && Boolean(task.dueAt) && new Date(task.dueAt as string).getTime() <= now.getTime();
}

export default function CrmDashboard({ deals, contacts, tasks, activity, previousSnapshot }: DashboardProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notificationContainerRef = useRef<HTMLDivElement>(null);
  const profileContainerRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<ViewName>("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftStage, setDraftStage] = useState("new");
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<DealView | null>(null);
  const [editingContact, setEditingContact] = useState<ContactView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localDeals, setLocalDeals] = useState(deals);
  const [localTasks, setLocalTasks] = useState(tasks);
  const [localContacts, setLocalContacts] = useState(contacts);
  const [isPending, startTransition] = useTransition();

  // Re-sync local (optimistic) state whenever fresh server props arrive
  // (after router.refresh()). Setting state during render — rather than in
  // an effect — avoids an extra render pass; this is the pattern React docs
  // recommend for "adjust state when a prop changes".
  const [syncedDeals, setSyncedDeals] = useState(deals);
  if (syncedDeals !== deals) {
    setSyncedDeals(deals);
    setLocalDeals(deals);
  }
  const [syncedTasks, setSyncedTasks] = useState(tasks);
  if (syncedTasks !== tasks) {
    setSyncedTasks(tasks);
    setLocalTasks(tasks);
  }
  const [syncedContacts, setSyncedContacts] = useState(contacts);
  if (syncedContacts !== contacts) {
    setSyncedContacts(contacts);
    setLocalContacts(contacts);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && ["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        setActiveView(navItems[Number(event.key) - 1].label);
      }
      if (event.key === "Escape") {
        setCreateOpen(false);
        setNotificationOpen(false);
        setProfileOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Click-outside handling: previously these dropdowns only closed on
  // Escape, so clicking anywhere else on the page left them open.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (searchOpen && searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (
        notificationOpen &&
        notificationContainerRef.current &&
        !notificationContainerRef.current.contains(target)
      ) {
        setNotificationOpen(false);
      }
      if (profileOpen && profileContainerRef.current && !profileContainerRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [searchOpen, notificationOpen, profileOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const metrics = useMemo(() => computeCoreMetrics(localDeals), [localDeals]);

  const deltas = useMemo(
    () => ({
      pipeline: percentDelta(metrics.pipeline, previousSnapshot?.pipeline),
      forecast: percentDelta(metrics.forecast, previousSnapshot?.forecast),
      winRate: percentDelta(metrics.winRate, previousSnapshot?.winRate),
      avgCycleDays: percentDelta(metrics.avgCycleDays ?? 0, previousSnapshot?.avgCycleDays),
    }),
    [metrics, previousSnapshot],
  );

  // Automatic notifications: any incomplete task whose real due date has
  // already passed becomes a live reminder, computed fresh on every render
  // rather than needing a background job.
  const overdueTasks = useMemo(() => {
    const now = new Date();
    return localTasks.filter((task) => isOverdue(task, now));
  }, [localTasks]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return { deals: [] as DealView[], contacts: [] as ContactView[], tasks: [] as TaskView[] };
    return {
      deals: localDeals
        .filter((deal) => `${deal.title} ${deal.company} ${deal.contactName}`.toLowerCase().includes(normalized))
        .slice(0, 4),
      contacts: localContacts
        .filter((contact) => `${contact.name} ${contact.company} ${contact.email}`.toLowerCase().includes(normalized))
        .slice(0, 3),
      tasks: localTasks
        .filter((task) => `${task.title} ${task.company}`.toLowerCase().includes(normalized))
        .slice(0, 3),
    };
  }, [query, localDeals, localContacts, localTasks]);

  function openCreator(stage = "new") {
    setDraftStage(stage);
    setCreateOpen(true);
  }

  function changeView(view: ViewName) {
    setActiveView(view);
    setSidebarOpen(false);
    setQuery("");
    setSearchOpen(false);
  }

  function handleMove(dealId: number, stage: string) {
    const previous = localDeals;
    const now = new Date().toISOString();
    setLocalDeals((current) =>
      current.map((deal) =>
        deal.id === dealId
          ? {
              ...deal,
              stage,
              probability: stage === "won" ? 100 : stage === "proposal" ? 75 : stage === "qualified" ? 45 : 20,
              lastContactAt: now,
              closedAt: stage === "won" ? now : null,
            }
          : deal,
      ),
    );
    startTransition(async () => {
      const result = await moveDeal(dealId, stage);
      if (!result.ok) {
        setLocalDeals(previous);
        setToast("The deal could not be moved. Try again.");
      } else {
        setToast(`Deal moved to ${stageConfig.find((item) => item.key === stage)?.label}.`);
        router.refresh();
      }
    });
  }

  function handleDeleteDeal(dealId: number) {
    if (!window.confirm("Delete this opportunity? This can't be undone.")) return;
    const previous = localDeals;
    setLocalDeals((current) => current.filter((deal) => deal.id !== dealId));
    startTransition(async () => {
      const result = await deleteDeal(dealId);
      if (!result.ok) {
        setLocalDeals(previous);
        setToast("Could not delete the opportunity. Try again.");
      } else {
        setToast("Opportunity deleted.");
        router.refresh();
      }
    });
  }

  function handleDeleteContact(contactId: number) {
    if (!window.confirm("Delete this contact? This can't be undone.")) return;
    const previous = localContacts;
    setLocalContacts((current) => current.filter((contact) => contact.id !== contactId));
    startTransition(async () => {
      const result = await deleteContact(contactId);
      if (!result.ok) {
        setLocalContacts(previous);
        setToast("Could not delete the contact. Try again.");
      } else {
        setToast("Contact deleted.");
        router.refresh();
      }
    });
  }

  function handleTaskToggle(taskId: number, completed: boolean) {
    const previous = localTasks;
    setLocalTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, completed } : task)),
    );
    startTransition(async () => {
      const result = await setTaskCompleted(taskId, completed);
      if (!result.ok) {
        setLocalTasks(previous);
        setToast("Task update failed. Try again.");
      } else {
        setToast(completed ? "Task completed." : "Task moved back to your list.");
        router.refresh();
      }
    });
  }

  function handleDeleteTask(taskId: number) {
    if (!window.confirm("Delete this task?")) return;
    const previous = localTasks;
    setLocalTasks((current) => current.filter((task) => task.id !== taskId));
    startTransition(async () => {
      const result = await deleteTask(taskId);
      if (!result.ok) {
        setLocalTasks(previous);
        setToast("Could not delete the task. Try again.");
      } else {
        setToast("Task deleted.");
        router.refresh();
      }
    });
  }

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-[#1f2429]">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-[#15181c]/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col border-r border-[#e6e8eb] bg-white transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[72px] items-center justify-between border-b border-[#eef0f2] px-5">
          <button className="flex items-center gap-3" onClick={() => changeView("Overview")}>
            <span className="brand-mark">
              <span />
              <span />
              <span />
            </span>
            <span className="text-[19px] font-bold tracking-[-0.04em]">Northstar</span>
          </button>
          <button
            className="icon-button lg:hidden"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="px-4 pt-4">
          <WorkspaceSwitcher current="sales" />
        </div>

        <div className="px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a2a8af]">
            Navigate
          </p>
          <nav className="space-y-1">
            {navItems.map(({ label, icon: Icon, shortcut }) => (
              <button
                key={label}
                onClick={() => changeView(label)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  activeView === label
                    ? "bg-[#eef6f2] text-[#17785a]"
                    : "text-[#687078] hover:bg-[#f5f6f7] hover:text-[#252a2f]"
                }`}
              >
                <Icon size={18} strokeWidth={activeView === label ? 2.3 : 1.8} />
                <span>{label}</span>
                {label === "Activities" && (
                  <span className="ml-auto rounded-md bg-[#f1d7c7] px-1.5 py-0.5 text-[10px] font-bold text-[#9b4d24]">
                    {localTasks.filter((task) => !task.completed).length}
                  </span>
                )}
                {shortcut && (
                  <span className="ml-auto text-[10px] font-medium text-[#b1b6bc] opacity-0 transition group-hover:opacity-100">
                    {shortcut}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="mx-4 border-t border-[#eef0f2] pt-5">
          <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a2a8af]">
            Team pipeline
          </p>
          <div className="rounded-2xl bg-[#f7f7f4] p-3.5">
            <div className="mb-2.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-[#555c62]">Monthly goal</span>
              <span className="font-bold text-[#20262a]">
                {Math.min(100, Math.round((metrics.wonValue / 180000) * 100))}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#e4e6e2]">
              <div
                className="h-full rounded-full bg-[#1d9a70]"
                style={{ width: `${Math.min(100, Math.round((metrics.wonValue / 180000) * 100))}%` }}
              />
            </div>
            <p className="mt-2.5 text-[11px] leading-4 text-[#858b91]">{money(metrics.wonValue, true)} z celu {money(180000, true)}</p>
          </div>
        </div>

        <div className="mt-auto border-t border-[#eef0f2] p-3">
          <button onClick={() => setSettingsOpen(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#687078] hover:bg-[#f5f6f7] hover:text-[#252a2f]">
            <Settings2 size={18} />
            Settings
          </button>
          <div className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#252b2f] text-xs font-bold text-white">AM</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Alex Morgan</p>
              <p className="truncate text-[11px] text-[#8e949a]">Sales lead</p>
            </div>
            <MoreHorizontal size={17} className="text-[#989ea4]" />
          </div>
        </div>
      </aside>

      <div className="lg:pl-[236px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-[#e6e8eb] bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            className="icon-button mr-2 lg:hidden"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div ref={searchContainerRef} className="relative w-full max-w-[420px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#858c92]" size={17} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search people, companies, deals..."
              className="h-10 w-full rounded-xl border border-transparent bg-[#f4f5f6] pl-10 pr-16 text-sm outline-none transition placeholder:text-[#9da3a8] focus:border-[#cfe3da] focus:bg-white focus:shadow-[0_0_0_3px_rgba(29,154,112,0.08)]"
            />
            <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-[#dde0e3] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#8c9298] sm:flex">
              <Command size={10} /> K
            </span>

            {searchOpen && query.trim() && (
              <SearchResults
                query={query}
                deals={results.deals}
                contacts={results.contacts}
                tasks={results.tasks}
                onClose={() => setSearchOpen(false)}
                onNavigate={changeView}
              />
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div ref={notificationContainerRef} className="relative">
              <button
                className={`icon-button relative ${notificationOpen ? "bg-[#eef6f2] text-[#17785a]" : ""}`}
                aria-label="Notifications"
                onClick={() => {
                  setNotificationOpen((value) => !value);
                  setProfileOpen(false);
                }}
              >
                <Bell size={18} />
                {(overdueTasks.length > 0 || activity.length > 0) && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#e45c4b] ring-2 ring-white" />
                )}
              </button>
              {notificationOpen && (
                <Notifications activity={activity} overdueTasks={overdueTasks} onClose={() => setNotificationOpen(false)} />
              )}
            </div>
            <div className="mx-1 hidden h-6 w-px bg-[#e5e7e9] sm:block" />
            <button
              onClick={() => openCreator()}
              className="flex h-10 items-center gap-2 rounded-xl bg-[#1c8e68] px-3.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(28,142,104,0.18)] transition hover:-translate-y-0.5 hover:bg-[#177b5a] sm:px-4"
            >
              <Plus size={17} strokeWidth={2.5} />
              <span className="hidden sm:inline">New deal</span>
            </button>
            <div ref={profileContainerRef} className="relative">
              <button
                onClick={() => {
                  setProfileOpen((value) => !value);
                  setNotificationOpen(false);
                }}
                className="ml-0.5 flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-[#f4f5f6]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#efe4d8] text-[11px] font-extrabold text-[#795434]">AM</span>
                <ChevronDown size={14} className="hidden text-[#8c9298] sm:block" />
              </button>
              {profileOpen && (
                <ProfileMenu onOpenSettings={() => { setProfileOpen(false); setSettingsOpen(true); }} />
              )}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-72px)] p-4 sm:p-6 lg:p-8">
          {activeView === "Overview" && (
            <Overview
              deals={localDeals}
              tasks={localTasks}
              metrics={metrics}
              deltas={deltas}
              onCreate={openCreator}
              onViewChange={changeView}
              onTaskToggle={handleTaskToggle}
              onMove={handleMove}
              onLoadSample={() => {
                startTransition(async () => {
                  const result = await loadSampleData();
                  setToast(result.message ?? "Done.");
                  router.refresh();
                });
              }}
            />
          )}
          {activeView === "Pipeline" && (
            <PipelineView
              deals={localDeals}
              onCreate={openCreator}
              onMove={handleMove}
              onDelete={handleDeleteDeal}
              onEdit={setEditingDeal}
            />
          )}
          {activeView === "Contacts" && (
            <ContactsView
              contacts={localContacts}
              deals={localDeals}
              onAdd={() => setContactModalOpen(true)}
              onDelete={handleDeleteContact}
              onEdit={setEditingContact}
            />
          )}
          {activeView === "Activities" && (
            <ActivitiesView
              tasks={localTasks}
              onTaskToggle={handleTaskToggle}
              onSchedule={() => setTaskModalOpen(true)}
              onDelete={handleDeleteTask}
            />
          )}
          {activeView === "Reports" && <ReportsView deals={localDeals} metrics={metrics} />}
        </main>
      </div>

      {(createOpen || editingDeal) && (
        <CreateDealModal
          defaultStage={draftStage}
          editingDeal={editingDeal}
          onClose={() => {
            setCreateOpen(false);
            setEditingDeal(null);
          }}
          onSuccess={(message) => {
            setCreateOpen(false);
            setEditingDeal(null);
            setToast(message);
            router.refresh();
          }}
        />
      )}

      {(contactModalOpen || editingContact) && (
        <CreateContactModal
          editingContact={editingContact}
          onClose={() => {
            setContactModalOpen(false);
            setEditingContact(null);
          }}
          onSuccess={(message) => {
            setContactModalOpen(false);
            setEditingContact(null);
            setToast(message);
            router.refresh();
          }}
        />
      )}

      {taskModalOpen && (
        <CreateTaskModal
          onClose={() => setTaskModalOpen(false)}
          onSuccess={(message) => {
            setTaskModalOpen(false);
            setToast(message);
            router.refresh();
          }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          hasData={localDeals.length > 0 || localContacts.length > 0 || localTasks.length > 0}
          onClose={() => setSettingsOpen(false)}
          onLoadSample={() => {
            startTransition(async () => {
              const result = await loadSampleData();
              setSettingsOpen(false);
              setToast(result.message ?? "Done.");
              router.refresh();
            });
          }}
          onReset={() => {
            startTransition(async () => {
              const result = await resetWorkspace();
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

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
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

type CoreMetrics = ReturnType<typeof computeCoreMetrics>;
type Deltas = { pipeline: number | null; forecast: number | null; winRate: number | null; avgCycleDays: number | null };

function Overview({
  deals,
  tasks,
  metrics,
  deltas,
  onCreate,
  onViewChange,
  onTaskToggle,
  onMove,
  onLoadSample,
}: {
  deals: DealView[];
  tasks: TaskView[];
  metrics: CoreMetrics;
  deltas: Deltas;
  onCreate: (stage?: string) => void;
  onViewChange: (view: ViewName) => void;
  onTaskToggle: (id: number, completed: boolean) => void;
  onMove: (id: number, stage: string) => void;
  onLoadSample: () => void;
}) {
  const isEmpty = deals.length === 0 && tasks.length === 0;
  return (
    <div className="mx-auto max-w-[1480px] animate-page-in">
      {isEmpty && (
        <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-[#cfe7db] bg-[#eef8f3] p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#18805e]"><Sparkles size={18} /></span>
            <div>
              <p className="text-sm font-bold text-[#1c4c39]">Your workspace is empty</p>
              <p className="mt-0.5 text-xs text-[#3f6b57]">Load a sample pipeline to explore every feature, or start adding your own deals right away.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={onLoadSample} className="secondary-button">Load sample data</button>
            <button onClick={() => onCreate()} className="primary-button"><Plus size={16} /> Add my first deal</button>
          </div>
        </div>
      )}
      <PageHeading
        title="Good morning, Alex"
        description={`${todayLabel()} · Here's what needs your attention.`}
        action={
          <button
            onClick={() => onCreate()}
            className="secondary-button hidden sm:flex"
          >
            <Zap size={16} /> Quick add opportunity
          </button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Open pipeline"
          value={money(metrics.pipeline, true)}
          delta={deltas.pipeline}
          note={`${deals.filter((deal) => deal.stage !== "won").length} active opportunities`}
          icon={BriefcaseBusiness}
          accent="green"
        />
        <MetricCard
          label="Weighted forecast"
          value={money(metrics.forecast, true)}
          delta={deltas.forecast}
          note={`Against ${money(180000, true)} monthly goal`}
          icon={Target}
          accent="violet"
        />
        <MetricCard
          label="Win rate"
          value={`${metrics.winRate}%`}
          delta={deltas.winRate}
          note="Since last recorded day"
          icon={TrendingUp}
          accent="amber"
        />
        <MetricCard
          label="Avg. sales cycle"
          value={metrics.avgCycleDays !== null ? `${Math.round(metrics.avgCycleDays)}d` : "—"}
          delta={deltas.avgCycleDays}
          note={metrics.avgCycleDays !== null ? "From open to closed won" : "No closed deals yet"}
          icon={Clock3}
          accent="blue"
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.75fr)]">
        <RevenueChart deals={deals} />
        <PriorityCard deals={deals} onCreate={onCreate} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.75fr)]">
        <PipelineSnapshot deals={deals} onView={() => onViewChange("Pipeline")} onMove={onMove} />
        <TasksCard tasks={tasks} onView={() => onViewChange("Activities")} onTaskToggle={onTaskToggle} />
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  note,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  delta: number | null;
  note: string;
  icon: LucideIcon;
  accent: "green" | "violet" | "amber" | "blue";
}) {
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
        <div className={`grid h-9 w-9 place-items-center rounded-xl ${styles[accent]}`}>
          <Icon size={17} />
        </div>
        <span
          className={`flex items-center gap-1 text-[11px] font-bold ${
            parsed.isNew ? "text-[#8c9298]" : parsed.positive ? "text-[#19815f]" : "text-[#c04f3d]"
          }`}
        >
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

function RevenueChart({ deals }: { deals: DealView[] }) {
  const buckets = useMemo(() => revenueByMonth(deals, 6), [deals]);
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const max = Math.max(...buckets.map((bucket) => bucket.total), 1);

  const width = 720;
  const height = 210;
  const chartHeight = 185;
  const chartBottom = 7 + chartHeight; // matches the axis padding below
  const stepX = width / Math.max(buckets.length - 1, 1);

  const points = buckets.map((bucket, index) => {
    const x = index * stepX;
    const y = chartBottom - (bucket.total / max) * chartHeight;
    return { x, y };
  });

  const linePath = points
    .map((point, index) => (index === 0 ? `M${point.x},${point.y}` : `L${point.x},${point.y}`))
    .join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  const growth =
    buckets.length >= 2 && buckets[buckets.length - 2].total > 0
      ? ((buckets[buckets.length - 1].total - buckets[buckets.length - 2].total) /
          buckets[buckets.length - 2].total) *
        100
      : null;

  return (
    <article className="surface overflow-hidden p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold">Revenue performance</p>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-[27px] font-bold tracking-[-0.04em]">{money(total, true)}</span>
            {growth !== null && (
              <span className={`text-xs font-bold ${growth >= 0 ? "text-[#1b9069]" : "text-[#c04f3d]"}`}>
                {growth >= 0 ? "+" : ""}
                {Math.round(growth * 10) / 10}%
              </span>
            )}
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg border border-[#e3e5e7] px-2.5 py-1.5 text-[11px] font-semibold text-[#687078]">
          Last {buckets.length} months
        </span>
      </div>
      <div className="relative mt-5 h-[225px] w-full">
        <div className="absolute inset-0 flex flex-col justify-between pb-7 text-[10px] text-[#a7acb0]">
          {[max, max * 0.66, max * 0.33, 0].map((label, index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="w-9">{money(Math.round(label), true)}</span>
              <span className="h-px flex-1 bg-[#eef0f1]" />
            </div>
          ))}
        </div>
        {total > 0 ? (
          <svg viewBox={`0 0 ${width} ${height}`} className="absolute bottom-7 left-11 right-0 h-[185px] w-[calc(100%-44px)]" preserveAspectRatio="none" aria-label="Revenue trend chart">
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#39a982" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#39a982" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#revenueFill)" />
            <path d={linePath} fill="none" stroke="#1c956d" strokeWidth="3" strokeLinecap="round" />
            {points.length > 0 && (
              <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="5" fill="white" stroke="#1c956d" strokeWidth="3" />
            )}
          </svg>
        ) : (
          <div className="absolute bottom-7 left-11 right-0 flex h-[185px] items-center justify-center text-xs text-[#a1a6aa]">
            No closed-won revenue yet
          </div>
        )}
        <div className="absolute bottom-0 left-11 right-0 flex justify-between text-[10px] font-medium text-[#9ba0a5]">
          {buckets.map((bucket) => <span key={bucket.key}>{bucket.label}</span>)}
        </div>
      </div>
    </article>
  );
}

function PriorityCard({ deals, onCreate }: { deals: DealView[]; onCreate: (stage?: string) => void }) {
  const priority = useMemo(() => pickPriorityDeal(deals), [deals]);
  return (
    <article className="relative overflow-hidden rounded-[18px] bg-[#242a2e] p-5 text-white shadow-[0_12px_35px_rgba(31,37,41,0.14)] sm:p-6">
      <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full border-[36px] border-white/[0.035]" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold text-[#7ce1b9]">
            <Sparkles size={15} /> Smart priority
          </span>
          <MoreHorizontal size={18} className="text-white/40" />
        </div>
        <p className="mt-8 max-w-[260px] text-[22px] font-semibold leading-[1.25] tracking-[-0.03em]">
          {priority ? `${priority.company} is ready for a decision.` : "Your pipeline is ready for its next opportunity."}
        </p>
        <p className="mt-3 text-xs leading-5 text-white/55">
          {priority ? priorityReason(priority) : "Add a deal and Northstar will surface the best next action."}
        </p>
        <div className="my-5 h-px bg-white/10" />
        <div className="flex items-center justify-between">
          {priority ? (
            <div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-white/40">Potential value</p>
              <p className="mt-1 text-lg font-bold">{money(priority.value)}</p>
            </div>
          ) : <span />}
          <button
            onClick={() => (priority ? undefined : onCreate())}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#252b2f] transition hover:translate-x-0.5"
            aria-label={priority ? "Open priority" : "Create deal"}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}

function PipelineSnapshot({
  deals,
  onView,
  onMove,
}: {
  deals: DealView[];
  onView: () => void;
  onMove: (id: number, stage: string) => void;
}) {
  const visibleDeals = deals.filter((deal) => deal.stage !== "won").slice(0, 4);
  return (
    <article className="surface p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold tracking-[-0.02em]">Deals in motion</h2>
          <p className="mt-1 text-xs text-[#8a9095]">Your most active opportunities</p>
        </div>
        <button onClick={onView} className="text-button">View pipeline <ArrowRight size={14} /></button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[650px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#eef0f1] text-[10px] font-bold uppercase tracking-[0.11em] text-[#a0a5aa]">
              <th className="pb-3 font-bold">Opportunity</th>
              <th className="pb-3 font-bold">Stage</th>
              <th className="pb-3 font-bold">Value</th>
              <th className="pb-3 font-bold">Last contact</th>
              <th className="pb-3 text-right font-bold">Next</th>
            </tr>
          </thead>
          <tbody>
            {visibleDeals.map((deal, index) => {
              const stage = stageConfig.find((item) => item.key === deal.stage) ?? stageConfig[0];
              const nextStage = stageConfig[Math.min(stageConfig.findIndex((item) => item.key === deal.stage) + 1, 3)].key;
              return (
                <tr key={deal.id} className="border-b border-[#f0f1f2] last:border-0">
                  <td className="py-3.5">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold ${avatarColors[index % avatarColors.length]}`}>{deal.ownerInitials}</span>
                      <div>
                        <p className="text-xs font-bold text-[#343a3e]">{deal.title}</p>
                        <p className="mt-0.5 text-[10px] text-[#959ba0]">{deal.company}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#626a70]">
                      <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} /> {stage.label}
                    </span>
                  </td>
                  <td className="py-3.5 text-xs font-bold">{money(deal.value)}</td>
                  <td className="py-3.5 text-[11px] text-[#7f868c]">{relativeLabel(deal.lastContactAt)}</td>
                  <td className="py-3.5 text-right">
                    <button
                      disabled={deal.stage === "won"}
                      onClick={() => onMove(deal.id, nextStage)}
                      className="rounded-lg p-1.5 text-[#92989d] transition hover:bg-[#eef6f2] hover:text-[#17805e] disabled:opacity-30"
                      aria-label="Advance deal"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {visibleDeals.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-[#8c9297]">No open opportunities.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TasksCard({
  tasks,
  onView,
  onTaskToggle,
}: {
  tasks: TaskView[];
  onView: () => void;
  onTaskToggle: (id: number, completed: boolean) => void;
}) {
  const openTasks = tasks.filter((task) => !task.completed).slice(0, 4);
  return (
    <article className="surface p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold tracking-[-0.02em]">Up next</h2>
          <p className="mt-1 text-xs text-[#8a9095]">{openTasks.length} actions need attention</p>
        </div>
        <button onClick={onView} className="text-button">All tasks <ArrowRight size={14} /></button>
      </div>
      <div className="mt-4 space-y-1">
        {openTasks.map((task) => (
          <div key={task.id} className="group flex items-start gap-3 rounded-xl px-1 py-2.5">
            <button
              onClick={() => onTaskToggle(task.id, true)}
              aria-label={`Complete ${task.title}`}
              className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border border-[#cfd3d6] text-transparent transition hover:border-[#1c926b] hover:text-[#1c926b]"
            >
              <Check size={12} strokeWidth={3} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#3d4348]">{task.title}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[#989da2]">
                <span className="text-[#697177]">{task.company}</span>
                <span>·</span>
                <span>{task.dueLabel}</span>
              </p>
            </div>
            <TaskIcon type={task.type} />
          </div>
        ))}
        {openTasks.length === 0 && <p className="py-6 text-center text-xs text-[#8c9297]">Nothing pending. Nice work.</p>}
      </div>
    </article>
  );
}

type SortKey = "value" | "company" | "lastContact" | "probability";

function PipelineView({
  deals,
  onCreate,
  onMove,
  onDelete,
  onEdit,
}: {
  deals: DealView[];
  onCreate: (stage?: string) => void;
  onMove: (id: number, stage: string) => void;
  onDelete: (id: number) => void;
  onEdit: (deal: DealView) => void;
}) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [sortKey, setSortKey] = useState<SortKey>("lastContact");
  const [sortDesc, setSortDesc] = useState(true);
  const openValue = deals.filter((deal) => deal.stage !== "won").reduce((sum, deal) => sum + deal.value, 0);

  function drop(event: DragEvent<HTMLDivElement>, stage: string) {
    event.preventDefault();
    if (draggedId !== null) onMove(draggedId, stage);
    setDraggedId(null);
    setOverStage(null);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((value) => !value);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const sortedDeals = useMemo(() => {
    const copy = [...deals];
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === "value") diff = a.value - b.value;
      else if (sortKey === "company") diff = a.company.localeCompare(b.company);
      else if (sortKey === "probability") diff = a.probability - b.probability;
      else diff = new Date(a.lastContactAt).getTime() - new Date(b.lastContactAt).getTime();
      return sortDesc ? -diff : diff;
    });
    return copy;
  }, [deals, sortKey, sortDesc]);

  return (
    <div className="mx-auto max-w-[1600px] animate-page-in">
      <PageHeading
        eyebrow="Revenue workspace"
        title="Sales pipeline"
        description={`${deals.length} opportunities · ${money(openValue)} open value`}
        action={
          <button onClick={() => onCreate()} className="primary-button"><Plus size={17} /> New opportunity</button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5e7e8] bg-white px-4 py-3">
        <div className="flex items-center gap-1 rounded-lg bg-[#f4f5f6] p-1">
          <button
            onClick={() => setViewMode("kanban")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${viewMode === "kanban" ? "bg-white text-[#17785a] shadow-sm" : "text-[#767d83]"}`}
          >
            <Columns3 size={14} /> Kanban
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${viewMode === "list" ? "bg-white text-[#17785a] shadow-sm" : "text-[#767d83]"}`}
          >
            <Rows3 size={14} /> Lista
          </button>
        </div>
        {viewMode === "kanban" && (
          <p className="flex items-center gap-2 text-[11px] text-[#8b9298]"><GripVertical size={14} /> Drag cards to update their stage</p>
        )}
      </div>

      {viewMode === "kanban" ? (
        <div className="grid items-start gap-3 overflow-x-auto pb-4 xl:grid-cols-4">
          {stageConfig.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.stage === stage.key);
            const total = stageDeals.reduce((sum, deal) => sum + deal.value, 0);
            return (
              <div
                key={stage.key}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverStage(stage.key);
                }}
                onDragLeave={() => setOverStage(null)}
                onDrop={(event) => drop(event, stage.key)}
                className={`min-w-[285px] rounded-[18px] border p-3 transition ${
                  overStage === stage.key ? "border-[#81c2a9] bg-[#edf7f2]" : "border-[#e5e7e8] bg-[#f0f1f2]/70"
                }`}
              >
                <div className="mb-3 flex items-center justify-between px-1 py-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                    <h2 className="text-xs font-bold text-[#454c51]">{stage.label}</h2>
                    <span className="text-[10px] font-bold text-[#a0a5aa]">{stageDeals.length}</span>
                  </div>
                  <span className="text-[11px] font-bold text-[#70777d]">{money(total, true)}</span>
                </div>
                <div className="space-y-2.5">
                  {stageDeals.map((deal, index) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      colorIndex={index}
                      dragging={draggedId === deal.id}
                      onDragStart={() => setDraggedId(deal.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setOverStage(null);
                      }}
                      onDelete={() => onDelete(deal.id)}
                      onEdit={() => onEdit(deal)}
                    />
                  ))}
                  <button
                    onClick={() => onCreate(stage.key)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#d3d7da] py-2.5 text-[11px] font-semibold text-[#8d9499] transition hover:border-[#91cbb5] hover:bg-white hover:text-[#167b5a]"
                  >
                    <Plus size={14} /> Add deal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DealsListView deals={sortedDeals} sortKey={sortKey} sortDesc={sortDesc} onSort={toggleSort} onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

function SortHeader({ label, active, desc, onClick }: { label: string; active: boolean; desc: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 font-bold ${active ? "text-[#17785a]" : "text-[#a0a5aa]"}`}>
      {label}
      {active && <ChevronDown size={12} className={`transition ${desc ? "" : "rotate-180"}`} />}
    </button>
  );
}

/** Bitrix-style flat deal list: every deal as one sortable row, with a
 * colored stage tile instead of hunting through kanban columns. */
function DealsListView({
  deals,
  sortKey,
  sortDesc,
  onSort,
  onEdit,
  onDelete,
}: {
  deals: DealView[];
  sortKey: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
  onEdit: (deal: DealView) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead className="bg-[#fafafa] text-[10px] uppercase tracking-[0.1em] text-[#9ca1a6]">
            <tr>
              <th className="px-5 py-3">Opportunity</th>
              <th className="px-5 py-3"><SortHeader label="Company" active={sortKey === "company"} desc={sortDesc} onClick={() => onSort("company")} /></th>
              <th className="px-5 py-3">Stage</th>
              <th className="px-5 py-3"><SortHeader label="Value" active={sortKey === "value"} desc={sortDesc} onClick={() => onSort("value")} /></th>
              <th className="px-5 py-3"><SortHeader label="Probability" active={sortKey === "probability"} desc={sortDesc} onClick={() => onSort("probability")} /></th>
              <th className="px-5 py-3"><SortHeader label="Last contact" active={sortKey === "lastContact"} desc={sortDesc} onClick={() => onSort("lastContact")} /></th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const stage = stageConfig.find((item) => item.key === deal.stage) ?? stageConfig[0];
              return (
                <tr key={deal.id} className="border-t border-[#eef0f1] transition hover:bg-[#fbfcfc]">
                  <td className="px-5 py-4"><p className="text-xs font-bold text-[#343a3e]">{deal.title}</p><p className="mt-0.5 text-[10px] text-[#959ba0]">{deal.contactName}</p></td>
                  <td className="px-5 py-4 text-xs font-semibold text-[#596168]">{deal.company}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: stage.color }}>
                      {stage.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs font-bold">{money(deal.value)}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-[#596168]">{deal.probability}%</td>
                  <td className="px-5 py-4 text-[11px] text-[#7f868c]">{relativeLabel(deal.lastContactAt)}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => onEdit(deal)} className="text-[#a0a5a9] hover:text-[#177b5a]" aria-label={`Edit ${deal.title}`}><Pencil size={15} /></button>
                      <button onClick={() => onDelete(deal.id)} className="text-[#a0a5a9] hover:text-[#c04f3d]" aria-label={`Delete ${deal.title}`}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {deals.length === 0 && <p className="py-16 text-center text-sm text-[#8c9297]">No opportunities yet.</p>}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  colorIndex,
  dragging,
  onDragStart,
  onDragEnd,
  onDelete,
  onEdit,
}: {
  deal: DealView;
  colorIndex: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group cursor-grab rounded-2xl border border-[#e4e6e8] bg-white p-4 shadow-[0_2px_8px_rgba(31,37,41,0.035)] transition active:cursor-grabbing ${dragging ? "rotate-1 scale-[1.02] opacity-60 shadow-xl" : "hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(31,37,41,0.07)]"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${deal.temperature === "Hot" ? "bg-[#fde9e2] text-[#b65438]" : "bg-[#f7f0dc] text-[#947020]"}`}>
          {deal.temperature}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button onClick={onEdit} className="text-[#a1a6aa] hover:text-[#177b5a]" aria-label="Edit deal">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="text-[#a1a6aa] hover:text-[#c04f3d]" aria-label="Delete deal">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <h3 className="mt-3 text-[13px] font-bold leading-5 text-[#30363a]">{deal.title}</h3>
      <p className="mt-1 text-[11px] text-[#8e9499]">{deal.company}</p>
      <p className="mt-4 text-lg font-bold tracking-[-0.03em]">{money(deal.value)}</p>
      <div className="my-3.5 h-px bg-[#f0f1f2]" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`grid h-7 w-7 place-items-center rounded-lg text-[9px] font-bold ${avatarColors[colorIndex % avatarColors.length]}`}>{deal.ownerInitials}</span>
          <span className="text-[10px] text-[#81888d]">{relativeLabel(deal.lastContactAt)}</span>
        </div>
        <span className="text-[10px] font-bold text-[#90969b]">{deal.probability}%</span>
      </div>
    </article>
  );
}

function ContactsView({
  contacts,
  deals,
  onAdd,
  onDelete,
  onEdit,
}: {
  contacts: ContactView[];
  deals: DealView[];
  onAdd: () => void;
  onDelete: (id: number) => void;
  onEdit: (contact: ContactView) => void;
}) {
  const [filter, setFilter] = useState("");
  const visible = contacts.filter((contact) =>
    `${contact.name} ${contact.company} ${contact.role}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-[1350px] animate-page-in">
      <PageHeading
        eyebrow="Relationship intelligence"
        title="People & contacts"
        description={`${contacts.length} active relationships across your workspace`}
        action={<button onClick={onAdd} className="primary-button"><Plus size={17} /> Add contact</button>}
      />
      <div className="surface overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-[#eceeef] p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="relative max-w-sm flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ba0a4]" />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter contacts" className="h-9 w-full rounded-lg bg-[#f4f5f6] pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[#d9eee6]" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-[#fafafa] text-[10px] uppercase tracking-[0.1em] text-[#9ca1a6]">
              <tr><th className="px-5 py-3 font-bold">Person</th><th className="px-5 py-3 font-bold">Company</th><th className="px-5 py-3 font-bold">Status</th><th className="px-5 py-3 font-bold">Open value</th><th className="px-5 py-3 font-bold">Contact</th><th className="px-5 py-3" /></tr>
            </thead>
            <tbody>
              {visible.map((contact, index) => {
                const contactDeals = deals.filter((deal) => deal.contactName === contact.name);
                return (
                  <tr key={contact.id} className="border-t border-[#eef0f1] transition hover:bg-[#fbfcfc]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-9 w-9 place-items-center rounded-xl text-[10px] font-bold ${avatarColors[index % avatarColors.length]}`}>{contact.initials}</span>
                        <div><p className="text-xs font-bold">{contact.name}</p><p className="mt-0.5 text-[10px] text-[#92989d]">{contact.role}</p></div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-[#596168]">{contact.company}</td>
                    <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#328064]"><span className="h-1.5 w-1.5 rounded-full bg-[#46b98e]" /> {contact.status}</span></td>
                    <td className="px-5 py-4 text-xs font-bold">{money(contactDeals.reduce((sum, deal) => sum + deal.value, 0))}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1">
                        <a href={`mailto:${contact.email}`} className="contact-button" aria-label={`Email ${contact.name}`}><Mail size={14} /></a>
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`} className="contact-button" aria-label={`Call ${contact.name}`}><Phone size={14} /></a>
                        ) : (
                          <span className="contact-button cursor-not-allowed opacity-30" aria-label="No phone on file"><Phone size={14} /></span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => onEdit(contact)} className="text-[#a0a5a9] hover:text-[#177b5a]" aria-label={`Edit ${contact.name}`}><Pencil size={15} /></button>
                        <button onClick={() => onDelete(contact.id)} className="text-[#a0a5a9] hover:text-[#c04f3d]" aria-label={`Delete ${contact.name}`}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 && <p className="py-16 text-center text-sm text-[#8c9297]">No contacts match &quot;{filter}&quot;.</p>}
        </div>
      </div>
    </div>
  );
}

function ActivitiesView({
  tasks,
  onTaskToggle,
  onSchedule,
  onDelete,
}: {
  tasks: TaskView[];
  onTaskToggle: (id: number, completed: boolean) => void;
  onSchedule: () => void;
  onDelete: (id: number) => void;
}) {
  const completed = tasks.filter((task) => task.completed).length;
  const now = new Date();
  return (
    <div className="mx-auto max-w-[1150px] animate-page-in">
      <PageHeading
        eyebrow="Daily focus"
        title="Activities"
        description={`${tasks.length - completed} open tasks · ${completed} completed`}
        action={<button onClick={onSchedule} className="primary-button"><Plus size={17} /> Schedule activity</button>}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="surface p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-[#eceeef] pb-4">
            <div><h2 className="text-sm font-bold">Today&apos;s focus</h2><p className="mt-1 text-[11px] text-[#92989d]">All scheduled activities</p></div>
            <span className="rounded-lg bg-[#eef6f2] px-2.5 py-1.5 text-[10px] font-bold text-[#21805f]">{Math.round((completed / Math.max(tasks.length, 1)) * 100)}% complete</span>
          </div>
          <div className="mt-2 divide-y divide-[#eef0f1]">
            {tasks.map((task) => {
              const overdue = isOverdue(task, now);
              return (
                <div key={task.id} className={`group flex items-center gap-4 py-4 transition ${task.completed ? "opacity-55" : ""}`}>
                  <button
                    onClick={() => onTaskToggle(task.id, !task.completed)}
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${task.completed ? "border-[#1e9870] bg-[#1e9870] text-white" : "border-[#cfd3d6] text-transparent hover:border-[#1e9870] hover:text-[#1e9870]"}`}
                    aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
                  ><Check size={14} strokeWidth={3} /></button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${task.completed ? "line-through" : ""}`}>{task.title}</p>
                    <p className="mt-1 text-[11px] text-[#91979c]">
                      {task.company} · {task.dueLabel}
                      {overdue && <span className="ml-1.5 font-bold text-[#c04f3d]">· Overdue</span>}
                    </p>
                  </div>
                  <span className="hidden rounded-lg bg-[#f5f6f6] px-2.5 py-1.5 text-[10px] font-semibold text-[#687078] sm:flex sm:items-center sm:gap-1.5"><TaskIcon type={task.type} /> {task.type}</span>
                  <button onClick={() => onDelete(task.id)} className="text-[#9ca2a6] opacity-0 transition hover:text-[#c04f3d] group-hover:opacity-100" aria-label={`Delete ${task.title}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
            {tasks.length === 0 && <p className="py-10 text-center text-xs text-[#8c9297]">No activities yet.</p>}
          </div>
        </article>
        <aside className="space-y-4">
          <article className="rounded-[18px] bg-[#e8efe9] p-5">
            <Sparkles size={17} className="text-[#257d5f]" />
            <p className="mt-3 text-sm font-bold">Stay on top of today</p>
            <p className="mt-1.5 text-[11px] leading-5 text-[#6d7972]">
              {tasks.length - completed > 0
                ? `You have ${tasks.length - completed} open task${tasks.length - completed === 1 ? "" : "s"} left today.`
                : "Everything's handled for today."}
            </p>
          </article>
        </aside>
      </div>
    </div>
  );
}

function ReportsView({
  deals,
  metrics,
}: {
  deals: DealView[];
  metrics: CoreMetrics;
}) {
  return (
    <div className="mx-auto max-w-[1350px] animate-page-in">
      <PageHeading
        eyebrow="Decision intelligence"
        title="Revenue reports"
        description="A clear view of performance, conversion, and forecast health"
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Revenue closed" value={money(metrics.wonValue, true)} delta={null} note="Total closed-won value" icon={CheckCircle2} accent="green" />
        <MetricCard label="Forecast coverage" value={`${Math.round((metrics.pipeline / 180000) * 10) / 10}×`} delta={null} note="Healthy coverage is 3×" icon={Target} accent="violet" />
        <MetricCard label="Weighted forecast" value={money(metrics.forecast, true)} delta={null} note="Pipeline value × stage probability" icon={Activity} accent="blue" />
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]">
        <RevenueChart deals={deals} />
        <article className="surface p-5 sm:p-6">
          <h2 className="text-sm font-bold">Stage conversion</h2>
          <p className="mt-1 text-[11px] text-[#91979c]">Opportunity-to-win flow</p>
          <div className="mt-7 space-y-5">
            {stageConfig.map((stage) => {
              const count = deals.filter((deal) => deal.stage === stage.key).length;
              const percent = deals.length ? Math.round((count / deals.length) * 100) : 0;
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
  const Icon = type === "Call" ? Phone : type === "Email" ? Mail : type === "Meeting" ? UsersRound : MessageSquareText;
  return <Icon size={14} className="text-[#9aa0a5]" />;
}

function SearchResults({
  query,
  deals,
  contacts,
  tasks,
  onClose,
  onNavigate,
}: {
  query: string;
  deals: DealView[];
  contacts: ContactView[];
  tasks: TaskView[];
  onClose: () => void;
  onNavigate: (view: ViewName) => void;
}) {
  const empty = deals.length === 0 && contacts.length === 0 && tasks.length === 0;
  return (
    <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-[#e0e3e5] bg-white shadow-[0_18px_50px_rgba(30,36,40,0.14)] animate-pop-in">
      <div className="flex items-center justify-between border-b border-[#eceeef] px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#999fa4]">Search results</span>
        <button onClick={onClose}><X size={14} className="text-[#9aa0a5]" /></button>
      </div>
      <div className="max-h-[390px] overflow-y-auto p-2">
        {empty && <p className="px-3 py-8 text-center text-xs text-[#858c92]">No results found for &quot;{query}&quot;</p>}
        {deals.length > 0 && (
          <div>
            <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#a1a6aa]">Deals</p>
            {deals.map((deal) => (
              <button key={deal.id} onClick={() => onNavigate("Pipeline")} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#f5f7f6]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e8f2ed] text-[#217c5e]"><BriefcaseBusiness size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{deal.title}</span><span className="mt-0.5 block text-[10px] text-[#90969b]">{deal.company} · {money(deal.value)}</span></span>
                <ChevronRight size={14} className="text-[#a1a6aa]" />
              </button>
            ))}
          </div>
        )}
        {contacts.length > 0 && (
          <div>
            <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#a1a6aa]">People</p>
            {contacts.map((contact, index) => (
              <button key={contact.id} onClick={() => onNavigate("Contacts")} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#f5f7f6]">
                <span className={`grid h-8 w-8 place-items-center rounded-lg text-[9px] font-bold ${avatarColors[index % avatarColors.length]}`}>{contact.initials}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{contact.name}</span><span className="mt-0.5 block text-[10px] text-[#90969b]">{contact.role} · {contact.company}</span></span>
                <ChevronRight size={14} className="text-[#a1a6aa]" />
              </button>
            ))}
          </div>
        )}
        {tasks.length > 0 && (
          <div>
            <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#a1a6aa]">Tasks</p>
            {tasks.map((task) => (
              <button key={task.id} onClick={() => onNavigate("Activities")} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#f5f7f6]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f5f0e0] text-[#9b6a1f]"><TaskIcon type={task.type} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{task.title}</span><span className="mt-0.5 block text-[10px] text-[#90969b]">{task.company} · {task.dueLabel}</span></span>
                <ChevronRight size={14} className="text-[#a1a6aa]" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const activityIcon: Record<string, LucideIcon> = {
  deal: TrendingUp,
  contact: UsersRound,
  task: CheckCircle2,
  system: Sparkles,
};
const activityColor: Record<string, string> = {
  deal: "bg-[#e3f2eb] text-[#1b805e]",
  contact: "bg-[#eee9fa] text-[#6f52ae]",
  task: "bg-[#f9ecd9] text-[#986618]",
  system: "bg-[#e6eef8] text-[#426a97]",
};

function Notifications({
  activity,
  overdueTasks,
  onClose,
}: {
  activity: ActivityEntry[];
  overdueTasks: TaskView[];
  onClose: () => void;
}) {
  const empty = activity.length === 0 && overdueTasks.length === 0;
  return (
    <div className="absolute right-0 top-12 z-50 w-[320px] overflow-hidden rounded-2xl border border-[#e1e3e5] bg-white shadow-[0_18px_50px_rgba(30,36,40,0.14)] animate-pop-in sm:w-[355px]">
      <div className="flex items-center justify-between border-b border-[#eceeef] px-4 py-3.5"><div><p className="text-sm font-bold">Notifications</p><p className="mt-0.5 text-[10px] text-[#92989c]">Recent activity in your workspace</p></div><button onClick={onClose}><X size={15} className="text-[#959ba0]" /></button></div>
      <div className="max-h-[380px] overflow-y-auto p-2">
        {empty && <p className="px-3 py-8 text-center text-xs text-[#8c9297]">Nothing yet — activity shows up here as you work.</p>}
        {overdueTasks.length > 0 && (
          <div className="mb-1">
            <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#c04f3d]">Overdue tasks</p>
            {overdueTasks.map((task) => (
              <div key={`due-${task.id}`} className="flex w-full gap-3 rounded-xl p-2.5 text-left">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fdeeea] text-[#c04f3d]"><Clock3 size={15} /></span>
                <span><span className="block text-xs font-semibold leading-5">{task.title}</span><span className="mt-0.5 block text-[10px] text-[#979da2]">{task.company} · overdue</span></span>
              </div>
            ))}
          </div>
        )}
        {activity.map((entry) => {
          const Icon = activityIcon[entry.kind] ?? Sparkles;
          const color = activityColor[entry.kind] ?? activityColor.system;
          return (
            <div key={entry.id} className="flex w-full gap-3 rounded-xl p-2.5 text-left">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${color}`}><Icon size={15} /></span>
              <span><span className="block text-xs font-semibold leading-5">{entry.message}</span><span className="mt-0.5 block text-[10px] text-[#979da2]">{relativeLabel(entry.createdAt)}</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfileMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-[#e1e3e5] bg-white p-2 shadow-[0_18px_50px_rgba(30,36,40,0.14)] animate-pop-in">
      <div className="border-b border-[#eceeef] px-2 py-2.5"><p className="text-xs font-bold">Alex Morgan</p><p className="mt-0.5 text-[10px] text-[#92989d]">alex@northstar.co</p></div>
      <button onClick={onOpenSettings} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs font-semibold text-[#626a70] hover:bg-[#f5f6f7]">
        <Settings2 size={15} /> Account settings
      </button>
      <form action={logout}>
        <button type="submit" className="mt-1 w-full border-t border-[#eceeef] px-2 pt-3 pb-1 text-left text-xs font-semibold text-[#b24d41]">Sign out</button>
      </form>
    </div>
  );
}

function SettingsPanel({
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
                : "Load a realistic demo pipeline to explore every feature before adding your own deals."}
            </p>
            <button onClick={onLoadSample} className="secondary-button mt-3">
              <Sparkles size={15} /> Load sample data
            </button>
          </div>

          <div className="rounded-2xl border border-[#f3d9d2] bg-[#fff8f6] p-4">
            <p className="text-sm font-bold text-[#9a3f2f]">Danger zone</p>
            <p className="mt-1 text-xs leading-5 text-[#a8574a]">
              Permanently deletes every deal, contact, and task in this workspace. This can&apos;t be undone.
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

function CreateDealModal({
  defaultStage,
  editingDeal,
  onClose,
  onSuccess,
}: {
  defaultStage: string;
  editingDeal?: DealView | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editingDeal);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      title: String(data.get("title") ?? ""),
      company: String(data.get("company") ?? ""),
      contactName: String(data.get("contactName") ?? ""),
      email: String(data.get("email") ?? ""),
      value: Number(data.get("value") ?? 0),
      stage: String(data.get("stage") ?? "new"),
      notes: String(data.get("notes") ?? ""),
    };
    const result = editingDeal ? await updateDeal(editingDeal.id, payload) : await createDeal(payload);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message ?? "Could not save this opportunity.");
      return;
    }
    onSuccess(result.message ?? "Opportunity saved.");
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]">
              {isEditing ? <Pencil size={13} /> : <Sparkles size={13} />} {isEditing ? "Edit opportunity" : "New opportunity"}
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em]">{isEditing ? "Update this deal" : "Add a deal to your pipeline"}</h2>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2"><span>Opportunity name</span><input name="title" required autoFocus defaultValue={editingDeal?.title} placeholder="e.g. Enterprise rollout" /></label>
            <label className="field"><span>Company</span><input name="company" required defaultValue={editingDeal?.company} placeholder="Acme, Inc." /></label>
            <label className="field"><span>Deal value</span><input name="value" type="number" min="1" required defaultValue={editingDeal?.value} placeholder="25 000" /></label>
            <label className="field"><span>Contact name</span><input name="contactName" required defaultValue={editingDeal?.contactName} placeholder="Jordan Lee" /></label>
            <label className="field"><span>Email</span><input name="email" type="email" required defaultValue={editingDeal?.email} placeholder="jordan@company.com" /></label>
            <label className="field sm:col-span-2"><span>Pipeline stage</span><select name="stage" defaultValue={editingDeal?.stage ?? defaultStage}>{stageConfig.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></label>
            <label className="field sm:col-span-2"><span>Notes</span><textarea name="notes" rows={3} defaultValue={editingDeal?.notes ?? ""} placeholder="Any context worth remembering about this deal..." /></label>
          </div>
          {error && <p className="mt-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">{error}</p>}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eef0f1] pt-5">
            <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
            <button type="submit" disabled={submitting} className="primary-button min-w-[140px] justify-center disabled:opacity-60">
              {submitting ? (
                <><LoaderCircle size={16} className="animate-spin" /> {isEditing ? "Saving..." : "Creating..."}</>
              ) : isEditing ? (
                <><Pencil size={16} /> Save changes</>
              ) : (
                <><Plus size={16} /> Create deal</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateContactModal({
  editingContact,
  onClose,
  onSuccess,
}: {
  editingContact?: ContactView | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editingContact);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? ""),
      company: String(data.get("company") ?? ""),
      role: String(data.get("role") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
    };
    const result = editingContact ? await updateContact(editingContact.id, payload) : await createContact(payload);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message ?? "Could not save this contact.");
      return;
    }
    onSuccess(result.message ?? "Contact saved.");
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]">
              {isEditing ? <Pencil size={13} /> : <UsersRound size={13} />} {isEditing ? "Edit contact" : "New contact"}
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em]">{isEditing ? "Update this contact" : "Add a person to your workspace"}</h2>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2"><span>Full name</span><input name="name" required autoFocus defaultValue={editingContact?.name} placeholder="Jordan Lee" /></label>
            <label className="field"><span>Company</span><input name="company" required defaultValue={editingContact?.company} placeholder="Acme, Inc." /></label>
            <label className="field"><span>Role</span><input name="role" required defaultValue={editingContact?.role} placeholder="VP of Sales" /></label>
            <label className="field"><span>Email</span><input name="email" type="email" required defaultValue={editingContact?.email} placeholder="jordan@company.com" /></label>
            <label className="field"><span>Phone (optional)</span><input name="phone" type="tel" defaultValue={editingContact?.phone ?? ""} placeholder="+48 500 000 000" /></label>
          </div>
          {error && <p className="mt-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">{error}</p>}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#eef0f1] pt-5">
            <button type="button" onClick={onClose} className="secondary-button">Cancel</button>
            <button type="submit" disabled={submitting} className="primary-button min-w-[140px] justify-center disabled:opacity-60">
              {submitting ? (
                <><LoaderCircle size={16} className="animate-spin" /> {isEditing ? "Saving..." : "Creating..."}</>
              ) : isEditing ? (
                <><Pencil size={16} /> Save changes</>
              ) : (
                <><Plus size={16} /> Add contact</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateTaskModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const result = await createTask({
      title: String(data.get("title") ?? ""),
      company: String(data.get("company") ?? ""),
      type: String(data.get("type") ?? "Call"),
      dueLabel: String(data.get("dueLabel") ?? ""),
      dueAt: String(data.get("dueAt") ?? ""),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message ?? "Could not schedule this activity.");
      return;
    }
    onSuccess(result.message ?? "Activity scheduled.");
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#15191d]/40 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-white/60 bg-white shadow-[0_28px_80px_rgba(20,25,28,0.22)] animate-modal-in">
        <div className="flex items-start justify-between border-b border-[#eceeef] px-5 py-5 sm:px-6">
          <div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#18805e]"><CalendarDays size={13} /> New activity</p><h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em]">Schedule an activity</h2></div>
          <button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2"><span>Title</span><input name="title" required autoFocus placeholder="e.g. Discovery call" /></label>
            <label className="field"><span>Company</span><input name="company" required placeholder="Acme, Inc." /></label>
            <label className="field"><span>Type</span><select name="type" defaultValue="Call"><option>Call</option><option>Email</option><option>Meeting</option><option>Message</option></select></label>
            <label className="field"><span>Due (display text)</span><input name="dueLabel" required placeholder="e.g. Tomorrow, 2:00 PM" /></label>
            <label className="field sm:col-span-2"><span>Exact due date (optional, powers automatic reminders)</span><input name="dueAt" type="datetime-local" /></label>
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
