import * as reminders from '../reminders.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Test all reminders functions
 */
async function testReminders() {
  try {
    console.log('=== Testing Apple Reminders Functions ===');
    
    // Test 1: Get all reminder lists
    console.log('\n1. Getting all reminder lists...');
    const lists = await reminders.getRemindersLists();
    console.log('Available lists:', lists);
    
    if (lists.length === 0) {
      throw new Error('No reminder lists found. Please create at least one list in the Reminders app.');
    }
    
    // Use the first list for testing
    const testList = lists[0];
    console.log(`\nUsing list "${testList}" for testing...`);
    
    // Test 2: Get reminders from the list
    console.log('\n2. Getting reminders from list...');
    const existingReminders = await reminders.getRemindersFromList(testList);
    console.log('Existing reminders:', existingReminders);
    
    // Test 3: Create a new reminder
    const testReminderTitle = `Test Reminder ${new Date().toISOString()}`;
    console.log(`\n3. Creating a new reminder: "${testReminderTitle}"...`);
    const createResult = await reminders.createReminder(
      testList, 
      testReminderTitle,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Due tomorrow
      'Created by MCP test script'
    );
    console.log('Create result:', createResult);
    assert(createResult, 'Failed to create reminder');
    
    // Wait a moment for the reminder to be created
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 4: Verify the reminder was created
    console.log('\n4. Verifying the reminder was created...');
    const updatedReminders = await reminders.getRemindersFromList(testList);
    const createdReminder = updatedReminders.find(r => r.name === testReminderTitle);
    console.log('Found created reminder:', createdReminder);
    
    if (!createdReminder) {
      throw new Error('Failed to find the created reminder');
    }
    
    // Test 5: Mark the reminder as completed
    console.log('\n5. Marking the reminder as completed...');
    const completeResult = await reminders.completeReminder(testList, testReminderTitle);
    console.log('Complete result:', completeResult);
    assert(completeResult, 'Failed to mark reminder as completed');
    
    // Wait a moment for the reminder to be updated
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 6: Verify the reminder was completed
    console.log('\n6. Verifying the reminder was completed...');
    const completedReminders = await reminders.getRemindersFromList(testList);
    const completedReminder = completedReminders.find(r => r.name === testReminderTitle);
    console.log('Completed reminder:', completedReminder);
    assert(completedReminder, 'Completed reminder not found');
    assert(completedReminder.completed, 'Reminder was not marked completed');
    
    // Test 7: Delete the reminder
    console.log('\n7. Deleting the test reminder...');
    const deleteResult = await reminders.deleteReminder(testList, testReminderTitle);
    console.log('Delete result:', deleteResult);
    assert(deleteResult, 'Failed to delete reminder');
    
    // Wait a moment for the reminder to be deleted
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 8: Verify the reminder was deleted
    console.log('\n8. Verifying the reminder was deleted...');
    const finalReminders = await reminders.getRemindersFromList(testList);
    const deletedReminder = finalReminders.find(r => r.name === testReminderTitle);
    console.log('Deleted reminder found:', deletedReminder ? 'Yes (error)' : 'No (success)');
    assert(!deletedReminder, 'Reminder was not deleted');
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exitCode = 1;
  }
}

// Run the tests
testReminders(); 
