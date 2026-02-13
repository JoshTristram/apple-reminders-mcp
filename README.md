# MCP Apple Reminders

Model Context Protocol (MCP) server for interacting with Apple Reminders on macOS.

## Features

- List reminder lists (`getLists`)
- Read reminders from a list (`getReminders`)
- Read reminders from virtual smart lists (`Smart: All`, `Smart: Today`, `Smart: Scheduled`, `Smart: Flagged`, `Smart: Completed`, `Smart: Overdue`)
- Create reminders with due date, notes, flag, priority, tags, and location metadata (`createReminder`)
- List known tags (`getTags`)
- Update reminder attributes (`setReminderAttributes`)
- Mark reminders complete (`completeReminder`)
- Delete reminders (`deleteReminder`)
- Standardized JSON responses with error details for easier client handling

## Requirements

- macOS (Apple Reminders automation is macOS-only)
- Node.js 18+
- Yarn 1.x
- Apple Reminders configured with at least one list

## Install

```bash
yarn install
yarn build
```

## Use with MCP Clients

Example `claude_desktop_config.json` entry:

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "node",
      "args": [
        "/absolute/path/to/apple-reminders-mcp/dist/index.js"
      ]
    }
  }
}
```

## Tool API

### `getLists`

Returns all regular reminder list names plus built-in smart list names:

- `Smart: All`
- `Smart: Today`
- `Smart: Scheduled`
- `Smart: Flagged`
- `Smart: Completed`
- `Smart: Overdue`

### `getReminders`

Parameters:
- `listName` (string, required)

Returns reminders from the given list with:
- `name`
- `completed`
- `dueDate` (ISO string or `null`)
- `flagged`
- `priority`
- `notes` (string or `null`)
- `tags` (string array)
- `location` (`null` or object with `title`, `latitude`, `longitude`, `radiusMeters`, `proximity`)

`listName` can be either a regular list name or one of the smart list names above.

### `createReminder`

Parameters:
- `listName` (string, required)
- `title` (string, required)
- `dueDate` (string, optional; must be a valid date string)
- `notes` (string, optional)
- `flagged` (boolean, optional)
- `priority` (integer `0-9`, optional)
- `tags` (string array, optional)
- `location` (object, optional)
  - `title` (string, optional)
  - `latitude` (number, optional, requires `longitude`)
  - `longitude` (number, optional, requires `latitude`)
  - `radiusMeters` (number > 0, optional)
  - `proximity` (`arriving` | `leaving`, optional)

`createReminder` requires a regular list name. Smart lists are read/query targets and cannot be used as create destinations.

### `getTags`

Parameters:
- `listName` (string, optional)

Returns all deduplicated tags that were added via this MCP server.

When `listName` is provided, it can be either a regular list name or a smart list name.

### `setReminderAttributes`

Parameters:
- `listName` (string, required)
- `reminderName` (string, required)
- `flagged` (boolean, optional)
- `priority` (integer `0-9`, optional)
- `tags` (string array, optional; set `[]` to clear)
- `location` (object or `null`, optional; set `null` to clear)

### `completeReminder`

Parameters:
- `listName` (string, required)
- `reminderName` (string, required)

Marks the first reminder with matching name as completed.

`listName` supports both regular and smart list names.

### `deleteReminder`

Parameters:
- `listName` (string, required)
- `reminderName` (string, required)

Deletes the first reminder with matching name.

`listName` supports both regular and smart list names.

## Development

Scripts:

- `yarn build` compiles TypeScript to `dist/`
- `yarn typecheck` runs type-checking without emitting files
- `yarn dev` starts from TypeScript source
- `yarn test` runs integration tests (`build` + test runner)

Test notes:

- `yarn test` interacts with real Apple Reminders data.
- It creates, completes, and deletes a temporary reminder in your first available list.

## Implementation Notes

- Core MCP tool registration: `src/index.ts`
- Apple Reminders integration wrapper: `src/reminders.ts`
- Integration test flow: `src/tests/test-reminders.ts`

### Tags and location behavior

Apple Reminders automation exposes `flagged` and `priority` natively via JXA, but does not reliably expose writable/readable tag and location fields in this runtime.
To provide stable MCP behavior, this server stores tags and location metadata in reminder notes and rehydrates it on read.

## License

MIT
