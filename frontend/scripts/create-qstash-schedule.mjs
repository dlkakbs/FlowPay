import { Client } from '@upstash/qstash'

const token = process.env.QSTASH_TOKEN
const destination = process.env.QSTASH_DESTINATION_URL

if (!token || !destination) {
  throw new Error('Set QSTASH_TOKEN and QSTASH_DESTINATION_URL before creating the schedule.')
}

const url = new URL(destination)
if (url.protocol !== 'https:') {
  throw new Error('QSTASH_DESTINATION_URL must be an HTTPS URL.')
}

const client = new Client({ token })
const result = await client.schedules.create({
  destination: url.toString(),
  cron: '*/5 * * * *',
  scheduleId: 'flowpay-settlement',
  retries: 3,
})

console.log(`FlowPay settlement schedule ready: ${result.scheduleId}`)
