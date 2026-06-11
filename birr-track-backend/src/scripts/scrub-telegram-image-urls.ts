/**
 * One-off cleanup: transactions written before object storage existed hold Telegram
 * download URLs in `imageUrl`, which embed the bot token and expired long ago.
 * The images are unrecoverable, so the URLs are nulled out.
 *
 * Run with: pnpm run scrub:image-urls
 */
import dataSource from '../database/data-source'

async function main(): Promise<void> {
	await dataSource.initialize()

	try {
		const result: unknown = await dataSource.query(`UPDATE transactions SET "imageUrl" = NULL WHERE "imageUrl" LIKE '%api.telegram.org%' RETURNING id`)
		const scrubbedRows = Array.isArray(result) && Array.isArray(result[0]) ? (result[0] as unknown[]) : []
		console.log(`Scrubbed ${scrubbedRows.length} transaction(s) with token-bearing Telegram URLs`)
	} finally {
		await dataSource.destroy()
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'Unknown error'
	console.error(`Scrub failed: ${message}`)
	process.exit(1)
})
