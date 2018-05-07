'use strict';

const request = require('request');
const async = require('async');
const { debug, info, warn, error } = require('portal-env').Logger('portal:utils');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const wicked = require('wicked-sdk');

const utils = function () { };

utils.setOAuth2Credentials = function (clientId, clientSecret) {
    utils.CLIENT_ID = clientId;
    utils.CLIENT_SECRET = clientSecret;
};

utils.createRandomId = function () {
    return crypto.randomBytes(20).toString('hex');
};

utils.fail = function (statusCode, message, internalError, callback) {
    debug(`fail(${statusCode}, ${message})`);
    const err = new Error(message);
    err.status = statusCode;
    if (typeof (internalError) === 'function')
        callback = internalError;
    else
        err.internalError = internalError;
    return callback(err);
};

utils.getLoggedInUserId = function (req) {
    //debug('getLoggedInUserId()');
    if (!req.user)
        return null;
    return req.user.sub;
};

utils.getLoggedInUserEmail = function (req) {
    //debug('getLoggedInUserEmail()');
    if (!req.user)
        return null;
    return req.user.email;
};

utils.appendSlash = function (url) {
    if (url.endsWith('/'))
        return url;
    return url + '/';
};

utils.ensureNoSlash = function (url) {
    if (url.endsWith('/'))
        return url.substring(0, url.length - 1);
    return url;
};

function makeHeaders(req, userId) {
    const headers = {
        'User-Agent': 'wicked.portal/' + utils.getVersion(),
        'X-Config-Hash': wicked.getConfigHash(),
        'Correlation-Id': req.correlationId,
    };
    // if (!userId) {
    //     var loggedInUserId = utils.getLoggedInUserId(req);
    //     if (loggedInUserId)
    //         headers['X-UserId'] = loggedInUserId;
    //     return headers;
    // }
    // headers['X-UserId'] = userId;
    return headers;
}

// utils._anonymousAccessToken = null;
// function checkAccessToken(req, callback) {
//     debug('checkAccessToken()');
//     if (utils._anonymousAccessToken)
//         return callback(null, utils._anonymousAccessToken);

//     debug('Requesting new anonymous access token');
//     const baseUrl = req.app.get('api_url');
//     const tokenUrl = baseUrl + '/oauth2/token';
//     let headers = null;
//     if (tokenUrl.startsWith('http:')) {
//         headers = {
//             'X-Forwarded-Proto': 'https'
//         };
//     }

//     request.post({
//         url: tokenUrl,
//         json: true,
//         body: {
//             grant_type: 'client_credentials',
//             client_id: utils.CLIENT_ID,
//             client_secret: utils.CLIENT_SECRET
//         },
//         headers: headers
//     }, function (err, res, body) {
//         if (err) {
//             console.error('ERROR: Could not get access token for anonymous access');
//             console.error(err);
//             return callback(err);
//         }

//         debug(body);
//         if (!body.access_token) {
//             console.error('ERROR: Did not receive expected access_token.');
//             return callback(new Error('Did not receive anonymous access token.'));
//         }
//         debug('Successfully retrieved anonymous access token.');
//         // Cache it
//         utils._anonymousAccessToken = body.access_token;
//         return callback(null, body.access_token);
//     });
// }

function hasPersonalToken(req) {
    return !!(req.session.user && req.session.user.authMethodId && req.session.user.token && req.session.user.token.access_token && req.session.user.token.refresh_token);
}

function getAccessToken(req, callback) {
    debug('getAccessToken()');
    if (hasPersonalToken(req))
        return getPersonalToken(req, callback);
    if (!req.session.user)
        return getAnonymousToken(req, callback);
}

function renewAccessToken(req, callback) {
    debug('renewAccessToken()');
    if (hasPersonalToken(req))
        return renewPersonalToken(req, callback);
    return renewAnonymousToken(req, callback);
}

function getPersonalToken(req, callback) {
    debug('getPersonalToken()');
    if (!hasPersonalToken(req))
        return getAccessToken(req, callback);
    if (_refreshingAccessToken[utils.getLoggedInUserId(req)])
        return setTimeout(getPersonalToken, 100, req, callback);
    return callback(null, req.session.user.token.access_token);
}

