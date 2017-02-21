import { IConnection } from 'vscode-languageserver'

export enum LogLevel {
    Debug = 0, Information, Warning, Error, None
}

export type LogMessage = string | (() => string)

export class Log {
    constructor(public readonly connection: IConnection, public readonly loglevel: LogLevel) {
    }

    logDebug(message: LogMessage) {
        try {
            if (this.loglevel <= LogLevel.Debug) {
                let d = new Date;
                if (typeof message === "string")
                    this.connection.console.log("[Debug - " + d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds() + "] " + message)
                else
                    this.connection.console.log("[Debug - " + d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds() + "] " + message())
            }
        } catch (error) {

        }
    }

    /**
     * Sends a log message without any prefix or date.
     * 
     * @param {LogMessage} message message to send, either a string or a function returning a string.
     * @param {LogLevel} [level] default = 0
     * 
     * @memberOf Log
     */
    log(message?: LogMessage, level?: LogLevel) {
        try {
            if(!level)
                level = 0;
            if(!message)
                message = " ";
            if (this.loglevel <= level) {
                let d = new Date;
                if (typeof message === "string")
                    this.connection.console.log(message)
                else
                    this.connection.console.log(message())
            }
        } catch (error) {

        }
    }

    logInfo(message: LogMessage) {
        try {
            if (this.loglevel <= LogLevel.Debug) {
                if (typeof message === "string")
                    this.connection.console.info(message)
                else
                    this.connection.console.info(message())
            }
        } catch (error) {

        }
    }

    logWarn(message: LogMessage) {
        try {
            if (this.loglevel <= LogLevel.Warning) {
                if (typeof message === "string")
                    this.connection.console.warn(message)
                else
                    this.connection.console.warn(message())
            }
        } catch (error) {

        }
    }

    logError(message: LogMessage) {
        try {
            if (this.loglevel <= LogLevel.Error) {
                if (typeof message === "string")
                    this.connection.console.error(message)
                else
                    this.connection.console.error(message())
            }
        } catch (error) {

        }
    }

    logFatalError(message: LogMessage) {
        try {
            if (typeof message === "string")
                this.connection.console.error("FATAL ERROR: " + message)
            else
                this.connection.console.error("FATAL ERROR: " + message())
        } catch (error) {

        }
    }
}