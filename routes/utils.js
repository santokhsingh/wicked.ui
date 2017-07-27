'use strict';

const request = require('request');
const async = require('async');
const debug = require('debug')('portal:utils');
const fs = require('fs');
const path = require('path');
const wicked = require('wicked-sdk');

const utils = function () { };

utils.setOAuth2Credentials = function (clientId, clientSecret) {
    utils.CLIENT_ID = clientId;
    utils.CLIENT_SECRET = clientSecret;
};

utils.getLoggedInUserId = function (req) {
    //debug('getLoggedInUserId()');
    if (!req.user)
        return null;
    return req.user.id;
};

utils.getLoggedInUserEmail = function (req) {
    //debug('getLoggedInUserEmail()');
    if (!req.user)
        return null;
    return req.user.email;
};

function makeHeaders(req, userId) {
    const headers = {
        'User-Agent': 'wicked.portal/' + utils.getVersion(),
        'X-Config-Hash': wicked.getConfigHash(),
        'Correlation-Id': req.correlationId,
    };
    if (!userId) {
        var loggedInUserId = utils.getLoggedInUserId(req);
        if (loggedInUserId)
            headers['X-UserId'] = loggedInUserId;
        return headers;
    }
    headers['X-UserId'] = userId;
    return headers;
}

utils._anonymousAccessToken = null;
function checkAccessToken(req, callback) {
    debug('checkAccessToken()');
    if (utils._anonymousAccessToken)
        return callback(null, utils._anonymousAccessToken);

    debug('Requesting new anonymous access token');
    const baseUrl = req.app.get('api_url');
    const tokenUrl = baseUrl + '/oauth2/token';
    let headers = null;
    if (tokenUrl.startsWith('http:')) {
        headers = {
            'X-Forwarded-Proto': 'https'
        };
    }

    request.post({
        url: tokenUrl,
        json: true,
        body: {
            grant_type: 'client_credentials',
            client_id: utils.CLIENT_ID,
            client_secret: utils.CLIENT_SECRET
        },
        headers: headers
    }, function (err, res, body) {
        if (err) {
            console.error('ERROR: Could not get access token for anonymous access');
            console.error(err);
            return callback(err);
        }

        debug(body);
        if (!body.access_token) {
            console.error('ERROR: Did not receive expected access_token.');
            return callback(new Error('Did not receive anonymous access token.'));
        }
        debug('Successfully retrieved anonymous access token.');
        // Cache it
        utils._anonymousAccessToken = body.access_token;
        return callback(null, body.access_token);
    });
}

function apiAction(req, method, body, callback, iteration) {
    debug('apiAction()');
    async.waterfall([
        callback => checkAccessToken(req, callback),
        (accessToken, callback) => {
            body.method = method;
            body.headers.Authorization = 'Bearer ' + accessToken;
            request(body, (err, apiResponse, apiBody) => {
                if (err) {
                    return callback(err);
                }
                return callback(null, apiResponse, apiBody);
            });
        }
    ], function (err, apiResponse, apiBody) {
        if (err) {
            return callback(err);
        }
        return callback(null, apiResponse, apiBody);
    });
}

utils.get = function (req, uri, callback) {
    debug('get(): ' + uri);
    var baseUrl = req.app.get('api_url');

    apiAction(req, 'GET', {
        url: baseUrl + uri,
        headers: makeHeaders(req)
    }, callback);
};

utils.pipe = function (req, res, uri) {
    debug('pipe()');
    var baseUrl = req.app.get('api_url');
    checkAccessToken(req, (err, accessToken) => {
        request({
            url: baseUrl + uri,
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Correlation-Id': req.correlationId
            }
        }).pipe(res);
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
    debug(apiResponse);
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
                console.error(ex);
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