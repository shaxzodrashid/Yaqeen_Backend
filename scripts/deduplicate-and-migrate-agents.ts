import knex, { Knex } from 'knex';
import * as dotenv from 'dotenv';
import {
  AgentDeduplicationEngine,
  RawAgentRecord,
} from './agent-deduplication.engine';

dotenv.config();

// Knex database connection setup
const db: Knex = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'azm2shA08',
    database: process.env.DB_NAME || 'yaqeen_db',
  },
  pool: { min: 1, max: 5 },
});

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isVerbose = args.includes('--verbose');

  let threshold = 0.88;
  const thresholdIdx = args.indexOf('--threshold');
  if (thresholdIdx !== -1 && args[thresholdIdx + 1]) {
    threshold = parseFloat(args[thresholdIdx + 1]);
  }

  console.log(
    '================================================================',
  );
  console.log(
    '       YAQEEN BACKEND - INTELLIGENT AGENT DEDUPLICATION         ',
  );
  console.log(
    '================================================================',
  );
  console.log(
    ` Mode:        ${isApply ? 'APPLY (Write to Database)' : 'DRY RUN (Preview Only)'}`,
  );
  console.log(` Threshold:   ${threshold}`);
  console.log(` Timestamp:   ${new Date().toISOString()}`);
  console.log(
    '----------------------------------------------------------------\n',
  );

  try {
    // 1. Fetch distinct agent_names from cargo_registrations
    const cargoRows = await db('cargo_registrations')
      .select('id', 'agent_name', 'agent_id')
      .whereNotNull('agent_name');

    console.log(
      `🔍 Total cargo registration records analyzed: ${cargoRows.length}`,
    );

    // Fetch distinct carrier_names from cargo_consolidations
    const consolidationRows = await db('cargo_consolidations')
      .select('id', 'carrier_name', 'agent_id')
      .whereNotNull('carrier_name');

    console.log(
      `🔍 Total cargo consolidation records analyzed: ${consolidationRows.length}\n`,
    );

    // Group cargo records by raw agent_name
    const nameMap = new Map<
      string,
      { count: number; cargoIds: string[]; consolidationIds: string[] }
    >();

    for (const row of cargoRows) {
      const name = (row.agent_name || '').trim();
      if (!name) continue;
      const entry = nameMap.get(name) || {
        count: 0,
        cargoIds: [],
        consolidationIds: [],
      };
      entry.count += 1;
      entry.cargoIds.push(row.id);
      nameMap.set(name, entry);
    }

    for (const row of consolidationRows) {
      const name = (row.carrier_name || '').trim();
      if (!name) continue;
      const entry = nameMap.get(name) || {
        count: 0,
        cargoIds: [],
        consolidationIds: [],
      };
      entry.consolidationIds.push(row.id);
      nameMap.set(name, entry);
    }

    const rawRecords: RawAgentRecord[] = Array.from(nameMap.entries()).map(
      ([name, data]) => ({
        name,
        count: data.count,
        cargoIds: data.cargoIds,
        consolidationIds: data.consolidationIds,
      }),
    );

    console.log(
      `📊 Found ${rawRecords.length} distinct raw agent/carrier name variations in DB.`,
    );

    if (rawRecords.length === 0) {
      console.log(
        'ℹ️  No cargo registrations or consolidations with agent names found. Nothing to process.',
      );
      await db.destroy();
      return;
    }

    // 2. Run Intelligent Deduplication Engine
    const engine = new AgentDeduplicationEngine({ threshold });
    const clusteredAgents = engine.clusterAgentRecords(rawRecords);

    console.log(
      `✨ Successfully consolidated into ${clusteredAgents.length} unique canonical agents!\n`,
    );

    console.log(
      '----------------------------------------------------------------',
    );
    console.log(
      '                     DEDUPLICATION CLUSTERS                     ',
    );
    console.log(
      '----------------------------------------------------------------',
    );

    clusteredAgents.forEach((agent, idx) => {
      const typeLabel = agent.company_name ? 'Company' : 'Person';
      const nameInfo = agent.company_name
        ? `Company: "${agent.company_name}"`
        : `First: "${agent.first_name || ''}", Last: "${agent.last_name || ''}"`;

      console.log(
        `\n[Agent #${idx + 1}] Canonical: "${agent.canonicalName}" (${typeLabel})`,
      );
      console.log(`  Parsed:       ${nameInfo}`);
      if (agent.company_names.length > 0) {
        console.log(
          `  Companies:    [${agent.company_names.map((c) => `"${c}"`).join(', ')}]`,
        );
      }
      console.log(`  Linked Cargos: ${agent.totalCargos}`);
      console.log(`  Raw Variations (${agent.variations.length}):`);
      for (const v of agent.variations) {
        console.log(`    - "${v.name}" (${v.count} cargos)`);
      }
    });

    console.log(
      '\n================================================================',
    );

    // 3. Apply to Database if --apply is set
    if (isApply) {
      console.log('🚀 Starting transactional database migration...');

      let createdAgentsCount = 0;
      let linkedCargoCount = 0;
      let linkedConsolidationCount = 0;

      await db.transaction(async (trx) => {
        for (const cluster of clusteredAgents) {
          // Check if an agent with this canonical name / company already exists in DB
          const existingAgent = await trx('agents')
            .where((builder) => {
              if (cluster.company_name) {
                builder.whereILike('company_name', cluster.company_name);
              } else if (cluster.first_name && cluster.last_name) {
                builder
                  .whereILike('first_name', cluster.first_name)
                  .andWhereILike('last_name', cluster.last_name);
              } else if (cluster.first_name) {
                builder.whereILike('first_name', cluster.first_name);
              }
            })
            .first();

          let agentId: string;

          if (existingAgent) {
            agentId = existingAgent.id;
            if (isVerbose) {
              console.log(
                `  Matched existing agent in DB: ID=${agentId}, Name="${cluster.canonicalName}"`,
              );
            }
          } else {
            const [newAgent] = await trx('agents')
              .insert({
                first_name: cluster.first_name,
                last_name: cluster.last_name,
                company_name: cluster.company_name,
                company_names: JSON.stringify(cluster.company_names),
                notes: `Automatically created by Intelligent Agent Deduplication Script from: ${cluster.variations.map((v) => v.name).join(', ')}`,
                is_active: true,
              })
              .returning('*');

            agentId = newAgent.id;
            createdAgentsCount++;
            if (isVerbose) {
              console.log(
                `  Created new agent: ID=${agentId}, Name="${cluster.canonicalName}"`,
              );
            }
          }

          // Link matching cargo_registrations
          if (cluster.cargoIds.length > 0) {
            const updated = await trx('cargo_registrations')
              .whereIn('id', cluster.cargoIds)
              .update({
                agent_id: agentId,
                agent_name: cluster.canonicalName,
              });
            linkedCargoCount += updated;
          }

          // Link matching cargo_consolidations
          if (cluster.consolidationIds.length > 0) {
            const updatedCons = await trx('cargo_consolidations')
              .whereIn('id', cluster.consolidationIds)
              .update({
                agent_id: agentId,
              });
            linkedConsolidationCount += updatedCons;
          }
        }
      });

      console.log('✅ TRANSACTION COMPLETED SUCCESSFULLY!');
      console.log(`   - Agents Created:        ${createdAgentsCount}`);
      console.log(`   - Cargos Linked:         ${linkedCargoCount}`);
      console.log(`   - Consolidations Linked: ${linkedConsolidationCount}`);
    } else {
      console.log('\n💡 DRY RUN COMPLETE - No changes made to database.');
      console.log('👉 To execute this migration and commit to DB, run:');
      console.log('   npm run agents:migrate');
      console.log(
        '   or: npx ts-node scripts/deduplicate-and-migrate-agents.ts --apply\n',
      );
    }
  } catch (error) {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

void main();
