export interface RetryStrategy {
	maxAttempts: number;
	baseDelay: number;
	/**
	 * Check if the error should be retried
	 * @param error The error that was thrown
	 * @param attempt The amount of attempts this action has made to run the action
	 * @returns Whether the action should be retried
	 */
	shouldRetry: (error: unknown, attempt: number) => boolean;
	/**
	 * Get the delay in milliseconds for the next retry attempt
	 * @param attempt The amount of attempts this action has made to run the action
	 * @returns The delay in milliseconds
	 */
	getDelay: (attempt: number) => number;
}

const RETRYABLE_ERRORS = new Set([
	"ProvisionedThroughputExceededException",
	"ThrottlingException",
	"RequestLimitExceeded",
	"InternalServerError",
	"ServiceUnavailable",
]);

type DynamoDBError = {
	name: string;
	message: string;
};

export const isRetryableError = (error: unknown): error is DynamoDBError => {
	if (!error || typeof error !== "object") return false;
	return "name" in error && RETRYABLE_ERRORS.has((error as DynamoDBError).name);
};
