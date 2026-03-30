/**
 * The possible log levels.
 * LogLevel.Off is never emitted and only used with Logger.level property to disable logs.
 */
export enum LogLevel {
	Off = 0,
	Error,
	Warning,
	Info,
	Debug,
}

/**
 * Log output handler function.
 */
export type LogOutput<TData> = (source: string, level: LogLevel, ...objects: TData[]) => void;

export class Logger<TData = unknown> {
	static level = LogLevel.Debug;
	static outputs: LogOutput<unknown>[] = [];
	static enableProductionMode() {
		Logger.level = LogLevel.Warning;
	}

	constructor(private source?: string) {}

	/**
	 * Logs messages or objects  with the debug level.
	 * Works the same as console.log().
	 */
	debug(...objects: TData[]) {
		this.log(console.log, LogLevel.Debug, objects);
	}

	/**
	 * Logs messages or objects  with the info level.
	 * Works the same as console.log().
	 */
	info(...objects: TData[]) {
		this.log(console.info, LogLevel.Info, objects);
	}

	/**
	 * Logs messages or objects  with the warning level.
	 * Works the same as console.log().
	 */
	warn(...objects: TData[]) {
		this.log(console.warn, LogLevel.Warning, objects);
	}

	/**
	 * Logs messages or objects  with the error level.
	 * Works the same as console.log().
	 */
	error(...objects: TData[]) {
		this.log(console.error, LogLevel.Error, objects);
	}
	child(tag: string) {
		return new Logger((this.source ?? "")?.split(":").concat(tag).join(":"));
	}

	private log(func: (...args: TData[]) => void, level: LogLevel, objects: TData[]) {
		if (level <= Logger.level) {
			const now = new Date();
			const log = this.source
				? [`${now.toISOString()} [${this.source}]`].concat(...([objects].flat() as unknown as string[]))
				: ([objects].flat() as unknown as string[]);

			func.apply(console, log as unknown as TData[]);
			Logger.outputs.forEach((output) => {
				output.apply(
					output,
					([this.source, level] as unknown as [string, LogLevel]).concat(objects as unknown as string[]) as unknown as [string, LogLevel, string[]],
				);
			});
		}
	}
}

export const createLogger = (name?: string) => new Logger(name);
export const logger = createLogger("App");

if (process.env.NODE_ENV === "production") Logger.enableProductionMode();