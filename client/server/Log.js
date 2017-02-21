"use strict";
(function (LogLevel) {
    LogLevel[LogLevel["Debug"] = 0] = "Debug";
    LogLevel[LogLevel["Warning"] = 1] = "Warning";
    LogLevel[LogLevel["Error"] = 2] = "Error";
    LogLevel[LogLevel["None"] = 3] = "None";
})(exports.LogLevel || (exports.LogLevel = {}));
var LogLevel = exports.LogLevel;
class Log {
    constructor(connection, loglevel) {
        this.connection = connection;
        this.loglevel = loglevel;
    }
    logDebug(message) {
        if (this.loglevel <= LogLevel.Debug) {
            if (message instanceof String)
                this.connection.console.log("DEBUG: " + message);
            else
                this.connection.console.log("DEBUG: " + message());
        }
    }
    logWarn(message) {
        if (this.loglevel <= LogLevel.Warning) {
            if (message instanceof String)
                this.connection.console.warn(message);
            else
                this.connection.console.warn(message());
        }
    }
    logError(message) {
        if (this.loglevel <= LogLevel.Error) {
            if (message instanceof String)
                this.connection.console.error(message);
            else
                this.connection.console.error(message());
        }
    }
    logFatalError(message) {
        if (message instanceof String)
            this.connection.console.error("FATAL ERROR: " + message);
        else
            this.connection.console.error("FATAL ERROR: " + message());
    }
}
exports.Log = Log;
//# sourceMappingURL=Log.js.map