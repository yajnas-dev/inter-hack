// One-time: turns the local standalone mongod (started with --replSet rs0) into a single-node replica set.
// Needed for multi-document transactions and change streams. Safe to run again.
const { MongoClient } = require('mongodb');

const host = process.env.MONGO_HOST || '127.0.0.1:27017';

(async () => {
  const client = new MongoClient(`mongodb://${host}/?directConnection=true`, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const admin = client.db('admin');
  try {
    await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host }] } });
    console.log('replica set rs0 initiated');
  } catch (err) {
    if (err.codeName === 'AlreadyInitialized') console.log('replica set rs0 already initiated');
    else throw err;
  }
  for (let i = 0; i < 30; i += 1) {
    const hello = await admin.command({ hello: 1 });
    if (hello.isWritablePrimary) {
      console.log('primary is ready');
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await client.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
