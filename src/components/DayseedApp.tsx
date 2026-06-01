"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Check,
  Inbox,
  Leaf,
  ListChecks,
  MoreVertical,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Sprout,
  Square,
  Volume2,
} from "lucide-react";
import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { endOfMonth, endOfWeek, format, isWithinInterval, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { GardenCanvas } from "@/components/GardenCanvas";
import { TomatoTree3D } from "@/components/TomatoTree3D";
import { dateKey, monthTitle, sameMonth, sameYear, yearTitle } from "@/lib/dates";
import { formatRemaining, remainingSeconds } from "@/lib/timer";
import { useDayseedStore } from "@/store/dayseedStore";
import type {
  Category,
  GardenViewMode,
  PomodoroSession,
  Task,
  TomatoFruit,
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

function useClock(activeTimerId?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [activeTimerId]);

  return now;
}

function AppHeader({
  section,
  setSection,
}: {
  section: AppSection;
  setSection: (section: AppSection) => void;
}) {
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
      <div className="profile-chip" aria-label="Current user">
        <span>N</span>
        <strong>Nora</strong>
        <ChevronDown size={18} strokeWidth={1.7} />
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
        const isEstimated = !isActual && index < estimate;

        return (
          <span
            className={`tomato-dot ${isActual ? "is-grown" : isEstimated ? "is-estimate" : "is-empty"}`}
            key={`${task.id}-${index}`}
            style={{ "--swatch": color } as React.CSSProperties}
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
  addTask,
}: {
  selectedCategoryId?: string;
  addTask: (title: string, categoryIds: string[]) => void;
}) {
  const [title, setTitle] = useState("");

  const submitTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addTask(title, selectedCategoryId ? [selectedCategoryId] : []);
    setTitle("");
  };

  return (
    <form className="task-composer" onSubmit={submitTask}>
      <button aria-label="Add task" className="composer-plus" type="submit">
        <Plus size={24} strokeWidth={1.5} />
      </button>
      <input
        aria-label="Task title"
        onChange={(event) => setTitle(event.target.value)}
        placeholder="New task"
        value={title}
      />
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
    patch: Partial<Pick<Task, "title" | "categoryIds" | "estimatedPomodoros">>,
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
          <span />
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
  tasks: Task[];
  categories: Category[];
  sessions: PomodoroSession[];
  fruits: TomatoFruit[];
  selectedTaskId?: string;
  selectedCategoryId?: string;
  addTask: (title: string, categoryIds: string[]) => void;
  editTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "categoryIds" | "estimatedPomodoros">>,
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
        addTask={addTask}
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
  selectedDate,
  plants,
  highlightedCategoryId,
  remaining,
  activeTimer,
  setSelectedCategory,
  startTimer,
  pauseTimer,
  resumeTimer,
  abandonTimer,
  completeActiveTimer,
  moveFruitAnchor,
  expanded = false,
}: {
  nextTask?: Task;
  categories: Category[];
  fruits: TomatoFruit[];
  selectedDate: string;
  plants: ReturnType<typeof useDayseedStore.getState>["dailyPlants"];
  highlightedCategoryId?: string;
  remaining: number;
  activeTimer: ReturnType<typeof useDayseedStore.getState>["activeTimer"];
  setSelectedCategory: (categoryId: string) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  abandonTimer: () => void;
  completeActiveTimer: () => void;
  moveFruitAnchor: (fruitId: string, anchorIndex: number) => void;
  expanded?: boolean;
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
  const timerProgress = activeTimer
    ? Math.max(0, Math.min(1, 1 - remaining / activeTimer.plannedDurationSec))
    : 0.72;

  return (
    <aside className={`next-preview ${expanded ? "is-expanded" : ""}`}>
      <div className="session-card">
        <div
          className="session-minutes"
          style={{ "--progress": `${timerProgress * 360}deg` } as React.CSSProperties}
        >
          <strong>{displayTime}</strong>
          <span>{activeTimer ? "left" : "min"}</span>
        </div>
        <div className="session-copy">
          <span>Next up</span>
          <strong>{nextTask?.title ?? "No task selected"}</strong>
          {nextTask && focusCategory ? (
            <small style={{ "--swatch": focusCategory.color } as React.CSSProperties}>
              <span />
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
          <button aria-label="Resume" className="round-play" onClick={resumeTimer} type="button">
            <Play size={20} fill="currentColor" strokeWidth={1.8} />
          </button>
        ) : (
          <button aria-label="Pause" className="round-play" onClick={pauseTimer} type="button">
            <Pause size={20} fill="currentColor" strokeWidth={1.8} />
          </button>
        )}
      </div>

      <div className="preview-garden">
        <TomatoTree3D
          categories={categories}
          fruits={dailyFruits}
          highlightedCategoryId={highlightedCategoryId}
          onMoveFruitAnchor={moveFruitAnchor}
          seed={dailyPlant?.seed}
        />
      </div>

      <div className="garden-summary">
        <span className="summary-tomato" />
        <div>
          <span>Today&apos;s garden</span>
          <strong>{todayEffort} / 15 effort</strong>
        </div>
        <ChevronRight size={24} strokeWidth={1.6} />
      </div>

      {expanded && nextTask ? (
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
              <span />
              {category.name}
            </button>
          ))}
        </div>
      ) : null}

      {expanded && activeTimer ? (
        <div className="focus-controls">
          <button onClick={activeTimer.status === "paused" ? resumeTimer : pauseTimer} type="button">
            {activeTimer.status === "paused" ? <Play size={18} /> : <Pause size={18} />}
            <span>{activeTimer.status === "paused" ? "Continue" : "Pause"}</span>
          </button>
          <button onClick={abandonTimer} type="button">
            <Square size={18} />
            <span>Stop</span>
          </button>
          <button onClick={completeActiveTimer} type="button">
            <Check size={18} />
            <span>Plant</span>
          </button>
          <button type="button">
            <Volume2 size={18} />
            <span>Noise</span>
          </button>
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
  addTask,
  editTask,
  archiveTask,
  selectTask,
  setSelectedCategory,
  startTimer,
  pauseTimer,
  resumeTimer,
  abandonTimer,
  completeActiveTimer,
  moveFruitAnchor,
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
  addTask: (title: string, categoryIds: string[]) => void;
  editTask: (
    taskId: string,
    patch: Partial<Pick<Task, "title" | "categoryIds" | "estimatedPomodoros">>,
  ) => void;
  archiveTask: (taskId: string) => void;
  selectTask: (taskId: string) => void;
  setSelectedCategory: (categoryId: string) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  abandonTimer: () => void;
  completeActiveTimer: () => void;
  moveFruitAnchor: (fruitId: string, anchorIndex: number) => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("today");
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const activeTasks = tasks.filter((task) => task.status === "active");
  const inboxTasks = activeTasks.filter((task) => completedSessionsForTask(sessions, task.id).length === 0);
  const weekTasks = activeTasks.filter((task) => {
    const createdAt = parseISO(task.createdAt);
    return !Number.isNaN(createdAt.getTime()) && isWithinInterval(createdAt, { start: weekStart, end: weekEnd });
  });
  const monthTasks = activeTasks.filter((task) => {
    const createdAt = parseISO(task.createdAt);
    return !Number.isNaN(createdAt.getTime()) && isWithinInterval(createdAt, { start: monthStart, end: monthEnd });
  });
  const visibleTasks = {
    inbox: inboxTasks,
    today: activeTasks,
    week: weekTasks,
    month: monthTasks,
    all: activeTasks,
  } satisfies Record<TaskFilter, Task[]>;
  const counts = {
    inbox: inboxTasks.length,
    today: activeTasks.length,
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
        completeActiveTimer={completeActiveTimer}
        fruits={fruits}
        highlightedCategoryId={highlightedCategoryId}
        moveFruitAnchor={moveFruitAnchor}
        nextTask={nextTask}
        pauseTimer={pauseTimer}
        plants={plants}
        remaining={remaining}
        resumeTimer={resumeTimer}
        selectedDate={selectedDate}
        setSelectedCategory={setSelectedCategory}
        startTimer={startTimer}
      />
    </div>
  );
}

function AmbientStats({
  todayCount,
  weekCount,
  monthPlantedDays,
  yearPlantedDays,
}: {
  todayCount: number;
  weekCount: number;
  monthPlantedDays: number;
  yearPlantedDays: number;
}) {
  return (
    <section className="ambient-stats" aria-label="Garden stats">
      <div>
        <strong>{todayCount}</strong>
        <span>today</span>
      </div>
      <div>
        <strong>{weekCount}</strong>
        <span>week</span>
      </div>
      <div>
        <strong>{monthPlantedDays}</strong>
        <span>month days</span>
      </div>
      <div>
        <strong>{yearPlantedDays}</strong>
        <span>yard days</span>
      </div>
    </section>
  );
}

function YardWorkspace({
  categories,
  fruits,
  plants,
  highlightedCategoryId,
  selectedDate,
  setHighlightedCategory,
  setSelectedDate,
  setViewMode,
  stats,
}: {
  categories: Category[];
  fruits: TomatoFruit[];
  plants: ReturnType<typeof useDayseedStore.getState>["dailyPlants"];
  highlightedCategoryId?: string;
  selectedDate: string;
  setHighlightedCategory: (categoryId?: string) => void;
  setSelectedDate: (date: string, viewMode?: GardenViewMode) => void;
  setViewMode: (viewMode: GardenViewMode) => void;
  stats: React.ComponentProps<typeof AmbientStats>;
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
        <AmbientStats {...stats} />
      </div>
    </section>
  );
}

function FocusMode({
  nextTask,
  categories,
  fruits,
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
  completeActiveTimer,
  moveFruitAnchor,
}: {
  nextTask?: Task;
  categories: Category[];
  fruits: TomatoFruit[];
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
  completeActiveTimer: () => void;
  moveFruitAnchor: (fruitId: string, anchorIndex: number) => void;
}) {
  const progress = activeTimer
    ? 1 - remaining / activeTimer.plannedDurationSec
    : 0;

  return (
    <section className="focus-mode">
      <div className="focus-progress" aria-label="Session progress">
        <span style={{ height: `${Math.max(4, progress * 100)}%` }} />
      </div>
      <NextTaskPreview
        abandonTimer={abandonTimer}
        activeTimer={activeTimer}
        categories={categories}
        completeActiveTimer={completeActiveTimer}
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
        setSelectedCategory={setSelectedCategory}
        startTimer={startTimer}
      />
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
  const [section, setSection] = useState<AppSection>("tasks");
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
  const stats = useMemo(() => {
    const today = dateKey();
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const completedSessions = sessions.filter(
      (session) => session.status === "completed" && session.completedAt,
    );
    const weekCount = completedSessions.filter((session) =>
      isWithinInterval(parseISO(session.completedAt ?? ""), { start: weekStart, end: weekEnd }),
    ).length;

    return {
      todayCount: completedSessions.filter((session) =>
        session.completedAt ? dateKey(parseISO(session.completedAt)) === today : false,
      ).length,
      weekCount,
      monthPlantedDays: plants.filter(
        (plant) => plant.fruitIds.length > 0 && sameMonth(plant.date, selectedDate),
      ).length,
      yearPlantedDays: plants.filter(
        (plant) => plant.fruitIds.length > 0 && sameYear(plant.date, selectedDate),
      ).length,
    };
  }, [plants, selectedDate, sessions]);

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
      <AppHeader section={section} setSection={setSection} />
      {activeTimer ? (
        <FocusMode
          abandonTimer={abandonTimer}
          activeTimer={activeTimer}
          categories={categories}
          completeActiveTimer={completeActiveTimer}
          fruits={fruits}
          highlightedCategoryId={highlightedCategoryId}
          moveFruitAnchor={moveFruitAnchor}
          nextTask={nextTask}
          pauseTimer={pauseTimer}
          plants={plants}
          remaining={remaining}
          resumeTimer={resumeTimer}
          selectedDate={dateKey()}
          setSelectedCategory={setSelectedCategory}
          startTimer={startTimer}
        />
      ) : section === "yard" ? (
        <YardWorkspace
          categories={categories}
          fruits={fruits}
          highlightedCategoryId={highlightedCategoryId}
          plants={plants}
          selectedDate={selectedDate}
          setHighlightedCategory={setHighlightedCategory}
          setSelectedDate={setSelectedDate}
          setViewMode={setViewMode}
          stats={stats}
        />
      ) : (
        <TasksWorkbench
          abandonTimer={abandonTimer}
          activeTimer={activeTimer}
          addTask={addTask}
          archiveTask={archiveTask}
          categories={categories}
          completeActiveTimer={completeActiveTimer}
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
          setSelectedCategory={setSelectedCategory}
          startTimer={startTimer}
          tasks={tasks}
        />
      )}
    </main>
  );
}
