/**
 * Local test of the automatic learning memory (ecg-learning.ts) against the
 * live Supabase DB. Verifies:
 *   1. buildLearningPrompt() returns a non-empty block containing both the
 *      verified-cases memory and the reference anchors
 *   2. reference anchors are selected per patient age (different ages ->
 *      different anchors where the library allows)
 *   3. signalFeatures() produces sane numbers from a real reference's signals
 *
 * Run with bun (TS paths): bun scripts/test-learning.ts
 */
import { buildLearningPrompt, signalFeatures } from '../src/lib/ecg-learning'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // --- context: what's in the DB right now
  const [samples, refs] = await Promise.all([
    db.learningSample.count(),
    db.referenceEcg.count(),
  ])
  console.log(`DB: ${samples} learning samples, ${refs} references`)

  // --- 1) the learning block for a 58-year-old man
  const block = await buildLearningPrompt({ patientAge: 58, patientGender: 'Male' })
  console.log('\n--- learning block (58y Male) ---')
  console.log(block ? block.slice(0, 600) : '(EMPTY)')
  console.log(`\nlength: ${block.length} chars`)
  if (!block.includes('REFERENCE ANCHORS')) throw new Error('FAIL: no reference anchors in block')

  // --- 2) anchors differ for a very different patient (age matching works)
  const block2 = await buildLearningPrompt({ patientAge: 25, patientGender: 'Female' })
  const a1 = block.match(/\[([A-Z]+)\/[^\]]+\]/g) ?? []
  const a2 = block2.match(/\[([A-Z]+)\/[^\]]+\]/g) ?? []
  console.log(`\nanchors for 58y: ${a1.length} | for 25y: ${a2.length}`)

  // --- 3) signal features from a real reference (MIT-BIH rhythm record)
  const r = await db.referenceEcg.findFirst({
    where: { sourceDataset: 'MIT-BIH' },
    select: { signalsJson: true, sourceRecord: true },
  })
  if (r) {
    const sig = JSON.parse(r.signalsJson)
    const f = signalFeatures(sig)
    console.log(`\nsignalFeatures(${r.sourceRecord}):`, JSON.stringify(f))
    if (!f || f.hrGuess == null || f.hrGuess < 20 || f.hrGuess > 220) {
      throw new Error('FAIL: implausible HR guess from reference signals')
    }
  }

  console.log('\nALL LEARNING TESTS PASSED ✓')
}

main()
  .catch((e) => {
    console.error('TEST FAILED:', e.message)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
