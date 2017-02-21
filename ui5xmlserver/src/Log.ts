import { IConnection } from 'vscode-languageserver'

export enum LogLevel {
    Debug = 0, Warning = 1, Error = 2, None = 3
}

export type LogMessage = string | (() => string)

export class Log {
    constructor(public readonly connection: IConnection, public readonly loglevel: LogLevel) {
    }

    logDebug(message: LogMessage) {
        if (this.loglevel <= LogLevel.Debug) {
            if (message instanceof String)
                this.connection.console.log("DEBUG: " + message)
            else
                this.connection.console.log("DEBUG: " + message())
        }
    }

    logWarn(message: LogMessage) {
        if (this.loglevel <= LogLevel.Warning) {
            if (message instanceof String)
                this.connection.console.warn(message)
            else
                this.connection.console.warn(message())
        }
    }

    logError(message: LogMessage) {
        if (this.loglevel <= LogLevel.Error) {
            if (message instanceof String)
                this.connection.console.error(message)
            else
                this.connection.console.error(message())
        }
    }

    logFatalError(message: LogMessage) {
        if (message instanceof String)
            this.connection.console.error("FATAL ERROR: " + message)
        else
            this.connection.console.error("FATAL ERROR: " + message())
    }
}