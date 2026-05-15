export default interface FilterResponseInterface {
	statusCode: number
	errorType: string
	message: string
	details?: string | object
}
