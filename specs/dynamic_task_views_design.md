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

Every view contains columns with identical `id/title/order` definitions, but each column owns a separate `tasks` array. New views clone definitions only. Settings store Markdown targets in `viewSyncTargets[viewId]`.

## Migration

- v4 data is sanitized and reconciled so all views contain the union of quadrant definitions.
- fixed `work/personal/workArchive/personalArchive` data migrates to two task views without moving tasks between them.
- legacy `{ columns }` data becomes the work view; the personal view starts empty with the same quadrants.
- fixed `settings.work/settings.personal` sync paths migrate to `viewSyncTargets`.

## UI behavior

- Toolbar renders all task views and an add button before archive.
- Clicking add replaces the button with a text input. Only a non-composing Enter creates the view. Escape or blur cancels.
- Quadrant add follows the same Enter-only behavior and no confirmation icon is rendered.
- New task views immediately contain every shared quadrant with zero tasks.

## Safety and verification

- Titles are trimmed and empty titles are rejected.
- IDs are generated internally and never derived from user text.
- Text is rendered with DOM text APIs, not HTML injection.
- Tests cover legacy migration, 3+ views, shared quadrants, independent tasks, and Enter-only behavior.
