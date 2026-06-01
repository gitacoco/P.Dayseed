"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Inbox,
  Leaf,
  ListChecks,
  Minus,
  MoreVertical,
  PanelLeftClose,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Sprout,
  Square,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { endOfMonth, endOfWeek, format, isSameDay, isWithinInterval, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { GardenCanvas } from "@/components/GardenCanvas";
import { TomatoTree3D } from "@/components/TomatoTree3D";
import { dateKey, monthTitle, yearTitle } from "@/lib/dates";
import { formatRemaining, remainingSeconds } from "@/lib/timer";
import { useDayseedStore, type TaskInput } from "@/store/dayseedStore";
import type {
  Category,
  DailyGoalSettings,
  DailyPlant,
  GardenViewMode,
  PomodoroSession,
  Task,
  TomatoFruit,
  UserProfile,
} from "@/types/dayseed";

type AppSection = "tasks" | "yard";
type TaskFilter = "inbox" | "today" | "week" | "month" | "all";
type YardScale = "year" | "month" | "week";

const FILTERS: { id: TaskFilter; label: string; icon: React.ReactNode }[] = [
  { id: "inbox", label: "Inbox", icon: <Inbox size={22} strokeWidth={1.6} /> },
  { id: "today", label: "Today", icon: <Sprout size={23} strokeWidth={1.6} /> },
  { id: "week", label: "This Week", icon: <CalendarDays size={22} strokeWidth={1.6} /> },
  { id: "month", label: "This Month", icon: <Leaf size={22} strokeWidth={1.6} /> },
  { id: "all", label: "All", icon: <ListChecks size={22} strokeWidth={1.6} /> },
];

const YARD_SCALES: { id: YardScale; label: string; viewMode: GardenViewMode }[] = [
  { id: "year", label: "This year", viewMode: "year" },
  { id: "month", label: "This month", viewMode: "month" },
  { id: "week", label: "This week", viewMode: "week" },
];

const AVATAR_COLORS = ["#003c33", "#6f8c62", "#d84d32", "#7a4b77", "#2f5f88"];

function firstInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "N";
}

function TomatoMark({
  color,
  empty = false,
  small = false,
  striped = false,
}: {
  color: string;
  empty?: boolean;
  small?: boolean;
  striped?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`tomato-mark ${empty ? "is-empty" : ""} ${small ? "is-small" : ""} ${striped ? "is-striped" : ""}`}
      style={{ "--swatch": color } as React.CSSProperties}
    />
  );
}

function goalForDate(settings: DailyGoalSettings, date: string) {
  return settings.overrides[date] ?? settings.defaultGoal;
}

function useClock(activeTimerId?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [activeTimerId]);

  return now;
}

let whiteNoiseAudio: {
  context: AudioContext;
  source: AudioBufferSourceNode;
  gain: GainNode;
} | null = null;

function stopWhiteNoise() {
  try {
    whiteNoiseAudio?.source.stop();
  } catch {
    // The node may already be stopped by the browser.
  }
  void whiteNoiseAudio?.context.close();
  whiteNoiseAudio = null;
}

function startWhiteNoise() {
  if (whiteNoiseAudio) {
    return true;
  }

  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return false;
  }

  const context = new AudioContextConstructor();
  const durationSeconds = 2;
  const buffer = context.createBuffer(2, context.sampleRate * durationSeconds, context.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = buffer;
  source.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  gain.gain.value = 0.045;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start();
  whiteNoiseAudio = { context, gain, source };

  return true;
}

function WhiteNoiseButton({ compact = false }: { compact?: boolean }) {
  const playing = useDayseedStore((state) => state.whiteNoisePlaying);
  const setWhiteNoisePlaying = useDayseedStore((state) => state.setWhiteNoisePlaying);
  const toggleNoise = () => {
    if (playing) {
      stopWhiteNoise();
      setWhiteNoisePlaying(false);
      return;
    }

    setWhiteNoisePlaying(startWhiteNoise());
  };

  return (
    <button
      aria-label="White Noise"
      className={`white-noise-button ${compact ? "is-compact" : ""} ${playing ? "is-active" : ""}`}
      onClick={toggleNoise}
      type="button"
    >
      {playing ? <VolumeX size={18} /> : <Volume2 size={18} />}
      <span>White Noise</span>
    </button>
  );
}

