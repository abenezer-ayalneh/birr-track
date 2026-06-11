import { JwtPayload } from '../auth.service'

declare global {
	namespace Express {
		interface Request {
			authPayload?: JwtPayload
		}
	}
}
