import * as reminders from "node-reminders";

type ReminderList = Awaited<ReturnType<typeof reminders.getLists>>[number];
type ReminderItem = Awaited<ReturnType<typeof reminders.getReminders>>[number];
type ReminderProp = keyof ReminderItem | "flagged";

type ReminderItemWithExtras = Partial<ReminderItem> & {
  id?: string;
  name?: string;
  body?: string | null;
  completed?: boolean;
  dueDate?: Date | string | null;
  priority?: number;
  flagged?: boolean;
};

const METADATA_PREFIX = "[[mcp-reminder-meta:";
const METADATA_SUFFIX = "]]";
const SMART_LIST_PREFIX = "Smart: ";
const SMART_FILTER_PROPS = ["id", "name", "completed", "dueDate", "flagged"] as const;

interface ReminderCreatePayload {
  name: string;
  dueDate?: Date;
  body?: string;
  priority?: number;
  flagged?: boolean;
}

interface SmartListDefinition {
  name: string;
  aliases?: string[];
  predicate: (item: ReminderItemWithExtras) => boolean;
}

type ResolvedList =
  | { kind: "regular"; list: ReminderList }
  | { kind: "smart"; smartList: SmartListDefinition };

export interface ReminderLocation {
  title?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  proximity?: "arriving" | "leaving";
}

interface ReminderMetadata {
  tags?: string[];
  location?: ReminderLocation;
}

interface ReminderBodyParts {
  notes: string | null;
  metadata: ReminderMetadata;
}

interface ReminderAttributesUpdate {
  flagged?: boolean;
  priority?: number;
  tags?: string[];
  location?: ReminderLocation | null;
}