function AppHeader({
  section,
  setSection,
  userProfile,
  updateUserProfile,
}: {
  section: AppSection;
  setSection: (section: AppSection) => void;
  userProfile: UserProfile;
  updateUserProfile: (patch: Partial<UserProfile>) => void;
}) {
  const avatarStyle = { "--avatar": userProfile.avatarColor } as React.CSSProperties;
  const whiteNoisePlaying = useDayseedStore((state) => state.whiteNoisePlaying);
  const avatarImageStyle = userProfile.avatarDataUrl
    ? ({
        ...avatarStyle,
        backgroundImage: `url(${userProfile.avatarDataUrl})`,
      } as React.CSSProperties)
    : avatarStyle;

  const uploadAvatar = (file?: File) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => updateUserProfile({ avatarDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <header className="app-header">
      <button className="wordmark" onClick={() => setSection("tasks")} type="button">
        <Sprout size={42} strokeWidth={1.35} />
        <span>Dayseed</span>
      </button>
      <nav className="top-switch" aria-label="Primary">
        <button
          className={section === "tasks" ? "is-active" : ""}
          onClick={() => setSection("tasks")}
          type="button"
        >
          Tasks
        </button>
        <button
          className={section === "yard" ? "is-active" : ""}
          onClick={() => setSection("yard")}
          type="button"
        >
          Yard
        </button>
      </nav>
      <div className="header-actions">
        {whiteNoisePlaying ? <WhiteNoiseButton compact /> : null}
        <details className="profile-menu">
          <summary className="profile-chip" aria-label="Current user">
            <span style={avatarImageStyle}>{userProfile.avatarDataUrl ? null : firstInitial(userProfile.displayName)}</span>
            <strong>{userProfile.displayName}</strong>
            <ChevronDown size={18} strokeWidth={1.7} />
          </summary>
          <div className="profile-popover">
            <label className="field-label">
              <span>Name</span>
              <input
                aria-label="User name"
                onChange={(event) => updateUserProfile({ displayName: event.target.value })}
                value={userProfile.displayName}
              />
            </label>
            <div className="avatar-editor">
              <div className="avatar-preview" style={avatarImageStyle}>
                {userProfile.avatarDataUrl ? null : firstInitial(userProfile.displayName)}
              </div>
              <label className="quiet-action">
                <Upload size={15} />
                <span>Upload</span>
                <input
                  accept="image/*"
                  onChange={(event) => uploadAvatar(event.target.files?.[0])}
                  type="file"
                />
              </label>
              <button
                className="quiet-action"
                onClick={() => updateUserProfile({ avatarDataUrl: undefined })}
                type="button"
              >
                <ImageIcon size={15} />
                <span>Initial</span>
              </button>
            </div>
            <div className="avatar-colors" aria-label="Avatar color">
              {AVATAR_COLORS.map((color) => (
                <button
                  aria-label={`Use avatar color ${color}`}
                  className={userProfile.avatarColor === color ? "is-active" : ""}
                  key={color}
                  onClick={() => updateUserProfile({ avatarColor: color })}
                  style={{ "--avatar": color } as React.CSSProperties}
                  type="button"
                />
              ))}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

function categoriesById(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

function completedSessionsForTask(sessions: PomodoroSession[], taskId: string) {
  return sessions.filter((session) => session.taskId === taskId && session.status === "completed");
}

function fruitsForTask(
  fruits: TomatoFruit[],
  sessions: PomodoroSession[],
  taskId: string,
) {
  const sessionIds = new Set(completedSessionsForTask(sessions, taskId).map((session) => session.id));
  return fruits.filter((fruit) => sessionIds.has(fruit.pomodoroSessionId));
}

function primaryCategory(task: Task | undefined, categories: Category[]) {
  if (!task) {
    return categories[0];
  }

  return categories.find((category) => category.id === task.categoryIds[0]) ?? categories[0];
}

function TomatoTrail({
  task,
  categories,
  sessions,
  fruits,
  compact = false,
}: {
  task: Task;
  categories: Category[];
  sessions: PomodoroSession[];
  fruits: TomatoFruit[];
  compact?: boolean;
}) {
  const categoryMap = useMemo(() => categoriesById(categories), [categories]);
  const taskFruits = fruitsForTask(fruits, sessions, task.id);
  const estimate = task.estimatedPomodoros ?? 0;
  const minimumSlots = compact ? 1 : 3;
  const visibleCount = Math.max(taskFruits.length, estimate, minimumSlots, task.categoryIds.length > 0 ? 1 : 0);
  const fallbackCategory = primaryCategory(task, categories);
  const dots = Array.from({ length: Math.min(visibleCount, compact ? 8 : 12) });

  return (
    <div className={`tomato-trail ${compact ? "is-compact" : ""}`} aria-label="Tomatoes">
      {dots.map((_, index) => {
        const fruit = taskFruits[index];
        const category =
          fruit ? categoryMap.get(fruit.categoryId) : categoryMap.get(task.categoryIds[index % task.categoryIds.length]);
        const color = category?.color ?? fallbackCategory?.color ?? "#d84d32";
        const isActual = Boolean(fruit);

        return (
          <TomatoMark
            color={color}
            empty={!isActual}
            key={`${task.id}-${index}`}
            small={compact}
            striped={fruit?.variant === "striped" || category?.tomatoVariant === "striped"}
          />
        );
      })}
      {taskFruits.length > dots.length ? <span className="tomato-extra">+{taskFruits.length - dots.length}</span> : null}
    </div>
  );
}

function TaskFilterRail({
  activeFilter,
  setFilter,
  counts,
}: {
  activeFilter: TaskFilter;
  setFilter: (filter: TaskFilter) => void;
  counts: Record<TaskFilter, number>;
}) {
  return (
    <aside className="filter-rail" aria-label="Task filters">
      {FILTERS.map((filter) => (
        <button
          className={activeFilter === filter.id ? "is-active" : ""}
          key={filter.id}
          onClick={() => setFilter(filter.id)}
          type="button"
        >
          {filter.icon}
          <span>{filter.label}</span>
          <small>{counts[filter.id]}</small>
        </button>
      ))}
    </aside>
  );
}

function TaskComposer({
  selectedCategoryId,
  activeFilter,
  categories,
  addTask,
}: {
  selectedCategoryId?: string;
  activeFilter: TaskFilter;
  categories: Category[];
  addTask: (input: TaskInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState(activeFilter === "today" ? dateKey() : "");
  const [categoryId, setCategoryId] = useState(selectedCategoryId ?? categories[0]?.id ?? "");
  const [estimate, setEstimate] = useState(1);
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);

  const submitTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addTask({
      categoryIds: categoryId ? [categoryId] : [],
      estimatedPomodoros: estimate,
      notes,
      scheduledDate,
      title,
    });
    setTitle("");
    setNotes("");
    setEstimate(1);
    setScheduledDate(activeFilter === "today" ? dateKey() : "");
    setExpanded(false);
  };
  const handleTitleSubmit = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? categories[0];

  return (
    <form
      className={`task-composer ${expanded || title || notes ? "is-expanded" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setExpanded(Boolean(title || notes));
        }
      }}
      onFocus={() => setExpanded(true)}
      onSubmit={submitTask}
    >
      <div className="composer-main">
        <button aria-label="Add task" className="composer-plus" type="submit">
          <Plus size={24} strokeWidth={1.5} />
        </button>
        <input
          aria-label="Task title"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleTitleSubmit}
          placeholder={`Add a task${activeFilter === "today" ? " to Today" : ""}, press Enter to save`}
          value={title}
        />
        <div className="composer-estimate" aria-label="Estimated tomatoes">
          <button aria-label="Decrease estimate" onClick={() => setEstimate((value) => Math.max(0, value - 1))} type="button">
            <Minus size={14} />
          </button>
          <span>
            {Array.from({ length: Math.min(estimate, 5) }, (_, index) => (
              <TomatoMark
                color={selectedCategory?.color ?? "#d84d32"}
                key={index}
                small
                striped={selectedCategory?.tomatoVariant === "striped"}
              />
            ))}
            {estimate > 5 ? <small>+{estimate - 5}</small> : null}
          </span>
          <button aria-label="Increase estimate" onClick={() => setEstimate((value) => Math.min(12, value + 1))} type="button">
            <Plus size={14} />
          </button>
        </div>
        <label className="composer-date">
          <CalendarDays size={16} />
          <input
            aria-label="Task date"
            onChange={(event) => setScheduledDate(event.target.value)}
            type="date"
            value={scheduledDate}
          />
        </label>
      </div>
      <div className="composer-details">
        <label className="field-label">
          <span>Category</span>
          <select
            aria-label="Task category"
            onChange={(event) => setCategoryId(event.target.value)}
            value={categoryId}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label composer-notes">
          <span>Notes</span>
          <input
            aria-label="Task notes"
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional context"
            value={notes}
          />
        </label>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  categories,
  sessions,
  fruits,
  selected,
  selectTask,
  editTask,
  archiveTask,
}: {
  task: Task;
  categories: Category[];
  sessions: PomodoroSession[];
  fruits: TomatoFruit[];
  selected: boolean;
  selectTask: (taskId: string) => void;
  editTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "categoryIds" | "estimatedPomodoros" | "scheduledDate" | "notes">>,
  ) => void;
  archiveTask: (taskId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const actualCount = completedSessionsForTask(sessions, task.id).length;
  const estimate = task.estimatedPomodoros ?? 0;
  const category = primaryCategory(task, categories);
  const categoryIndex = Math.max(0, categories.findIndex((item) => item.id === category?.id));
  const stopRowAction = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };
  const enterEditing = () => {
    selectTask(task.id);
    setEditing(true);
  };
  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }

    if (event.key === "Escape") {
      setEditing(false);
    }
  };
  const cycleCategory = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (categories.length === 0) {
      return;
    }

    const nextCategory = categories[(categoryIndex + 1) % categories.length];
    editTask(task.id, { categoryIds: [nextCategory.id] });
  };

  return (
    <article
      className={`task-row ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""}`}
      onClick={() => selectTask(task.id)}
      onDoubleClick={enterEditing}
    >
      <button
        aria-label={`Complete ${task.title}`}
        className="complete-dot"
        onClick={(event) => {
          event.stopPropagation();
          archiveTask(task.id);
        }}
        type="button"
      />
      {editing ? (
        <input
          aria-label="Edit task title"
          autoFocus
          onBlur={() => setEditing(false)}
          onChange={(event) => editTask(task.id, { title: event.target.value })}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={handleTitleKeyDown}
          value={task.title}
        />
      ) : (
        <div className="task-title-stack">
          <button
            aria-label={`Select ${task.title}`}
            className="task-title-button"
            onDoubleClick={(event) => {
              event.stopPropagation();
              enterEditing();
            }}
            type="button"
          >
            {task.title}
          </button>
          {task.scheduledDate || task.notes ? (
            <small>
              {task.scheduledDate ? format(parseISO(task.scheduledDate), "MMM d") : "No date"}
              {task.notes ? ` · ${task.notes}` : ""}
            </small>
          ) : null}
        </div>
      )}
      <button
        aria-label={`Select ${task.title}`}
        className="task-row-main"
        type="button"
      >
        <TomatoTrail categories={categories} fruits={fruits} sessions={sessions} task={task} />
      </button>
      {category ? (
        <button
          aria-label={`Change category for ${task.title}`}
          className="task-category-chip"
          onClick={cycleCategory}
          style={{ "--swatch": category.color } as React.CSSProperties}
          type="button"
        >
          <TomatoMark
            color={category.color}
            small
            striped={category.tomatoVariant === "striped"}
          />
          {category.name}
        </button>
      ) : null}
      <details className="task-menu">
        <summary aria-label={`Task options for ${task.title}`} onClick={stopRowAction}>
          <MoreVertical size={22} strokeWidth={1.7} />
        </summary>
        <div className="task-menu-popover" onClick={stopRowAction}>
          <button
            aria-label={`Decrease estimate for ${task.title}`}
            onClick={() => editTask(task.id, { estimatedPomodoros: Math.max(0, estimate - 1) })}
            type="button"
          >
            Less
          </button>
          <span>{estimate > 0 ? `${actualCount}/${estimate}` : actualCount}</span>
          <button
            aria-label={`Increase estimate for ${task.title}`}
            onClick={() => editTask(task.id, { estimatedPomodoros: estimate + 1 })}
            type="button"
          >
            More
          </button>
          <label>
            Date
            <input
              aria-label={`Date for ${task.title}`}
              onChange={(event) => editTask(task.id, { scheduledDate: event.target.value })}
              type="date"
              value={task.scheduledDate ?? ""}
            />
          </label>
          <label>
            Notes
            <textarea
              aria-label={`Notes for ${task.title}`}
              onChange={(event) => editTask(task.id, { notes: event.target.value })}
              placeholder="Optional notes"
              value={task.notes ?? ""}
            />
          </label>
          <button onClick={() => archiveTask(task.id)} type="button">
            Archive
          </button>
        </div>
      </details>
    </article>
  );
}

function TaskList({
  title,
  dateLabel,
  activeFilter,
  tasks,
  categories,
  sessions,
  fruits,
  selectedTaskId,
  selectedCategoryId,
  addTask,
  editTask,
  archiveTask,
  selectTask,
}: {
  title: string;
  dateLabel: string;
  activeFilter: TaskFilter;
  tasks: Task[];
  categories: Category[];
  sessions: PomodoroSession[];
  fruits: TomatoFruit[];
  selectedTaskId?: string;
  selectedCategoryId?: string;
  addTask: (input: TaskInput) => void;
  editTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "categoryIds" | "estimatedPomodoros" | "scheduledDate" | "notes">>,
  ) => void;
  archiveTask: (taskId: string) => void;
  selectTask: (taskId: string) => void;
}) {
  return (
    <section className="task-list-panel">
      <div className="task-list-header">
        <div>
          <h1>{title}</h1>
          <time>{dateLabel}</time>
        </div>
        <button aria-label="Task view options" className="view-options-button" type="button">
          <SlidersHorizontal size={24} strokeWidth={1.6} />
        </button>
      </div>
      <TaskComposer
        activeFilter={activeFilter}
        addTask={addTask}
        categories={categories}
        key={activeFilter}
        selectedCategoryId={selectedCategoryId}
      />
      <div className="task-list" aria-label="Tasks">
        {tasks.length === 0 ? <p className="quiet-line">No tasks here</p> : null}
        {tasks.map((task) => (
          <TaskRow
            archiveTask={archiveTask}
            categories={categories}
            editTask={editTask}
            fruits={fruits}
            key={task.id}
            selectTask={selectTask}
            selected={selectedTaskId === task.id}
            sessions={sessions}
            task={task}
          />
        ))}
      </div>
    </section>
  );
}

function NextTaskPreview({
  nextTask,
  categories,
  fruits,
  dailyGoals,
  selectedDate,
  plants,
  highlightedCategoryId,
  remaining,
  activeTimer,
  setSelectedCategory,
  setDailyGoal,
  startTimer,
  pauseTimer,
  resumeTimer,
  abandonTimer,
  moveFruitAnchor,
  expanded = false,
  gardenCollapsed = false,
}: {
  nextTask?: Task;
  categories: Category[];
  fruits: TomatoFruit[];
  dailyGoals: DailyGoalSettings;
  selectedDate: string;
  plants: ReturnType<typeof useDayseedStore.getState>["dailyPlants"];
  highlightedCategoryId?: string;
  remaining: number;
  activeTimer: ReturnType<typeof useDayseedStore.getState>["activeTimer"];
  setSelectedCategory: (categoryId: string) => void;
  setDailyGoal: (date: string, goal: number, scope: "today" | "future") => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  abandonTimer: () => void;
  moveFruitAnchor: (fruitId: string, anchorIndex: number) => void;
  expanded?: boolean;
  gardenCollapsed?: boolean;
}) {
  const taskCategories = nextTask
    ? categories.filter((category) => nextTask.categoryIds.includes(category.id))
    : [];
  const displayTime = activeTimer ? formatRemaining(remaining) : "25";
  const focusCategory = primaryCategory(nextTask, categories);
  const dailyPlant = plants.find((plant) => plant.date === selectedDate);
  const dailyFruitIds = new Set(dailyPlant?.fruitIds ?? []);
  const dailyFruits = fruits.filter((fruit) => dailyFruitIds.has(fruit.id));
  const todayEffort = dailyFruits.length;
  const dailyGoal = goalForDate(dailyGoals, selectedDate);
  const goalInputRef = useRef<HTMLInputElement>(null);
  const submitGoal = (scope: "today" | "future") => {
    setDailyGoal(selectedDate, Number(goalInputRef.current?.value ?? dailyGoal), scope);
  };
  const timerProgress = activeTimer
    ? Math.max(0, Math.min(1, 1 - remaining / activeTimer.plannedDurationSec))
    : 0.72;
  const sessionLabel = activeTimer ? (activeTimer.status === "paused" ? "Paused" : "Focusing") : "Next up";

  return (
    <aside className={`next-preview ${expanded ? "is-expanded" : ""} ${gardenCollapsed ? "is-garden-collapsed" : ""}`}>
      <div className="session-card">
        <div
          className="session-minutes"
          style={{ "--progress": `${timerProgress * 360}deg` } as React.CSSProperties}
        >
          <strong>{displayTime}</strong>
          <span>{activeTimer ? "left" : "min"}</span>
        </div>
        <div className="session-copy">
          <span>{sessionLabel}</span>
          <strong>{nextTask?.title ?? "No task selected"}</strong>
          {nextTask && focusCategory ? (
            <small style={{ "--swatch": focusCategory.color } as React.CSSProperties}>
              <TomatoMark
                color={focusCategory.color}
                small
                striped={focusCategory.tomatoVariant === "striped"}
              />
              {focusCategory.name}
            </small>
          ) : null}
        </div>
        {!activeTimer ? (
          <button
            aria-label="Start"
            className="round-play"
            disabled={!nextTask}
            onClick={() => startTimer()}
            type="button"
          >
            <Play size={20} fill="currentColor" strokeWidth={1.8} />
          </button>
        ) : activeTimer.status === "paused" ? (
          <div className="session-actions">
            <button aria-label="Resume" className="round-play" onClick={resumeTimer} type="button">
              <Play size={20} fill="currentColor" strokeWidth={1.8} />
            </button>
            <button aria-label="Stop" className="round-stop" onClick={abandonTimer} type="button">
              <Square size={15} fill="currentColor" strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <button aria-label="Pause" className="round-play" onClick={pauseTimer} type="button">
            <Pause size={20} fill="currentColor" strokeWidth={1.8} />
          </button>
        )}
      </div>

      <div className={`preview-garden ${activeTimer ? "is-active-session" : ""}`}>
        <TomatoTree3D
          active={Boolean(activeTimer)}
          categories={categories}
          fruits={dailyFruits}
          highlightedCategoryId={highlightedCategoryId}
          onMoveFruitAnchor={moveFruitAnchor}
          progress={timerProgress}
          seed={dailyPlant?.seed}
        />
      </div>

      <div className="garden-summary">
        <TomatoMark color="#d84d32" />
        <div>
          <span>Today&apos;s garden</span>
          <strong>{todayEffort} / {dailyGoal} effort</strong>
        </div>
        <details className="goal-menu">
          <summary aria-label="Adjust daily goal">
            <ChevronRight size={24} strokeWidth={1.6} />
          </summary>
          <div className="goal-popover">
            <label className="field-label">
              <span>Daily goal</span>
              <input
                aria-label="Daily tomato goal"
                defaultValue={dailyGoal}
                key={`${selectedDate}-${dailyGoal}`}
                min={1}
                max={99}
                ref={goalInputRef}
                type="number"
              />
            </label>
            <button onClick={() => submitGoal("today")} type="button">
              Today only
            </button>
            <button onClick={() => submitGoal("future")} type="button">
              Set for future days
            </button>
          </div>
        </details>
      </div>

      {expanded && nextTask && !activeTimer ? (
        <div className="preview-categories" aria-label="Focus category">
          {(taskCategories.length > 0 ? taskCategories : categories.slice(0, 1)).map((category) => (
            <button
              className="category-pill"
              disabled={Boolean(activeTimer)}
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              style={{ "--swatch": category.color } as React.CSSProperties}
              type="button"
            >
              <TomatoMark
                color={category.color}
                small
                striped={category.tomatoVariant === "striped"}
              />
              {category.name}
            </button>
          ))}
        </div>
      ) : null}

      {expanded && activeTimer ? (
        <div className="focus-ambient-controls">
          <WhiteNoiseButton />
        </div>
      ) : null}
    </aside>
  );
}

function TasksWorkbench({
  tasks,
  categories,
  sessions,
  fruits,
  plants,
  selectedTaskId,
  selectedCategoryId,
  selectedDate,
  highlightedCategoryId,
  activeTimer,
  remaining,
  dailyGoals,
  addTask,
  editTask,
  archiveTask,
  selectTask,
  setSelectedCategory,
  startTimer,
  pauseTimer,
  resumeTimer,
  abandonTimer,
  moveFruitAnchor,
  setDailyGoal,
}: {
  tasks: Task[];
  categories: Category[];
  sessions: PomodoroSession[];
  fruits: TomatoFruit[];
  plants: ReturnType<typeof useDayseedStore.getState>["dailyPlants"];
  selectedTaskId?: string;
  selectedCategoryId?: string;
  selectedDate: string;
  highlightedCategoryId?: string;
  activeTimer: ReturnType<typeof useDayseedStore.getState>["activeTimer"];
  remaining: number;
  dailyGoals: DailyGoalSettings;
  addTask: (input: TaskInput) => void;
  editTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "categoryIds" | "estimatedPomodoros" | "scheduledDate" | "notes">>,
  ) => void;
  archiveTask: (taskId: string) => void;
  selectTask: (taskId: string) => void;
  setSelectedCategory: (categoryId: string) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  abandonTimer: () => void;
  moveFruitAnchor: (fruitId: string, anchorIndex: number) => void;
  setDailyGoal: (date: string, goal: number, scope: "today" | "future") => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("today");
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const activeTasks = tasks.filter((task) => task.status === "active");
  const todayTasks = activeTasks.filter((task) =>
    task.scheduledDate ? isSameDay(parseISO(task.scheduledDate), today) : false,
  );
  const inboxTasks = activeTasks.filter((task) => !task.scheduledDate);
  const weekTasks = activeTasks.filter((task) => {
    if (!task.scheduledDate) {
      return false;
    }

    const scheduledAt = parseISO(task.scheduledDate);
    return !Number.isNaN(scheduledAt.getTime()) && isWithinInterval(scheduledAt, { start: weekStart, end: weekEnd });
  });
  const monthTasks = activeTasks.filter((task) => {
    if (!task.scheduledDate) {
      return false;
    }

    const scheduledAt = parseISO(task.scheduledDate);
    return !Number.isNaN(scheduledAt.getTime()) && isWithinInterval(scheduledAt, { start: monthStart, end: monthEnd });
  });
  const visibleTasks = {
    inbox: inboxTasks,
    today: todayTasks,
    week: weekTasks,
    month: monthTasks,
    all: activeTasks,
  } satisfies Record<TaskFilter, Task[]>;
  const counts = {
    inbox: inboxTasks.length,
    today: todayTasks.length,
    week: weekTasks.length,
    month: monthTasks.length,
    all: activeTasks.length,
  } satisfies Record<TaskFilter, number>;
  const nextTask =
    activeTasks.find((task) => task.id === selectedTaskId) ?? activeTasks[0] ?? undefined;
  const activeFilter = FILTERS.find((item) => item.id === filter);
  const dateLabel = format(today, "MMMM d, yyyy");

  return (
    <div className="workbench">
      <TaskFilterRail activeFilter={filter} counts={counts} setFilter={setFilter} />
      <div className="center-stack">
        <TaskList
          addTask={addTask}
          activeFilter={filter}
          archiveTask={archiveTask}
          categories={categories}
          dateLabel={dateLabel}
          editTask={editTask}
          fruits={fruits}
          selectTask={selectTask}
          selectedCategoryId={selectedCategoryId}
          selectedTaskId={selectedTaskId}
          sessions={sessions}
          tasks={visibleTasks[filter]}
          title={activeFilter?.label ?? "Today"}
        />
      </div>
      <NextTaskPreview
        abandonTimer={abandonTimer}
        activeTimer={activeTimer}
        categories={categories}
        fruits={fruits}
        dailyGoals={dailyGoals}
        highlightedCategoryId={highlightedCategoryId}
        moveFruitAnchor={moveFruitAnchor}
        nextTask={nextTask}
        pauseTimer={pauseTimer}
        plants={plants}
        remaining={remaining}
        resumeTimer={resumeTimer}
        selectedDate={selectedDate}
        setDailyGoal={setDailyGoal}
        setSelectedCategory={setSelectedCategory}
        startTimer={startTimer}
      />
    </div>
  );
}

type AmbientStat = {
  label: string;
  value: string | number;
};

function AmbientStats({ items }: { items: AmbientStat[] }) {
  return (
    <section className="ambient-stats" aria-label="Garden stats">
      {items.map((item) => (
        <div key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </section>
  );
}

function YardWorkspace({
  categories,
  fruits,
  plants,
  highlightedCategoryId,
  dailyGoals,
  selectedDate,
  setHighlightedCategory,
  setSelectedDate,
  setViewMode,
}: {
  categories: Category[];
  fruits: TomatoFruit[];
  dailyGoals: DailyGoalSettings;
  plants: ReturnType<typeof useDayseedStore.getState>["dailyPlants"];
  highlightedCategoryId?: string;
  selectedDate: string;
  setHighlightedCategory: (categoryId?: string) => void;
  setSelectedDate: (date: string, viewMode?: GardenViewMode) => void;
  setViewMode: (viewMode: GardenViewMode) => void;
}) {
  const [scale, setScale] = useState<YardScale>("year");
  const viewMode = YARD_SCALES.find((item) => item.id === scale)?.viewMode ?? "year";
  const title =
    viewMode === "year"
      ? yearTitle(selectedDate)
      : viewMode === "month"
        ? monthTitle(selectedDate)
        : "This week";

  const chooseScale = (nextScale: YardScale) => {
    const nextView = YARD_SCALES.find((item) => item.id === nextScale)?.viewMode ?? "year";
    setScale(nextScale);
    setViewMode(nextView);
  };
  const stats = useMemo(() => {
    const selected = parseISO(selectedDate);
    const categoryMap = categoriesById(categories);

    const fruitsForPlants = (scopePlants: DailyPlant[]) => {
      const fruitIds = new Set(scopePlants.flatMap((plant) => plant.fruitIds));
      return fruits.filter((fruit) => fruitIds.has(fruit.id));
    };
    const plantsInRange = (start: Date, end: Date) =>
      plants.filter((plant) => {
        if (plant.fruitIds.length === 0) {
          return false;
        }

        const plantedAt = parseISO(plant.date);
        return !Number.isNaN(plantedAt.getTime()) && isWithinInterval(plantedAt, { start, end });
      });
    const targetInRange = (start: Date, end: Date) => {
      let total = 0;
      const cursor = new Date(start);

      while (cursor <= end) {
        total += goalForDate(dailyGoals, dateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      return total;
    };
    const topCategory = (scopeFruits: TomatoFruit[]) => {
      const counts = new Map<string, number>();

      scopeFruits.forEach((fruit) => {
        counts.set(fruit.categoryId, (counts.get(fruit.categoryId) ?? 0) + 1);
      });

      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? categoryMap.get(top[0])?.name ?? "Mixed" : "None";
    };
    const bestDay = (scopePlants: DailyPlant[]) => {
      const best = [...scopePlants].sort((a, b) => b.fruitIds.length - a.fruitIds.length)[0];
      return best ? `${format(parseISO(best.date), "MMM d")} · ${best.fruitIds.length}` : "None";
    };
    const bestMonth = () => {
      const monthCounts = new Map<string, number>();

      plants.forEach((plant) => {
        const plantedAt = parseISO(plant.date);
        if (plantedAt.getFullYear() !== selected.getFullYear() || plant.fruitIds.length === 0) {
          return;
        }

        const key = format(plantedAt, "MMM");
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + plant.fruitIds.length);
      });

      const top = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? `${top[0]} · ${top[1]}` : "None";
    };

    if (viewMode === "week") {
      const start = startOfWeek(selected, { weekStartsOn: 1 });
      const end = endOfWeek(selected, { weekStartsOn: 1 });
      const scopePlants = plantsInRange(start, end);
      const scopeFruits = fruitsForPlants(scopePlants);
      const selectedPlant = plants.find((plant) => plant.date === selectedDate);

      return [
        { label: "week target", value: `${scopeFruits.length}/${targetInRange(start, end)}` },
        { label: "selected day", value: selectedPlant?.fruitIds.length ?? 0 },
        { label: "best day", value: bestDay(scopePlants) },
        { label: "top variety", value: topCategory(scopeFruits) },
      ];
    }

    if (viewMode === "month") {
      const start = startOfMonth(selected);
      const end = endOfMonth(selected);
      const scopePlants = plantsInRange(start, end);
      const scopeFruits = fruitsForPlants(scopePlants);

      return [
        { label: "month target", value: `${scopeFruits.length}/${targetInRange(start, end)}` },
        { label: "active days", value: scopePlants.length },
        { label: "best day", value: bestDay(scopePlants) },
        { label: "top variety", value: topCategory(scopeFruits) },
      ];
    }

    const yearStart = new Date(selected.getFullYear(), 0, 1);
    const yearEnd = new Date(selected.getFullYear(), 11, 31);
    const scopePlants = plantsInRange(yearStart, yearEnd);
    const scopeFruits = fruitsForPlants(scopePlants);

    return [
      { label: "year effort", value: scopeFruits.length },
      { label: "active days", value: scopePlants.length },
      { label: "best month", value: bestMonth() },
      { label: "top variety", value: topCategory(scopeFruits) },
    ];
  }, [categories, dailyGoals, fruits, plants, selectedDate, viewMode]);

  return (
    <section className="yard-workspace">
      <aside className="yard-nav" aria-label="Yard scale">
        {YARD_SCALES.map((item) => (
          <button
            className={scale === item.id ? "is-active" : ""}
            key={item.id}
            onClick={() => chooseScale(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </aside>
      <div className="yard-stage">
        <div className="yard-toolbar">
          <h2>{title}</h2>
          <div className="category-filter" aria-label="Category filter">
            {categories.map((category) => (
              <button
                aria-label={`Highlight ${category.name}`}
                className={`category-swatch ${highlightedCategoryId === category.id ? "is-active" : ""}`}
                key={category.id}
                onClick={() =>
                  setHighlightedCategory(highlightedCategoryId === category.id ? undefined : category.id)
                }
                style={{ "--swatch": category.color } as React.CSSProperties}
                title={category.name}
                type="button"
              />
            ))}
          </div>
        </div>
        <div className="yard-canvas">
          <GardenCanvas
            categories={categories}
            fruits={fruits}
            highlightedCategoryId={highlightedCategoryId}
            onSelectDate={setSelectedDate}
            plants={plants}
            selectedDate={selectedDate}
            viewMode={viewMode}
          />
        </div>
        <AmbientStats items={stats} />
      </div>
    </section>
  );
}

function FocusMode({
  nextTask,
  categories,
  fruits,
  dailyGoals,
  plants,
  highlightedCategoryId,
  selectedDate,
  activeTimer,
  remaining,
  setSelectedCategory,
  startTimer,
  pauseTimer,
  resumeTimer,
  abandonTimer,
  moveFruitAnchor,
  setDailyGoal,
  collapseFocus,
}: {
  nextTask?: Task;
  categories: Category[];
  fruits: TomatoFruit[];
  dailyGoals: DailyGoalSettings;
  plants: ReturnType<typeof useDayseedStore.getState>["dailyPlants"];
  highlightedCategoryId?: string;
  selectedDate: string;
  activeTimer: ReturnType<typeof useDayseedStore.getState>["activeTimer"];
  remaining: number;
  setSelectedCategory: (categoryId: string) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  abandonTimer: () => void;
  moveFruitAnchor: (fruitId: string, anchorIndex: number) => void;
  setDailyGoal: (date: string, goal: number, scope: "today" | "future") => void;
  collapseFocus: () => void;
}) {
  return (
    <section className="focus-mode">
      <button
        aria-label="Restore list panel"
        className="focus-collapsed-rail"
        onClick={collapseFocus}
        type="button"
      >
        <Inbox size={16} strokeWidth={1.7} />
        <span>Lists hidden</span>
      </button>
      <button
        aria-label="Restore task panel"
        className="focus-collapsed-rail"
        onClick={collapseFocus}
        type="button"
      >
        <ListChecks size={16} strokeWidth={1.7} />
        <span>Tasks hidden</span>
      </button>
      <div className="focus-stage">
        <button
          aria-label="Collapse focus view"
          className="garden-collapse-button"
          onClick={collapseFocus}
          title="Collapse focus view"
          type="button"
        >
          <PanelLeftClose size={18} strokeWidth={1.7} />
        </button>
        <NextTaskPreview
          abandonTimer={abandonTimer}
          activeTimer={activeTimer}
          categories={categories}
          dailyGoals={dailyGoals}
          expanded
          fruits={fruits}
          highlightedCategoryId={highlightedCategoryId}
          moveFruitAnchor={moveFruitAnchor}
          nextTask={nextTask}
          pauseTimer={pauseTimer}
          plants={plants}
          remaining={remaining}
          resumeTimer={resumeTimer}
          selectedDate={selectedDate}
          setDailyGoal={setDailyGoal}
          setSelectedCategory={setSelectedCategory}
          startTimer={startTimer}
        />
      </div>
    </section>
  );
}

export function DayseedApp() {
  const hydrate = useDayseedStore((state) => state.hydrate);
  const hydrated = useDayseedStore((state) => state.hydrated);
  const tasks = useDayseedStore((state) => state.tasks);
  const categories = useDayseedStore((state) => state.categories);
  const sessions = useDayseedStore((state) => state.sessions);
  const plants = useDayseedStore((state) => state.dailyPlants);
  const fruits = useDayseedStore((state) => state.fruits);
  const userProfile = useDayseedStore((state) => state.userProfile);
  const dailyGoals = useDayseedStore((state) => state.dailyGoals);
  const selectedTaskId = useDayseedStore((state) => state.selectedTaskId);
  const selectedCategoryId = useDayseedStore((state) => state.selectedCategoryId);
  const selectedDate = useDayseedStore((state) => state.selectedDate);
  const highlightedCategoryId = useDayseedStore((state) => state.highlightedCategoryId);
  const activeTimer = useDayseedStore((state) => state.activeTimer);
  const addTask = useDayseedStore((state) => state.addTask);
  const editTask = useDayseedStore((state) => state.editTask);
  const archiveTask = useDayseedStore((state) => state.archiveTask);
  const selectTask = useDayseedStore((state) => state.selectTask);
  const setSelectedCategory = useDayseedStore((state) => state.setSelectedCategory);
  const setHighlightedCategory = useDayseedStore((state) => state.setHighlightedCategory);
  const setViewMode = useDayseedStore((state) => state.setViewMode);
  const setSelectedDate = useDayseedStore((state) => state.setSelectedDate);
  const startTimer = useDayseedStore((state) => state.startTimer);
  const pauseTimer = useDayseedStore((state) => state.pauseTimer);
  const resumeTimer = useDayseedStore((state) => state.resumeTimer);
  const abandonTimer = useDayseedStore((state) => state.abandonTimer);
  const completeActiveTimer = useDayseedStore((state) => state.completeActiveTimer);
  const moveFruitAnchor = useDayseedStore((state) => state.moveFruitAnchor);
  const setDailyGoal = useDayseedStore((state) => state.setDailyGoal);
  const updateUserProfile = useDayseedStore((state) => state.updateUserProfile);
  const [section, setSection] = useState<AppSection>("tasks");
  const [focusExpanded, setFocusExpanded] = useState(true);
  const now = useClock(activeTimer?.id);
  const remaining = remainingSeconds(activeTimer, now);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (activeTimer?.status === "running" && remaining <= 0) {
      completeActiveTimer();
    }
  }, [activeTimer?.status, completeActiveTimer, remaining]);

  const activeTasks = tasks.filter((task) => task.status === "active");
  const nextTask =
    activeTasks.find((task) => task.id === selectedTaskId) ?? activeTasks[0] ?? undefined;
  const startFocusTimer = () => {
    startTimer();
    setFocusExpanded(true);
  };
  if (!hydrated) {
    return (
      <main className="app-shell is-loading">
        <div className="loading-mark">
          <Sprout size={32} strokeWidth={1.5} />
          <span>Dayseed</span>
        </div>
      </main>
    );
  }

  return (
    <main className={`app-shell ${activeTimer ? "is-focus" : ""}`}>
      <AppHeader
        section={section}
        setSection={setSection}
        updateUserProfile={updateUserProfile}
        userProfile={userProfile}
      />
      {section === "yard" ? (
        <YardWorkspace
          categories={categories}
          dailyGoals={dailyGoals}
          fruits={fruits}
          highlightedCategoryId={highlightedCategoryId}
          plants={plants}
          selectedDate={selectedDate}
          setHighlightedCategory={setHighlightedCategory}
          setSelectedDate={setSelectedDate}
          setViewMode={setViewMode}
        />
      ) : activeTimer && focusExpanded ? (
        <FocusMode
          abandonTimer={abandonTimer}
          activeTimer={activeTimer}
          categories={categories}
          collapseFocus={() => setFocusExpanded(false)}
          dailyGoals={dailyGoals}
          fruits={fruits}
          highlightedCategoryId={highlightedCategoryId}
          moveFruitAnchor={moveFruitAnchor}
          nextTask={nextTask}
          pauseTimer={pauseTimer}
          plants={plants}
          remaining={remaining}
          resumeTimer={resumeTimer}
          selectedDate={dateKey()}
          setDailyGoal={setDailyGoal}
          setSelectedCategory={setSelectedCategory}
          startTimer={startFocusTimer}
        />
      ) : (
        <TasksWorkbench
          abandonTimer={abandonTimer}
          activeTimer={activeTimer}
          addTask={addTask}
          archiveTask={archiveTask}
          categories={categories}
          dailyGoals={dailyGoals}
          editTask={editTask}
          fruits={fruits}
          highlightedCategoryId={highlightedCategoryId}
          moveFruitAnchor={moveFruitAnchor}
          pauseTimer={pauseTimer}
          plants={plants}
          remaining={remaining}
          resumeTimer={resumeTimer}
          selectTask={selectTask}
          selectedCategoryId={selectedCategoryId}
          selectedDate={dateKey()}
          selectedTaskId={selectedTaskId}
          sessions={sessions}
          setDailyGoal={setDailyGoal}
          setSelectedCategory={setSelectedCategory}
          startTimer={startFocusTimer}
          tasks={tasks}
        />
      )}
    </main>
  );
}