let _refreshingAccessToken = {};
function renewPersonalToken(req, callback) {
    debug('renewPersonalToken()');
    const userId = utils.getLoggedInUserId(req);
    if (_refreshingAccessToken[userId])
        return setTimeout(getPersonalToken, 100, req, callback);
    _refreshingAccessToken[userId] = true;
    refreshPersonalToken(req, function (err, tokenResponse) {
        delete _refreshingAccessToken[userId];
        if (!err && req.session && req.session.user && req.session.user.token) {
            req.session.user.token = tokenResponse;
            return callback(err, tokenResponse.access_token);
        } else {
            // Fallback to anonymous token
            return getAnonymousToken(req, callback);
        }
    });
}

function refreshPersonalToken(req, callback) {
    debug('refreshPersonalToken()');
    if (!hasPersonalToken(req))
        return getAccessToken(req, callback); // Falls back to anonymous token
    const authMethod = req.app.authConfig.authMethods.find(am => am.name === req.session.user.authMethodId);
    const authServerUrl = req.app.authConfig.authServerUrl;
    // We need the specific token URL for the selected auth method
    const tokenUrl = authServerUrl + authMethod.config.tokenEndpoint;
    debug('refreshPersonalToken() - using token URL: ' + tokenUrl);

    request.post({
        url: tokenUrl,
        json: true,
        body: {
            grant_type: 'refresh_token',
            client_id: utils.CLIENT_ID,
            client_secret: utils.CLIENT_SECRET,
            refresh_token: req.session.user.token.refresh_token
        }
    }, function (err, res, tokenResponse) {
        if (err) {
            error('ERROR: Could not refresh token for personal access');
            error(err);
            return callback(err);
        }

        debug(tokenResponse);
        if (!tokenResponse.access_token) {
            error('ERROR: Could not refresh access_token, logging out forcefully.');
            // We'll log ourselves out then
            utils.logoutUser(req, (err) => {
                // if (err)
                //     return callback(err);
                // return getAccessToken(req, callback);
                return callback(new Error('Could not refresh personal access_token'));
            });
        } else {
            debug('Successfully refreshed personal access token.');
            return callback(null, tokenResponse);
        }
    });
}

let _anonymousToken = null;
function getAnonymousToken(req, callback) {
    debug('getAnonymousToken()');
    if (_creatingAnonymousToken) {
        debug('getAnonymousToken: Somebody else is already creating a token.');
        return setTimeout(getAnonymousToken, 100, req, callback);
    }
    if (_anonymousToken)
        return callback(null, _anonymousToken);
    debug('no token available, needs to create a new token');
    return renewAnonymousToken(req, callback);
}

let _creatingAnonymousToken = false;
function renewAnonymousToken(req, callback) {
    debug('renewAnonymousToken()');
    if (_creatingAnonymousToken) {
        debug('renewAnonymousToken: Somebody else is already creating a token.');
        return setTimeout(getAnonymousToken, 100, req, callback);
    }
    _creatingAnonymousToken = true;
    // Reset the thing
    _anonymousToken = null;
    createAnonymousTokenInternal(req, function (err, accessToken) {
        _creatingAnonymousToken = false;
        if (!err) {
            _anonymousToken = accessToken;
        }
        return callback(err, accessToken);
    });
}

// function createAnonymousToken(req, callback) {
//     debug('createAnonymousToken()');
//     if (_creatingAnonymousToken) {
//         debug('Already creating anonymous token somewhere else, waiting 200ms.');
//         return setTimeout(getAnonymousToken, 100, req, callback);
//     }
//     _creatingAnonymousToken = true;
//     createAnonymousTokenInternal(req, function (err, accessToken) {
//         _creatingAnonymousToken = false;
//         return callback(err, accessToken);
//     });
// }

function createAnonymousTokenInternal(req, callback) {
    debug('createAnonymousTokenInternal()');
    if (!req.app.authConfig || !req.app.authConfig.authServerUrl || !req.app.authConfig.authMethods || req.app.authConfig.authMethods.length <= 0)
        callback(new Error('The global auth configuration is not valid, cannot talk to the portal-api.'));

    const authServerUrl = req.app.authConfig.authServerUrl;
    // Just pick any auth method, it doesn't matter which for the client credentials flow
    const authMethod = req.app.authConfig.authMethods[0];
    const tokenUrl = authServerUrl + authMethod.config.tokenEndpoint;
    debug('getAccessToken() - using token URL: ' + tokenUrl);

    request.post({
        url: tokenUrl,
        json: true,
        body: {
            grant_type: 'client_credentials',
            client_id: utils.CLIENT_ID,
            client_secret: utils.CLIENT_SECRET
        }
    }, function (err, res, body) {
        if (err) {
            error('ERROR: Could not get access token for anonymous access');
            error(err);
            return callback(err);
        }

        debug(body);
        if (!body.access_token) {
            error('ERROR: Did not receive expected access_token.');
            return callback(new Error('Did not receive anonymous access token.'));
        }
        debug('Successfully retrieved anonymous access token.');

        const accessToken = body.access_token;
        return callback(null, accessToken);
    });
}

