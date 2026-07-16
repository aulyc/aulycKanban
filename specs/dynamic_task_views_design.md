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

Settings schema v6 replaces the two Markdown layouts with one managed-note model:

- `syncFolder` is the one user-facing location for synchronized Markdown.
- `viewSyncTargets[viewId]` and the archive target are internal managed paths below that folder.
- every view note carries a hidden stable view ID; filenames remain human-readable and may follow renamed titles.

The legacy aggregate target is migration-only and is never deleted automatically.

## Migration

- v4 data is sanitized and reconciled so all views contain the union of quadrant definitions.
- fixed `work/personal/workArchive/personalArchive` data migrates to two task views without moving tasks between them.
- legacy `{ columns }` data becomes the work view; the personal view starts empty with the same quadrants.
- fixed `settings.work/settings.personal` sync paths migrate to internal `viewSyncTargets`.
- an existing per-view, archive, or aggregate path contributes its parent folder; otherwise the default is `X-aulyc看板`.
- existing marker-owned per-view notes are adopted and updated; an old aggregate note is preserved unchanged.

## UI behavior

- Toolbar renders all task views and an add button before archive.
- Clicking add replaces the button with a text input. Only a non-composing Enter creates the view. Escape or blur cancels.
- Right-clicking a task view opens rename/delete actions. Rename uses an inline input; deletion requires confirmation and is disabled for the last remaining view.
- Deleting a task view removes its active tasks, archive data, and sync target. Its marker-owned Markdown is moved to the `已删除任务类型` recovery folder.
- Quadrant add follows the same Enter-only behavior and no confirmation icon is rendered.
- New task views immediately contain every shared quadrant with zero tasks.
- Adding a view creates its note; renaming a view renames its marker-owned note; changing the sync folder moves managed notes.
- A colliding non-managed note is never overwritten; the managed note receives a numbered filename.

## Safety and verification

- Titles are trimmed and empty titles are rejected.
- At least one task view is always retained.
- IDs are generated internally and never derived from user text.
- Text is rendered with DOM text APIs, not HTML injection.
- Tests cover legacy migration, 3+ views, shared quadrants, independent tasks, and Enter-only behavior.
- Tests cover legacy-layout migration, stable IDs, automatic creation and rename, deletion recovery, and collision safety.
