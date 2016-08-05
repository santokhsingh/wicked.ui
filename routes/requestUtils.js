'use strict';

var request = require('request');
var debug = require('debug')('portal:requtils');

var requestUtils = function () { };

requestUtils.getLoggedInUserId = function (req) {
    //debug('getLoggedInUserId()');
    if (!req.user)
        return null;
    return req.user.id;
};

requestUtils.getLoggedInUserEmail = function (req) {
    //debug('getLoggedInUserEmail()');
    if (!req.user)
        return null;
    return req.user.email;
};

function makeHeaders(req, userId) {
    if (!userId) {
        var headers = { 'Correlation-Id': req.correlationId };
        var loggedInUserId = requestUtils.getLoggedInUserId(req);
        if (loggedInUserId)
            headers['X-UserId'] = loggedInUserId;
        return headers;
    }
    return {
        'X-UserId': userId,
        'Correlation-Id': req.correlationId
    };
}

requestUtils.get = function (req, uri, callback) {
    debug('get(): ' + uri);
    var baseUrl = req.app.get('api_url');

    request.get(
        {
            url: baseUrl + uri,
            headers: makeHeaders(req)
        },
        callback);
};

requestUtils.getAsUser = function (req, uri, userId, callback) {
    debug('getAsUser(): ' + uri + ', userId = ' + userId);
    var baseUrl = req.app.get('api_url');

    request.get(
        {
            url: baseUrl + uri,
            headers: makeHeaders(req, userId)
        },
        callback);
};

requestUtils.handleError = function (res, apiResponse, apiBody, next) {
    debug('handleError()');
    debug(apiResponse);
    debug(apiBody);
    var errorText = requestUtils.getText(apiBody);
    try {
        var jsonBody = requestUtils.getJson(apiBody);
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
requestUtils.getFromAsync = function (req, res, uri, expectedStatus, callback) {
    debug('getFromAsync(): ' + uri + ', expectedStatus = ' + expectedStatus);
    requestUtils.get(req, uri, function (err, apiResponse, apiBody) {
        if (err)
            return callback(err);
        if (expectedStatus != apiResponse.statusCode)
            return requestUtils.handleError(res, apiResponse, apiBody, callback);
        var contentType = apiResponse.headers['content-type'];
        var returnValue = null;
        if (contentType.startsWith('text'))
            returnValue = requestUtils.getText(apiBody);
        else
            returnValue = requestUtils.getJson(apiBody);
        callback(null, returnValue);
    });
};

requestUtils.post = function (req, uri, body, callback) {
    debug('post(): ' + uri);
    debug(body);
    var baseUrl = req.app.get('api_url');

    request.post(
        {
            url: baseUrl + uri,
            headers: makeHeaders(req),
            json: true,
            body: body
        },
        callback);
};

requestUtils.patch = function (req, uri, body, callback) {
    debug('patch(): ' + uri);
    debug(body);
    var baseUrl = req.app.get('api_url');

    request.patch(
        {
            url: baseUrl + uri,
            headers: makeHeaders(req),
            json: true,
            body: body
        },
        callback);
};

requestUtils.patchAsUser = function (req, uri, userId, body, callback) {
    debug('patchAsUser(): ' + uri + ', userId = ' + userId);
    debug(body);
    var baseUrl = req.app.get('api_url');

    request.patch(
        {
            url: baseUrl + uri,
            headers: makeHeaders(req, userId),
            json: true,
            body: body
        },
        callback);
};

requestUtils.delete = function (req, uri, callback) {
    debug('delete(): ' + uri);
    var baseUrl = req.app.get('api_url');

    request.delete(
        {
            url: baseUrl + uri,
            headers: makeHeaders(req)
        },
        callback);
};

requestUtils.getUtc = function () {
    return Math.floor((new Date()).getTime() / 1000);
};

requestUtils.getJson = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return JSON.parse(ob);
    return ob;
};

requestUtils.getText = function (ob) {
    if (ob instanceof String || typeof ob === "string")
        return ob;
    return JSON.stringify(ob, null, 2);
};

requestUtils.acceptJson = function (req) {
    if (!req.headers || !req.headers.accept)
        return false;
    var headers = req.headers.accept.split(',');
    if (headers.find(function (h) { return h.toLowerCase().startsWith('application/json'); }))
        return true;
    return false;
};

module.exports = requestUtils;