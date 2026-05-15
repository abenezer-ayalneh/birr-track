import { ExecutionContext } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

export class ContextAwareThrottlerGuard extends ThrottlerGuard {
	protected async getTracker(req: Record<string, unknown>): Promise<string> {
		const contextTracker = req.contextTracker
		if (typeof contextTracker === 'string' && contextTracker.length > 0) {
			return contextTracker
		}

		return super.getTracker(req)
	}

	protected getRequestResponse(context: ExecutionContext): {
		req: Record<string, any>
		res: Record<string, any>
	} {
		if (context.getType() === 'http') {
			return super.getRequestResponse(context)
		}

		const tracker = this.buildNonHttpTracker(context)

		return {
			req: { contextTracker: tracker },
			res: {
				// Non-HTTP contexts have no transport headers; this keeps throttler flow consistent.
				header: () => undefined,
			},
		}
	}

	private buildNonHttpTracker(context: ExecutionContext): string {
		const contextType = String(context.getType())
		const contextArg: { from?: { id?: number | string }; chat?: { id?: number | string }; update?: { update_id?: number | string } } | undefined =
			context.getArgByIndex(0)

		const fromId = contextArg?.from?.id
		if (fromId !== undefined && fromId !== null) {
			return `${contextType}:from:${String(fromId)}`
		}

		const chatId = contextArg?.chat?.id
		if (chatId !== undefined && chatId !== null) {
			return `${contextType}:chat:${String(chatId)}`
		}

		const updateId = contextArg?.update?.update_id
		if (updateId !== undefined && updateId !== null) {
			return `${contextType}:update:${String(updateId)}`
		}

		return `${contextType}:anonymous`
	}
}
