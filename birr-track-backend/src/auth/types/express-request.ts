import type { JwtPayload } from '../auth.service'

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			authPayload?: JwtPayload
		}
	}
}

export {}
