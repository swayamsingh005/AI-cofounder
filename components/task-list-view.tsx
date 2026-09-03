"use client";

import { useState } from "react";
import TaskItem from "./task-item";

type Task = { id: string; title: string; status: string; priority: string };
type Milestone = { id: string; title: string; status: string; sort_order: number };

export default function TaskListView({ milestones, tasksByMilestone, excludeTaskId, totalTasks }: {
  milestones: Milestone[]; tasksByMilestone: Record<string, Task[]>; excludeTaskId: string | null; totalTasks: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div className="milestone-list">
        {milestones.map(milestone => (
          <div className="milestone" key={milestone.id}>
            <h3>{milestone.title}</h3>
            <ul>{(tasksByMilestone[milestone.id] ?? []).map(task => <TaskItem key={task.id} id={task.id} title={task.title} priority={task.priority} initialStatus={task.status} />)}</ul>
          </div>
        ))}
        <button type="button" className="task-collapse" onClick={() => setExpanded(false)}>Show less</button>
      </div>
    );
  }

  // Compact "NEXT" preview: a few upcoming (not-yet-completed) tasks, flat, skipping whatever is
  // already shown as the headline Next Best Action so nothing appears twice on the page.
  const upcoming = milestones.flatMap(m => tasksByMilestone[m.id] ?? [])
    .filter(t => t.status !== "completed" && t.id !== excludeTaskId)
    .slice(0, 3);

  return (
    <div className="task-preview">
      {upcoming.length > 0 && (
        <>
          <span className="task-preview-label">NEXT</span>
          <ul>{upcoming.map(task => <TaskItem key={task.id} id={task.id} title={task.title} priority={task.priority} initialStatus={task.status} />)}</ul>
        </>
      )}
      <button type="button" className="task-expand" onClick={() => setExpanded(true)}>View all {totalTasks} tasks →</button>
    </div>
  );
}
