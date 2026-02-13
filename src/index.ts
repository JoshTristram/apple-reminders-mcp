import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as reminders from "./reminders.js";

type ToolResponse = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function successResponse(payload: object): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }]
  };
}

function failureResponse(message: string, error: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: message,
          details: errorMessage(error)
        })
      }
    ],
    isError: true
  };
}

const nonEmptyString = z.string().trim().min(1);
const priorityValue = z.number().int().min(0).max(9);
const tagValue = z.string().trim().min(1);

const locationSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radiusMeters: z.number().positive().optional(),
    proximity: z.enum(["arriving", "leaving"]).optional()
  })
  .refine(
    (value) =>
      (value.latitude === undefined && value.longitude === undefined) ||
      (value.latitude !== undefined && value.longitude !== undefined),
    "location.latitude and location.longitude must be provided together"
  )
  .refine(
    (value) =>
      value.title !== undefined ||
      value.latitude !== undefined ||
      value.longitude !== undefined ||
      value.radiusMeters !== undefined ||
      value.proximity !== undefined,
    "location must include at least one field"
  );

// Create a simple MCP server for Apple Reminders
const server = new McpServer({
  name: "apple-reminders",
  version: "1.0.0"
});

// Tool to get all reminder lists
server.tool(
  "getLists",
  {},
  async () => {
    try {
      const lists = await reminders.getRemindersLists();
      return successResponse({ lists });
    } catch (error) {
      return failureResponse("Failed to get reminder lists", error);
    }
  }
);

// Tool to get reminders from a specific list
server.tool(
  "getReminders",
  { listName: nonEmptyString },
  async ({ listName }) => {
    try {
      const items = await reminders.getRemindersFromList(listName);
      return successResponse({ reminders: items });
    } catch (error) {
      return failureResponse(`Failed to get reminders from list: ${listName}`, error);
    }
  }
);

// Tool to create a new reminder
server.tool(
  "createReminder",
  {
    listName: nonEmptyString,
    title: nonEmptyString,
    dueDate: z
      .string()
      .optional()
      .refine(
        (value) => value === undefined || !Number.isNaN(new Date(value).getTime()),
        "dueDate must be a valid date string"
      ),
    notes: z.string().optional(),
    flagged: z.boolean().optional(),
    priority: priorityValue.optional(),
    tags: z.array(tagValue).optional(),
    location: locationSchema.optional()
  },
  async ({ listName, title, dueDate, notes, flagged, priority, tags, location }) => {
    try {
      const success = await reminders.createReminder(
        listName,
        title,
        dueDate,
        notes,
        flagged,
        priority,
        tags,
        location
      );
      return successResponse({
        success,
        message: success ? "Reminder created" : "Failed to create reminder"
      });
    } catch (error) {
      return failureResponse("Failed to create reminder", error);
    }
  }
);

// Tool to get tags from reminders
server.tool(
  "getTags",
  {
    listName: nonEmptyString.optional()
  },
  async ({ listName }) => {
    try {
      const tags = await reminders.getTags(listName);
      return successResponse({ tags });
    } catch (error) {
      return failureResponse("Failed to get tags", error);
    }
  }
);

// Tool to set reminder attributes (flag/priority/tags/location)
server.tool(
  "setReminderAttributes",
  {
    listName: nonEmptyString,
    reminderName: nonEmptyString,
    flagged: z.boolean().optional(),
    priority: priorityValue.optional(),
    tags: z.array(tagValue).optional(),
    location: locationSchema.nullable().optional()
  },
  async ({ listName, reminderName, flagged, priority, tags, location }) => {
    try {
      const success = await reminders.setReminderAttributes(listName, reminderName, {
        flagged,
        priority,
        tags,
        location
      });
      return successResponse({
        success,
        message: success ? "Reminder attributes updated" : "Reminder not found"
      });
    } catch (error) {
      return failureResponse("Failed to set reminder attributes", error);
    }
  }
);

// Tool to mark a reminder as completed
server.tool(
  "completeReminder",
  {
    listName: nonEmptyString,
    reminderName: nonEmptyString
  },
  async ({ listName, reminderName }) => {
    try {
      const success = await reminders.completeReminder(listName, reminderName);
      return successResponse({
        success,
        message: success ? "Reminder marked as completed" : "Reminder not found"
      });
    } catch (error) {
      return failureResponse("Failed to complete reminder", error);
    }
  }
);

// Tool to delete a reminder
server.tool(
  "deleteReminder",
  {
    listName: nonEmptyString,
    reminderName: nonEmptyString
  },
  async ({ listName, reminderName }) => {
    try {
      const success = await reminders.deleteReminder(listName, reminderName);
      return successResponse({
        success,
        message: success ? "Reminder deleted" : "Reminder not found"
      });
    } catch (error) {
      return failureResponse("Failed to delete reminder", error);
    }
  }
);

// Start the server
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

runServer(); 
