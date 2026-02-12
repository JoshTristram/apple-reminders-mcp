# MCP Apple Reminders

Model Context Protocol (MCP) server for interacting with Apple Reminders on macOS.

## Features

- List reminder lists (`getLists`)
- Read reminders from a list (`getReminders`)
- Create reminders with optional due date and notes (`createReminder`)
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

Returns all reminder list names.

### `getReminders`

Parameters:
- `listName` (string, required)

Returns reminders from the given list with:
- `name`
- `completed`
- `dueDate` (ISO string or `null`)
- `priority`
- `notes` (string or `null`)

### `createReminder`

Parameters:
- `listName` (string, required)
- `title` (string, required)
- `dueDate` (string, optional; must be a valid date string)
- `notes` (string, optional)

### `completeReminder`

Parameters:
- `listName` (string, required)
- `reminderName` (string, required)

Marks the first reminder with matching name as completed.

### `deleteReminder`

Parameters:
- `listName` (string, required)
- `reminderName` (string, required)

Deletes the first reminder with matching name.

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

## License

MIT
