# Dynamic task views design

## Goal

- Support any number of task views in the top toolbar.
- Keep one shared set of quadrant definitions across every task view.
- Keep task contents independent for every `view × quadrant` pair.
- Add task views and quadrants through inline input; Enter commits, Escape/blur cancels.
- Keep one combined archive while preserving the source view and quadrant of each task.

## Data model

Schema v4 normalizes the previous fixed `work` / `personal` fields:

```ts
BoardData {
  views: TaskView[];
  archives: Record<ViewId, ArchiveData>;
}

TaskView {
  id: string;
  title: string;
  order: number;
  columns: Column[];
}
```

Every view contains columns with identical `id/title/order` definitions, but each column owns a separate `tasks` array. New views clone definitions only.

Settings schema v5 adds two Markdown layouts:

- `syncMode: 'aggregate'` uses `aggregate.filePath` for one generated note containing active and archived tasks across every view and quadrant.
- `syncMode: 'per-view'` retains the v4 `viewSyncTargets[viewId]` and separate archive target for compatibility.

Aggregate Markdown renders current view and quadrant titles for people while hidden comments carry stable view, column, and task IDs. Labels can therefore be renamed without becoming storage identities.

## Migration

- v4 data is sanitized and reconciled so all views contain the union of quadrant definitions.
- fixed `work/personal/workArchive/personalArchive` data migrates to two task views without moving tasks between them.
- legacy `{ columns }` data becomes the work view; the personal view starts empty with the same quadrants.
- fixed `settings.work/settings.personal` sync paths migrate to `viewSyncTargets`.
- settings with any existing per-view or archive path migrate to `syncMode: 'per-view'`; settings without configured paths use the recommended aggregate mode.
- existing synchronized Markdown files are never moved, renamed, or deleted by the migration.

## UI behavior

- Toolbar renders all task views and an add button before archive.
- Clicking add replaces the button with a text input. Only a non-composing Enter creates the view. Escape or blur cancels.
- Right-clicking a task view opens rename/delete actions. Rename uses an inline input; deletion requires confirmation and is disabled for the last remaining view.
- Deleting a task view removes its active tasks, archive data, and sync target. Existing synchronized Markdown files are left untouched.
- Quadrant add follows the same Enter-only behavior and no confirmation icon is rendered.
- New task views immediately contain every shared quadrant with zero tasks.
- In aggregate mode, adding, renaming, reordering, or deleting a view or quadrant regenerates the one configured note.
- Configuring a valid sync path schedules synchronization and creates a missing directory or Markdown file.

## Safety and verification

- Titles are trimmed and empty titles are rejected.
- At least one task view is always retained.
- IDs are generated internally and never derived from user text.
- Text is rendered with DOM text APIs, not HTML injection.
- Tests cover legacy migration, 3+ views, shared quadrants, independent tasks, and Enter-only behavior.
- Tests cover sync-mode migration, aggregate stable IDs, missing-path behavior, automatic file creation, and preservation of per-view compatibility.
