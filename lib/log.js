module.exports = class Log {

    constructor(fstat, ferr, prefix) {
        this.fstat = fstat;
        this.ferr = ferr;
        this.prefix = prefix;
    }

    N(message, toConsole = true) {
        this.log(message, toConsole);
    }

    W(message, toConsole = true) {
        this.log(message, toConsole);
    }

    E(message, toConsole = true) {
        this.log(message, toConsole, true);
    }

    log(message, toConsole = true, toError = false) {
        if (message !== undefined) {
            // Always write message to syslog
	        if (this.prefix !== undefined) console.log("%s: %s", this.prefix, message);
    
            if (toConsole) {
                message = message.charAt(0).toUpperCase() + message.slice(1);
	            if (!toError) { this.fstat(message); } else { this.ferr(message); }
            }
        }
    }
}
