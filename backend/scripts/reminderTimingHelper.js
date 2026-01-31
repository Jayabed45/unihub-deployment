// Simple helper script to calculate activity schedule and reminder times
// Usage (from project root):
//   node backend/scripts/reminderTimingHelper.js <startInMinutes> <durationInMinutes>
// Example:
//   node backend/scripts/reminderTimingHelper.js 2 30
//   -> start in 2 minutes from now, end 30 minutes after start

function pad2(n) {
  return n.toString().padStart(2, '0');
}

function format(dt) {
  const year = dt.getFullYear();
  const month = pad2(dt.getMonth() + 1);
  const day = pad2(dt.getDate());
  const hours = pad2(dt.getHours());
  const minutes = pad2(dt.getMinutes());
  const seconds = pad2(dt.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatForInput(dt) {
  // For datetime-local input (YYYY-MM-DDTHH:MM)
  const year = dt.getFullYear();
  const month = pad2(dt.getMonth() + 1);
  const day = pad2(dt.getDate());
  const hours = pad2(dt.getHours());
  const minutes = pad2(dt.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const startInMinutes = Number(process.argv[2] || '2');
const durationMinutes = Number(process.argv[3] || '60');

if (!Number.isFinite(startInMinutes) || !Number.isFinite(durationMinutes)) {
  console.error('Usage: node backend/scripts/reminderTimingHelper.js <startInMinutes> <durationInMinutes>');
  process.exit(1);
}

const now = new Date();
const startAt = new Date(now.getTime() + startInMinutes * 60 * 1000);
const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

const thirtyBeforeStart = new Date(startAt.getTime() - 30 * 60 * 1000);
const tenBeforeStart = new Date(startAt.getTime() - 10 * 60 * 1000);
const tenBeforeEnd = new Date(endAt.getTime() - 10 * 60 * 1000);

console.log('Now:                 ', format(now));
console.log('--- Activity schedule ---');
console.log('Start at:            ', format(startAt));
console.log('End at:              ', format(endAt));
console.log('');
console.log('Use these values in the leader UI datetime fields:');
console.log('  Start (datetime-local):', formatForInput(startAt));
console.log('  End   (datetime-local):', formatForInput(endAt));
console.log('');
console.log('--- Expected reminders on participant Feeds ---');
console.log('30 minutes before:   ', format(thirtyBeforeStart));
console.log('10 minutes before:   ', format(tenBeforeStart));
console.log('At start:            ', format(startAt));
console.log('10 minutes before end:', format(tenBeforeEnd));
console.log('At end:              ', format(endAt));