export interface ReminderRecord {
  name: string;
  completed: boolean;
  dueDate: string | null;
  flagged: boolean;
  priority: number;
  notes: string | null;
  tags: string[];
  location: ReminderLocation | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeListName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDateValue(date: Date | string | null | undefined): Date | null {
  if (!date) return null;

  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return null;
  // node-reminders may represent "no due date" as Unix epoch.
  if (dateObj.getTime() === 0) return null;
  return dateObj;
}

function isCompleted(item: ReminderItemWithExtras): boolean {
  return item.completed ?? false;
}

function isFlagged(item: ReminderItemWithExtras): boolean {
  return item.flagged ?? false;
}

function dueDateOf(item: ReminderItemWithExtras): Date | null {
  return normalizeDateValue(item.dueDate);
}

function isDueToday(item: ReminderItemWithExtras): boolean {
  const dueDate = dueDateOf(item);
  if (!dueDate) {
    return false;
  }

  const now = new Date();
  return (
    dueDate.getFullYear() === now.getFullYear() &&
    dueDate.getMonth() === now.getMonth() &&
    dueDate.getDate() === now.getDate()
  );
}

function isOverdue(item: ReminderItemWithExtras): boolean {
  const dueDate = dueDateOf(item);
  if (!dueDate || isCompleted(item)) {
    return false;
  }
  return dueDate.getTime() < Date.now();
}

function parseDueDate(dueDate: string): Date {
  const parsedDate = new Date(dueDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Invalid dueDate "${dueDate}". Use an ISO-compatible date string.`);
  }
  return parsedDate;
}

const SMART_LISTS: ReadonlyArray<SmartListDefinition> = [
  {
    name: "All",
    aliases: ["all reminders"],
    predicate: () => true
  },
  {
    name: "Today",
    predicate: (item) => !isCompleted(item) && isDueToday(item)
  },
  {
    name: "Scheduled",
    aliases: ["planned"],
    predicate: (item) => !isCompleted(item) && dueDateOf(item) !== null
  },
  {
    name: "Flagged",
    predicate: (item) => !isCompleted(item) && isFlagged(item)
  },
  {
    name: "Completed",
    predicate: (item) => isCompleted(item)
  },
  {
    name: "Overdue",
    predicate: (item) => isOverdue(item)
  }
];

function smartListDisplayName(smartListName: string): string {
  return `${SMART_LIST_PREFIX}${smartListName}`;
}

function getSmartListByName(listName: string): SmartListDefinition | null {
  const normalizedName = normalizeListName(listName);
  const normalizedStrippedName = normalizedName.startsWith("smart:")
    ? normalizedName.slice("smart:".length).trim()
    : normalizedName;

  for (const smartList of SMART_LISTS) {
    const canonicalName = normalizeListName(smartList.name);
    if (normalizedStrippedName === canonicalName || normalizedName === canonicalName) {
      return smartList;
    }

    if (smartList.aliases?.some((alias) => normalizeListName(alias) === normalizedStrippedName)) {
      return smartList;
    }
  }

  return null;
}

async function getRegularListByName(listName: string): Promise<ReminderList | null> {
  const lists = await reminders.getLists();
  const normalizedName = normalizeListName(listName);
  return (
    lists.find((list) => normalizeListName(list.name) === normalizedName) ??
    null
  );
}

async function resolveListByName(listName: string): Promise<ResolvedList> {
  const regularList = await getRegularListByName(listName);
  if (regularList) {
    return { kind: "regular", list: regularList };
  }

  const smartList = getSmartListByName(listName);
  if (smartList) {
    return { kind: "smart", smartList };
  }

  throw new Error(`List "${listName}" not found`);
}

function mergeReminderProps(
  ...propSets: ReadonlyArray<ReadonlyArray<ReminderProp>>
): ReadonlyArray<ReminderProp> {
  const mergedProps = new Set<ReminderProp>();
  for (const propSet of propSets) {
    for (const prop of propSet) {
      mergedProps.add(prop);
    }
  }
  return Array.from(mergedProps);
}

async function fetchRemindersByListId(
  listId: string,
  props: ReadonlyArray<ReminderProp>
): Promise<ReadonlyArray<ReminderItemWithExtras>> {
  return (await reminders.getReminders(
    listId,
    props as unknown as ReadonlyArray<keyof ReminderItem>
  )) as ReadonlyArray<ReminderItemWithExtras>;
}

async function fetchAllReminders(
  props: ReadonlyArray<ReminderProp>
): Promise<ReadonlyArray<ReminderItemWithExtras>> {
  const lists = await reminders.getLists();
  const mergedProps = mergeReminderProps(props, SMART_FILTER_PROPS);

  const remindersByList = await Promise.all(
    lists.map((list) => fetchRemindersByListId(list.id, mergedProps))
  );

  const allItems: ReminderItemWithExtras[] = [];
  const seenIds = new Set<string>();

  for (const listItems of remindersByList) {
    for (const item of listItems) {
      if (typeof item.id === "string") {
        if (seenIds.has(item.id)) {
          continue;
        }
        seenIds.add(item.id);
      }
      allItems.push(item);
    }
  }

  return allItems;
}

async function fetchRemindersForList(
  listName: string,
  props: ReadonlyArray<ReminderProp>
): Promise<ReadonlyArray<ReminderItemWithExtras>> {
  const resolvedList = await resolveListByName(listName);

  if (resolvedList.kind === "regular") {
    return fetchRemindersByListId(resolvedList.list.id, props);
  }

  const mergedProps = mergeReminderProps(props, SMART_FILTER_PROPS);
  const allItems = await fetchAllReminders(mergedProps);
  return allItems.filter((item) => resolvedList.smartList.predicate(item));
}

/**
 * Format a date string for consistency
 */
function formatDate(date: Date | string | null | undefined): string | null {
  try {
    const dateObj = normalizeDateValue(date);
    if (!dateObj) return null;
    return dateObj.toISOString();
  } catch (error) {
    console.error("Date formatting error:", error);
    return null;
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const tag of tags) {
    const normalized = tag.trim().replace(/^#+/, "");
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  }

  return Array.from(deduped.values());
}

function normalizeLocation(
  location: ReminderLocation | null | undefined,
  strict: boolean
): ReminderLocation | null {
  if (!location) {
    return null;
  }

  const normalized: ReminderLocation = {};

  if (typeof location.title === "string" && location.title.trim()) {
    normalized.title = location.title.trim();
  }

  if (typeof location.latitude === "number" && Number.isFinite(location.latitude)) {
    if (location.latitude < -90 || location.latitude > 90) {
      if (strict) {
        throw new Error("location.latitude must be between -90 and 90");
      }
    } else {
      normalized.latitude = location.latitude;
    }
  }

  if (typeof location.longitude === "number" && Number.isFinite(location.longitude)) {
    if (location.longitude < -180 || location.longitude > 180) {
      if (strict) {
        throw new Error("location.longitude must be between -180 and 180");
      }
    } else {
      normalized.longitude = location.longitude;
    }
  }

  if (typeof location.radiusMeters === "number" && Number.isFinite(location.radiusMeters)) {
    if (location.radiusMeters <= 0) {
      if (strict) {
        throw new Error("location.radiusMeters must be greater than 0");
      }
    } else {
      normalized.radiusMeters = location.radiusMeters;
    }
  }

  if (location.proximity === "arriving" || location.proximity === "leaving") {
    normalized.proximity = location.proximity;
  } else if (location.proximity !== undefined && strict) {
    throw new Error('location.proximity must be "arriving" or "leaving"');
  }

  const hasLatitude = normalized.latitude !== undefined;
  const hasLongitude = normalized.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    if (strict) {
      throw new Error("location.latitude and location.longitude must be provided together");
    }
    delete normalized.latitude;
    delete normalized.longitude;
  }

  if (Object.keys(normalized).length === 0) {
    return null;
  }

  return normalized;
}

function encodeMetadata(metadata: ReminderMetadata): string | null {
  const tags = normalizeTags(metadata.tags);
  const location = normalizeLocation(metadata.location, false);
  const compactMetadata: ReminderMetadata = {};

  if (tags.length > 0) {
    compactMetadata.tags = tags;
  }
  if (location) {
    compactMetadata.location = location;
  }

  if (Object.keys(compactMetadata).length === 0) {
    return null;
  }

  return Buffer.from(JSON.stringify(compactMetadata), "utf8").toString("base64url");
}

function composeReminderBody(notes: string | undefined, metadata: ReminderMetadata): string | undefined {
  const encodedMetadata = encodeMetadata(metadata);
  const hasNotes = typeof notes === "string" && notes.trim().length > 0;

  if (!encodedMetadata) {
    return hasNotes ? notes : undefined;
  }

  const marker = `${METADATA_PREFIX}${encodedMetadata}${METADATA_SUFFIX}`;
  return hasNotes ? `${notes}\n\n${marker}` : marker;
}

function parseReminderBody(body: string | null | undefined): ReminderBodyParts {
  if (!body) {
    return { notes: null, metadata: {} };
  }

  const metadataPattern = /\s*\[\[mcp-reminder-meta:([A-Za-z0-9_-]+)\]\]\s*$/;
  const match = body.match(metadataPattern);
  if (!match) {
    return { notes: body, metadata: {} };
  }

  const encoded = match[1];
  const markerIndex = match.index ?? body.length;
  const notesPortion = body.slice(0, markerIndex).trimEnd();

  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as ReminderMetadata;
    return {
      notes: notesPortion || null,
      metadata: {
        tags: normalizeTags(parsed.tags),
        location: normalizeLocation(parsed.location, false) ?? undefined
      }
    };
  } catch (error) {
    console.error("Failed to parse reminder metadata:", error);
    return { notes: body, metadata: {} };
  }
}

async function getReminderByName(
  listName: string,
  reminderName: string,
  properties: ReadonlyArray<ReminderProp>
): Promise<(ReminderItemWithExtras & { id: string }) | null> {
  const reminderItems = await fetchRemindersForList(
    listName,
    mergeReminderProps(properties, ["id", "name"])
  );

  const targetReminder = reminderItems.find(
    (item): item is ReminderItemWithExtras & { id: string } =>
      item.name === reminderName && typeof item.id === "string"
  );

  return targetReminder ?? null;
}

/**
 * Get all reminder lists
 */
export async function getRemindersLists(): Promise<string[]> {
  try {
    const lists = await reminders.getLists();
    const regularListNames = lists.map((list) => list.name);
    const smartListNames = SMART_LISTS.map((smartList) =>
      smartListDisplayName(smartList.name)
    );
    return [...regularListNames, ...smartListNames];
  } catch (error) {
    console.error("Failed to get reminder lists:", error);
    throw new Error(`Failed to get reminder lists: ${getErrorMessage(error)}`);
  }
}

/**
 * Get reminders from a specific list
 */
export async function getRemindersFromList(listName: string): Promise<ReminderRecord[]> {
  try {
    const reminderItems = await fetchRemindersForList(listName, [
      "name",
      "completed",
      "dueDate",
      "priority",
      "body",
      "flagged"
    ]);

    // Format the reminders to match the expected output format
    return reminderItems.map((item) => {
      const bodyParts = parseReminderBody(item.body);
      return {
        name: item.name ?? "",
        completed: item.completed ?? false,
        dueDate: formatDate(item.dueDate),
        flagged: item.flagged ?? false,
        priority: item.priority ?? 0,
        notes: bodyParts.notes,
        tags: bodyParts.metadata.tags ?? [],
        location: bodyParts.metadata.location ?? null
      };
    });
  } catch (error) {
    console.error(`Failed to get reminders from list "${listName}":`, error);
    throw new Error(
      `Failed to get reminders from list "${listName}": ${getErrorMessage(error)}`
    );
  }
}

/**
 * Get all tags from reminders, optionally filtered by list
 */
export async function getTags(listName?: string): Promise<string[]> {
  try {
    const tags = new Map<string, string>();
    const reminderItems = listName
      ? await fetchRemindersForList(listName, ["name", "body"])
      : await fetchAllReminders(["name", "body"]);

    for (const reminderItem of reminderItems) {
      const parsed = parseReminderBody(reminderItem.body);
      const reminderTags = parsed.metadata.tags ?? [];
      for (const tag of reminderTags) {
        const key = tag.toLowerCase();
        if (!tags.has(key)) {
          tags.set(key, tag);
        }
      }
    }

    return Array.from(tags.values()).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error("Failed to get tags:", error);
    throw new Error(`Failed to get tags: ${getErrorMessage(error)}`);
  }
}

/**
 * Create a new reminder
 */
export async function createReminder(
  listName: string,
  title: string,
  dueDate?: string,
  notes?: string,
  flagged?: boolean,
  priority?: number,
  tags?: string[],
  location?: ReminderLocation
): Promise<boolean> {
  try {
    const resolvedList = await resolveListByName(listName);
    if (resolvedList.kind !== "regular") {
      throw new Error(
        `Cannot create reminders in smart list "${listName}". Select a regular reminder list.`
      );
    }

    // Prepare reminder data
    const reminderData: ReminderCreatePayload = {
      name: title
    };

    if (dueDate) {
      reminderData.dueDate = parseDueDate(dueDate);
    }

    const normalizedLocation = normalizeLocation(location, true);
    const reminderBody = composeReminderBody(notes, {
      tags: normalizeTags(tags),
      location: normalizedLocation ?? undefined
    });

    if (reminderBody !== undefined) {
      reminderData.body = reminderBody;
    }

    if (typeof flagged === "boolean") {
      reminderData.flagged = flagged;
    }

    if (typeof priority === "number") {
      reminderData.priority = priority;
    }

    // Create the reminder
    const newReminderId = await reminders.createReminder(resolvedList.list.id, reminderData);

    return !!newReminderId;
  } catch (error) {
    console.error(`Failed to create reminder "${title}" in list "${listName}":`, error);
    throw new Error(`Failed to create reminder: ${getErrorMessage(error)}`);
  }
}

/**
 * Set optional reminder attributes by reminder name
 */
export async function setReminderAttributes(
  listName: string,
  reminderName: string,
  attributes: ReminderAttributesUpdate
): Promise<boolean> {
  try {
    const targetReminder = await getReminderByName(listName, reminderName, [
      "name",
      "id",
      "body"
    ]);

    if (!targetReminder) {
      return false;
    }

    const updatePayload: Record<string, unknown> = {};

    if (typeof attributes.flagged === "boolean") {
      updatePayload.flagged = attributes.flagged;
    }

    if (typeof attributes.priority === "number") {
      updatePayload.priority = attributes.priority;
    }

    if (attributes.tags !== undefined || attributes.location !== undefined) {
      const bodyParts = parseReminderBody(targetReminder.body);
      const nextMetadata: ReminderMetadata = { ...bodyParts.metadata };

      if (attributes.tags !== undefined) {
        const normalizedTags = normalizeTags(attributes.tags);
        if (normalizedTags.length > 0) {
          nextMetadata.tags = normalizedTags;
        } else {
          delete nextMetadata.tags;
        }
      }

      if (attributes.location !== undefined) {
        const normalizedLocation =
          attributes.location === null ? null : normalizeLocation(attributes.location, true);
        if (normalizedLocation) {
          nextMetadata.location = normalizedLocation;
        } else {
          delete nextMetadata.location;
        }
      }

      const updatedBody = composeReminderBody(bodyParts.notes ?? undefined, nextMetadata);
      updatePayload.body = updatedBody ?? "";
    }

    if (Object.keys(updatePayload).length === 0) {
      return true;
    }

    await reminders.updateReminder(
      targetReminder.id,
      updatePayload as unknown as Partial<ReminderItem>
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to set reminder attributes for "${reminderName}" in list "${listName}":`,
      error
    );
    throw new Error(`Failed to set reminder attributes: ${getErrorMessage(error)}`);
  }
}

/**
 * Mark a reminder as completed
 */
export async function completeReminder(listName: string, reminderName: string): Promise<boolean> {
  try {
    const targetReminder = await getReminderByName(listName, reminderName, ["name", "id"]);

    if (!targetReminder) {
      return false; // Reminder not found
    }

    // Update the reminder to mark it as completed
    await reminders.updateReminder(targetReminder.id, {
      completed: true
    });

    return true;
  } catch (error) {
    console.error(`Failed to complete reminder "${reminderName}" in list "${listName}":`, error);
    throw new Error(`Failed to complete reminder: ${getErrorMessage(error)}`);
  }
}

/**
 * Delete a reminder
 */
export async function deleteReminder(listName: string, reminderName: string): Promise<boolean> {
  try {
    const targetReminder = await getReminderByName(listName, reminderName, ["name", "id"]);

    if (!targetReminder) {
      return false; // Reminder not found
    }

    // Delete the reminder
    await reminders.deleteReminder(targetReminder.id);

    return true;
  } catch (error) {
    console.error(`Failed to delete reminder "${reminderName}" in list "${listName}":`, error);
    throw new Error(`Failed to delete reminder: ${getErrorMessage(error)}`);
  }
}