function apiAction(req, method, body, callback, iteration) {
    debug('apiAction()');

    const payload = function (accessToken, callback) {
        debug(`payload() ${method} ${body.url}`);
        body.method = method;
        body.headers.Authorization = 'Bearer ' + accessToken;
        request(body, (err, apiResponse, apiBody) => {
            if (err) {
                return callback(err);
            }
            return callback(null, apiResponse, apiBody);
        });
    };

    getAccessToken(req, function (err, accessToken) {
        payload(accessToken, function (err, apiResponse, apiBody) {
            if (err)
                return callback(err);
            if (apiResponse.statusCode === 401) {
                renewAccessToken(req, function (err, accessToken) {
                    payload(accessToken, function (err, apiResponse, apiBody) {
                        if (err)
                            return callback(err);
                        return callback(null, apiResponse, apiBody);
                    });
                });
            } else {
                return callback(null, apiResponse, apiBody);
            }
        });
    });

    // async.waterfall([
    //     callback => getAccessToken(req, callback),
    //     (accessToken, callback) => {
    //         body.method = method;
    //         body.headers.Authorization = 'Bearer ' + accessToken;
    //         request(body, (err, apiResponse, apiBody) => {
    //             if (err) {
    //                 return callback(err);
    //             }
    //             return callback(null, apiResponse, apiBody);
    //         });
    //     }
    // ], function (err, apiResponse, apiBody) {
    //     if (err) {
    //         return callback(err);
    //     }
    //     return callback(null, apiResponse, apiBody);
    // });
}

utils.get = function (req, uri, callback) {
    debug('get(): ' + uri);
    var baseUrl = req.app.get('api_url');

    apiAction(req, 'GET', {
        url: baseUrl + uri,
        headers: makeHeaders(req)
    }, callback);
};

utils.pipe = function (req, res, uri, isRetry) {
    debug('pipe()');
    var baseUrl = req.app.get('api_url');
    getAnonymousToken(req, (err, accessToken) => {
        const pipeReq = request({
            url: baseUrl + uri,
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Correlation-Id': req.correlationId
            }
        });
        pipeReq.on('response', function (response) {
            let pipeIt = true;
            if (!isRetry) {
                if (response.statusCode === 401) {
                    pipeIt = false;
                    renewAnonymousToken(req, function (err, accessToken) {
                        if (err)
                            return res.status(500).json({ message: 'Internal Server Error. Could not renew access token.' });
                        return utils.pipe(req, res, uri, true);
                    });
                }
            }
            if (pipeIt) {
                return pipeReq.pipe(res);
            } else {
                return pipeReq.abort();
            }
        });
    });
};

utils.getAsUser = function (req, uri, userId, callback) {
    debug('getAsUser(): ' + uri + ', userId = ' + userId);
    var baseUrl = req.app.get('api_url');

    apiAction(req, 'GET', {
        url: baseUrl + uri,
        headers: makeHeaders(req, userId)
    }, callback);
};

utils.handleError = function (res, apiResponse, apiBody, next) {
    debug('handleError()');
    // debug(apiResponse);
    debug('statusCode: ' + apiResponse.statusCode);
    debug(apiBody);
    var errorText = utils.getText(apiBody);
    try {
        var jsonBody = utils.getJson(apiBody);
        if (jsonBody.message)
            errorText = jsonBody.message;
    } catch (err) {
        debug('handleError failed while handling an error.');
        debug(err);
        // Ignore this, it was worth a try
    }

    var err = new Error(errorText);
    err.status = apiResponse.statusCode;
    return next(err);
};

