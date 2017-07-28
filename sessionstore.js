var debug = require('debug')('portal:app');

function initSessionStore(session){
    var sessionStoreType = process.env.SESSION_STORE_TYPE || 'file';

    var sessionStoreOptions = {};
    var SessionStore;
    switch (sessionStoreType){
        case 'file':
            SessionStore = require('session-file-store')(session);
            // Use default options for file session store, see https://www.npmjs.com/package/session-file-store
            break;
        case 'redis':
            SessionStore = require('connect-redis')(session);
            // Set options for Redis session store, see https://www.npmjs.com/package/connect-redis
            sessionStoreOptions.host = process.env.SESSION_STORE_HOST || 'localhost';
            sessionStoreOptions.port = process.env.SESSION_STORE_PORT || 6379;
            break;
        default:
            throw new Error("Invalid session-store type: '" + sessionStoreType + "'");
    }

    debug('Using session store \'' + sessionStoreType + '\' with options ' + JSON.stringify(sessionStoreOptions));

    return new SessionStore(sessionStoreOptions);
}

module.exports = initSessionStore;