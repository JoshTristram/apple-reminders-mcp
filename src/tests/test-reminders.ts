import * as reminders from '../reminders.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  check: () => Promise<T | null | false>,
  label: string,
  timeoutMs = 15000,
  intervalMs = 500
): Promise<T> {
  const end = Date.now() + timeoutMs;

  while (Date.now() < end) {
    const result = await check();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

/**
 * Test all reminders functions
 */
async function testReminders() {
  try {
    console.log('=== Testing Apple Reminders Functions ===');
    const smartAllList = 'Smart: All';
    const smartCompletedList = 'Smart: Completed';
    
    // Test 1: Get all reminder lists
    console.log('\n1. Getting all reminder lists...');
    const lists = await reminders.getRemindersLists();
    console.log('Available lists:', lists);
    
    const regularLists = lists.filter((name) => !name.startsWith('Smart:'));
    if (regularLists.length === 0) {
      throw new Error('No regular reminder lists found. Please create at least one non-smart list in the Reminders app.');
    }

    assert(lists.includes(smartAllList), 'Smart list "Smart: All" is not available');
    assert(lists.includes(smartCompletedList), 'Smart list "Smart: Completed" is not available');

    // Use the first regular list for testing
    const testList = regularLists[0];
    console.log(`\nUsing list "${testList}" for testing...`);
    
    // Test 2: Get reminders from the list
    console.log('\n2. Getting reminders from list...');
    const existingReminders = await reminders.getRemindersFromList(testList);
    console.log(`Existing reminders count: ${existingReminders.length}`);

    // Test 3: Create a new reminder
    const testReminderTitle = `Test Reminder ${new Date().toISOString()}`;
    const initialTags = ['mcp-test', 'mcp-location'];
    console.log(`\n3. Creating a new reminder: "${testReminderTitle}"...`);
    const createResult = await reminders.createReminder(
      testList, 
      testReminderTitle,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Due tomorrow
      'Created by MCP test script',
      true,
      5,
      initialTags,
      {
        title: 'Home',
        latitude: 37.3349,
        longitude: -122.009
      }
    );
    console.log('Create result:', createResult);
    assert(createResult, 'Failed to create reminder');
    
    // Test 4: Verify the reminder was created
    console.log('\n4. Verifying the reminder was created...');
    const createdReminder = await waitFor(
      async () => {
        const updatedReminders = await reminders.getRemindersFromList(testList);
        return updatedReminders.find(r => r.name === testReminderTitle) ?? null;
      },
      'reminder creation'
    );
    console.log('Found created reminder:', createdReminder);
    
    if (!createdReminder) {
      throw new Error('Failed to find the created reminder');
    }

    assert(createdReminder.flagged, 'Reminder was not created with flagged status');
    assert(createdReminder.priority === 5, 'Reminder was not created with priority 5');
    assert(
      initialTags.every((tag) => createdReminder.tags.includes(tag)),
      'Reminder was not created with all expected tags'
    );
    assert(createdReminder.location?.title === 'Home', 'Reminder was not created with location title');

    // Test 5: Get tag list
    console.log('\n5. Getting tags...');
    const tags = await reminders.getTags(testList);
    console.log('Tags:', tags);
    assert(tags.includes('mcp-test'), 'Expected tag not found in getTags result');

    // Test 6: Update reminder attributes
    console.log('\n6. Updating reminder attributes...');
    const updateResult = await reminders.setReminderAttributes(testList, testReminderTitle, {
      flagged: false,
      priority: 1,
      tags: ['mcp-updated'],
      location: null
    });
    console.log('Update result:', updateResult);
    assert(updateResult, 'Failed to update reminder attributes');

    // Test 7: Verify attributes were updated
    console.log('\n7. Verifying reminder attributes were updated...');
    const updatedReminder = await waitFor(
      async () => {
        const updatedReminders = await reminders.getRemindersFromList(testList);
        return updatedReminders.find(
          (r) =>
            r.name === testReminderTitle &&
            !r.flagged &&
            r.priority === 1 &&
            r.tags.length === 1 &&
            r.tags[0] === 'mcp-updated' &&
            r.location === null
        ) ?? null;
      },
      'attribute updates'
    );
    console.log('Updated reminder:', updatedReminder);
    assert(updatedReminder, 'Updated reminder not found');
    
    // Test 8: Mark the reminder as completed
    console.log('\n8. Marking the reminder as completed...');
    const completeResult = await reminders.completeReminder(testList, testReminderTitle);
    console.log('Complete result:', completeResult);
    assert(completeResult, 'Failed to mark reminder as completed');
    
    // Test 9: Verify the reminder was completed
    console.log('\n9. Verifying the reminder was completed...');
    const completedReminder = await waitFor(
      async () => {
        const completedReminders = await reminders.getRemindersFromList(testList);
        return completedReminders.find(
          (r) => r.name === testReminderTitle && r.completed
        ) ?? null;
      },
      'reminder completion'
    );
    console.log('Completed reminder:', completedReminder);
    assert(completedReminder, 'Completed reminder not found');
    assert(completedReminder.completed, 'Reminder was not marked completed');
    
    // Test 10: Delete the reminder
    console.log('\n10. Deleting the test reminder...');
    const deleteResult = await reminders.deleteReminder(testList, testReminderTitle);
    console.log('Delete result:', deleteResult);
    assert(deleteResult, 'Failed to delete reminder');
    
    // Test 11: Verify the reminder was deleted
    console.log('\n11. Verifying the reminder was deleted...');
    const deleted = await waitFor(
      async () => {
        const finalReminders = await reminders.getRemindersFromList(testList);
        return !finalReminders.some((r) => r.name === testReminderTitle);
      },
      'reminder deletion'
    );
    console.log('Deleted reminder found:', deleted ? 'No (success)' : 'Yes (error)');
    assert(deleted, 'Reminder was not deleted');
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exitCode = 1;
  }
}

// Run the tests
testReminders(); 