// Use this function from within async constructions to shorten
// boiler plate code.
utils.getFromAsync = function (req, res, uri, expectedStatus, callback) {
    debug('getFromAsync(): ' + uri + ', expectedStatus = ' + expectedStatus);
    utils.get(req, uri, function (err, apiResponse, apiBody) {
        if (err)
            return callback(err);
        if (expectedStatus != apiResponse.statusCode)
            return utils.handleError(res, apiResponse, apiBody, callback);
        var contentType = apiResponse.headers['content-type'];
        var returnValue = null;
        if (contentType.startsWith('text'))
            returnValue = utils.getText(apiBody);
        else
            returnValue = utils.getJson(apiBody);
        callback(null, returnValue);
    });
};

utils.post = function (req, uri, body, callback) {
    debug('post(): ' + uri);
    debug(body);
    var baseUrl = req.app.get('api_url');

    apiAction(req, 'POST', {
        url: baseUrl + uri,
        headers: makeHeaders(req),
        json: true,
        body: body
    }, callback);
};

utils.patch = function (req, uri, body, callback) {
    debug('patch(): ' + uri);
    debug(body);
    var baseUrl = req.app.get('api_url');

    apiAction(req, 'PATCH', {
        url: baseUrl + uri,
        headers: makeHeaders(req),
        json: true,
        body: body
    }, callback);
};

utils.patchAsUser = function (req, uri, userId, body, callback) {
    debug('patchAsUser(): ' + uri + ', userId = ' + userId);
    debug(body);
    var baseUrl = req.app.get('api_url');

    apiAction(req, 'PATCH', {
        url: baseUrl + uri,
        headers: makeHeaders(req, userId),
        json: true,
        body: body
    }, callback);
};

utils.delete = function (req, uri, callback) {
    debug('delete(): ' + uri);
    var baseUrl = req.app.get('api_url');

    apiAction(req, 'DELETE', {
        url: baseUrl + uri,
        headers: makeHeaders(req)
    }, callback);
};

utils.logoutUser = function (req, callback) {
    debug('logoutUser()');
    if (req.session && req.session.user)
        delete req.session.user;
    return callback(null);
};

utils.getUtc = function () {
    return Math.floor((new Date()).getTime() / 1000);
};

utils.getJson = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return JSON.parse(ob);
    return ob;
};

utils.getText = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return ob;
    return JSON.stringify(ob, null, 2);
};

utils.acceptJson = function (req) {
    if (!req.headers || !req.headers.accept)
        return false;
    var headers = req.headers.accept.split(',');
    if (headers.find(function (h) { return h.toLowerCase().startsWith('application/json'); }))
        return true;
    return false;
};

utils._packageVersion = null;
utils.getVersion = function () {
    if (!utils._packageVersion) {
        const packageFile = path.join(__dirname, '..', 'package.json');
        if (fs.existsSync(packageFile)) {
            try {
                const packageInfo = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
                if (packageInfo.version)
                    utils._packageVersion = packageInfo.version;
            } catch (ex) {
                error(ex);
            }
        }
        if (!utils._packageVersion) // something went wrong
            utils._packageVersion = "0.0.0";
    }
    return utils._packageVersion;
};

utils._gitLastCommit = null;
utils.getGitLastCommit = function () {
    if (!utils._gitLastCommit) {
        const lastCommitFile = path.join(__dirname, '..', 'git_last_commit');
        if (fs.existsSync(lastCommitFile))
            utils._gitLastCommit = fs.readFileSync(lastCommitFile, 'utf8');
        else
            utils._gitLastCommit = '(no last git commit found - running locally?)';
    }
    return utils._gitLastCommit;
};

utils._gitBranch = null;
utils.getGitBranch = function () {
    if (!utils._gitBranch) {
        const gitBranchFile = path.join(__dirname, '..', 'git_branch');
        if (fs.existsSync(gitBranchFile))
            utils._gitBranch = fs.readFileSync(gitBranchFile, 'utf8');
        else
            utils._gitBranch = '(unknown)';
    }
    return utils._gitBranch;
};

utils._buildDate = null;
utils.getBuildDate = function () {
    if (!utils._buildDate) {
        const buildDateFile = path.join(__dirname, '..', 'build_date');
        if (fs.existsSync(buildDateFile))
            utils._buildDate = fs.readFileSync(buildDateFile, 'utf8');
        else
            utils._buildDate = '(unknown build date)';
    }
    return utils._buildDate;
};

module.exports = utils;