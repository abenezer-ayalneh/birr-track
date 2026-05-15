import { Injectable } from '@nestjs/common'

@Injectable()
export default class AppService {
	getHello = () => {
		return 'Hello World!'
	}
}
