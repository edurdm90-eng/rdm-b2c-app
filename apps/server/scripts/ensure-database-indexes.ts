import "dotenv/config";
import { client } from "@rdm-b2c/db";

type IndexKey = Record<string, 1 | -1>;
type IndexPlan = {
  collection: string;
  index: { key: IndexKey; name: string; unique?: boolean };
};

const plans: IndexPlan[] = [
  { collection: "user", index: { key: { email: 1 }, name: "user_email_unique", unique: true } },
  { collection: "session", index: { key: { token: 1 }, name: "session_token_unique", unique: true } },
  { collection: "session", index: { key: { userId: 1 }, name: "session_user_id" } },
  { collection: "session", index: { key: { expiresAt: 1 }, name: "session_expires_at" } },
  { collection: "account", index: { key: { providerId: 1, accountId: 1 }, name: "account_provider_account_unique", unique: true } },
  { collection: "account", index: { key: { userId: 1 }, name: "account_user_id" } },
  { collection: "verification", index: { key: { identifier: 1 }, name: "verification_identifier" } },
  { collection: "verification", index: { key: { expiresAt: 1 }, name: "verification_expires_at" } },
  { collection: "rateLimit", index: { key: { key: 1 }, name: "rate_limit_key_unique", unique: true } },
  { collection: "rateLimit", index: { key: { lastRequest: 1 }, name: "rate_limit_last_request" } },
];

async function duplicateCount(collection: string, key: IndexKey) {
  const fields = Object.keys(key);
  const id = Object.fromEntries(fields.map((field) => [field, `$${field}`]));
  const [duplicate] = await client.collection(collection).aggregate([
    { $group: { _id: id, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  return duplicate ? Number(duplicate.count) : 0;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const collectionNames = new Set((await client.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
  const missing: IndexPlan[] = [];

  for (const plan of plans) {
    if (!collectionNames.has(plan.collection)) {
      if (!apply) {
        console.log(`skip ${plan.collection}.${plan.index.name}: collection does not exist yet`);
        continue;
      }
      await client.createCollection(plan.collection);
      collectionNames.add(plan.collection);
    }
    const current = await client.collection(plan.collection).listIndexes().toArray();
    if (current.some(({ name }) => name === plan.index.name)) {
      console.log(`ok ${plan.collection}.${plan.index.name}`);
      continue;
    }
    if (plan.index.unique) {
      const duplicates = await duplicateCount(plan.collection, plan.index.key);
      if (duplicates > 0) {
        throw new Error(`${plan.collection}.${plan.index.name} cannot be created until duplicate records are resolved`);
      }
    }
    missing.push(plan);
    console.log(`${apply ? "create" : "missing"} ${plan.collection}.${plan.index.name}`);
  }

  if (apply) {
    for (const plan of missing) {
      await client.collection(plan.collection).createIndex(plan.index.key, {
        name: plan.index.name,
        ...(plan.index.unique ? { unique: true } : {}),
      });
    }
  } else if (missing.length > 0) {
    console.log(`dry run: ${missing.length} index(es) need creation; rerun with --apply`);
  }
}

try {
  await main();
} finally {
  await client.client.close();
}
