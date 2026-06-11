/** Render an unknown caught value as a readable message without '[object Object]' surprises. */
export function describeError(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message
	}
	if (typeof error === 'string') {
		return error
	}
	try {
		return JSON.stringify(error)
	} catch {
		return '[unserializable error]'
	}
}
