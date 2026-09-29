'use client';

import * as React from 'react';
import { KanbanSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kanban, KanbanBoard, KanbanOverlay } from '@/components/ui/kanban';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { initialTasks } from './mock';
import { Task } from './types';
import { TaskColumn } from './task-column';

// Démo : tableau kanban du concept Todo de Metronic (candidat pour les actions correctives).
export default function KanbanDemoPage() {
  const [columns, setColumns] =
    React.useState<Record<string, Task[]>>(initialTasks);

  const totalTasks = React.useMemo(
    () => Object.values(columns).reduce((acc, tasks) => acc + tasks.length, 0),
    [columns],
  );

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <KanbanSquare className="size-4 text-primary" />
          All Tasks
          <span className="text-muted-foreground font-normal">
            {totalTasks} tasks in total
          </span>
        </h1>
        <Button size="sm">
          <Plus />
          New Activity
        </Button>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid">
          <Kanban
            value={columns}
            onValueChange={setColumns}
            getItemValue={(item) => item.id}
          >
            <KanbanBoard className="grid auto-rows-fr grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(columns).map(([columnValue, tasks]) => (
                <TaskColumn key={columnValue} value={columnValue} tasks={tasks} />
              ))}
            </KanbanBoard>
            <KanbanOverlay>
              <div className="rounded-md bg-muted/60 size-full" />
            </KanbanOverlay>
          </Kanban>
        </div>
      </Content>
    </>
  );
}
