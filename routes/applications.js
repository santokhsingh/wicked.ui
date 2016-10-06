'use strict';

var express = require('express');
var router = express.Router();
var async = require('async');
var debug = require('debug')('portal:applications');
var reqUtils = require('./requestUtils');

router.get('/:appId', function (req, res, next) {
    debug("get('/:appId')");
    var appId = req.params.appId;
    //var registerOpen = req.query.register;
    async.parallel({
        getApplication: function (callback) {
            reqUtils.getFromAsync(req, res, '/applications/' + appId, 200, callback);
        },
        getRoles: function (callback) {
            reqUtils.getFromAsync(req, res, '/applications/roles', 200, callback);
        },
        getSubscriptions: function (callback) {
            reqUtils.getFromAsync(req, res, '/applications/' + appId + '/subscriptions', 200, callback);
        }
    }, function (err, results) {
        if (err)
            return next(err);
        var application = results.getApplication;
        var roles = results.getRoles;
        var appSubs = results.getSubscriptions;

        debug(appSubs);

        if (!reqUtils.acceptJson(req)) {
            res.render('application', {
                authUser: req.user,
                glob: req.app.portalGlobals,
                title: application.name,
                route: '/applications/' + appId,
                application: application,
                roles: roles,
                subscriptions: appSubs
            });
        } else {
            res.json({
                title: application.name,
                application: application,
                roles: roles,
                subscriptions: appSubs
            });
        }
    });
});

router.get('/', function (req, res, next) {
    debug("get('/')");
    var loggedInUserId = reqUtils.getLoggedInUserId(req);
    if (!loggedInUserId) {
        // Not logged in
        if (!reqUtils.acceptJson(req)) {
            res.render('applications', {
                glob: req.app.portalGlobals,
                route: '/applications',
                title: 'Registered Applications',
                applications: []
            });
        } else {
            res.json({
                title: 'Registered Applications',
                message: 'Not logged in, cannot display applications.',
                applications: []
            });
        }
        return;
    }

    // In /users/:userId, you get the user's applications back
    reqUtils.getFromAsync(req, res, '/users/' + reqUtils.getLoggedInUserId(req), 200, function (err, userInfo) {
        if (err)
            return next(err);
        var appIds = [];
        for (var i = 0; i < userInfo.applications.length; ++i)
            appIds.push(userInfo.applications[i].id);
        async.map(appIds, function (appId, callback) {
            reqUtils.getFromAsync(req, res, '/applications/' + appId, 200, callback);
        }, function (err, appInfos) {
            if (err)
                return next(err);

            debug(req.user);
            for (var i = 0; i < appInfos.length; ++i)
                appInfos[i].userRole = findUserRole(appInfos[i], userInfo);

            var showRegister = '';
            if (req.query.register || userInfo.applications.length === 0)
                showRegister = 'in';

            if (!reqUtils.acceptJson(req)) {
                res.render('applications', {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    route: '/applications',
                    applications: appInfos,
                    showRegister: showRegister
                });
            } else {
                res.json({
                    title: 'Registered Applications',
                    applications: appInfos
                });
            }
        });
    });
});

function findUserRole(appInfo, userInfo) {
    var userEmail = userInfo.email;
    for (var i = 0; i < appInfo.owners.length; ++i) {
        if (userEmail == appInfo.owners[i].email)
            return appInfo.owners[i].role;
    }
    console.error('findUserRole() - Could not find user role, data inconsistent: ' + userEmail + ', appId: ' + appInfo.id);
    return '(undefined)';
}

// ====== ======= =======
// ====== ACTIONS =======
// ====== ======= =======

// Registering new applications

router.post('/register', function (req, res, next) {
    debug("post('/register')");
    const appId = req.body.appid;
    const appName = req.body.appname;
    const hasRedirectUri = req.body.hasredirecturi;
    const redirectUri = req.body.redirecturi;

    if (!appId ||
        !appName) {
        const err = new Error('Both an application ID and an application name has to be supplied.');
        err.status = 400;
        return next(err);
    }

    var newApp = {
        id: appId,
        name: appName
    };
    if (hasRedirectUri)
        newApp.redirectUri = redirectUri;

    reqUtils.post(req, '/applications', newApp,
        function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (201 != apiResponse.statusCode)
                return reqUtils.handleError(res, apiResponse, apiBody, next);
            // Yay!
            if (!reqUtils.acceptJson(req))
                res.redirect('/applications?highlightApp=' + appId);
            else
                res.status(201).json(reqUtils.getJson(apiBody));
        });
});

// Deleting applications

router.post('/:appId/unregister', function (req, res, next) {
    debug("post('/:appId/unregister')");
    var appId = req.params.appId;

    reqUtils.delete(req, '/applications/' + appId,
        function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (204 != apiResponse.statusCode)
                return reqUtils.handleError(res, apiResponse, apiBody, next);
            // Yay!
            if (!reqUtils.acceptJson(req))
                res.redirect('/applications');
            else
                res.status(204).send('');
        });
});

// Registering a new owner

router.post('/:appId/owners/add', function (req, res, next) {
    debug("post('/:appId/owners/add')");
    var appId = req.params.appId;
    var ownerEmail = req.body.owneremail;
    var ownerRole = req.body.ownerrole;
    // Pre-sanitize input
    if (!ownerEmail || !ownerRole) {
        let err = new Error('Both email and role must be provided.');
        err.status = 400;
        return next(err);
    }
    if (!/.+@.+/.test(ownerEmail)) {
        let err = new Error('Email address is not a valid email address: "' + ownerEmail + '".');
        err.status = 400;
        return next(err);
    }

    reqUtils.post(req, '/applications/' + appId + '/owners',
        {
            email: ownerEmail,
            role: ownerRole
        }, function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (201 != apiResponse.statusCode)
                return reqUtils.handleError(res, apiResponse, apiBody, next);
            if (!reqUtils.acceptJson(req))
                res.redirect('/applications/' + appId);
            else
                res.status(201).json(reqUtils.getJson(apiBody));
        });
});

// Removing an owner

router.post('/:appId/owners/delete', function (req, res, next) {
    debug("post('/:appId/owners/delete')");
    var appId = req.params.appId;
    var userEmail = req.body.owneremail;
    if (!userEmail) {
        let err = new Error('Bad request. To delete an owner, the email address must be provided.');
        err.status = 400;
        return next(err);
    }
    if (!/.+@.+/.test(userEmail)) {
        let err = new Error('Bad request. Email address is not a valid email address: "' + userEmail + '".');
        err.status = 400;
        return next(err);
    }

    reqUtils.delete(req, '/applications/' + appId + '/owners?userEmail=' + userEmail,
        function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (200 != apiResponse.statusCode)
                return reqUtils.handleError(res, apiResponse, apiBody, next);
            // Success
            if (!reqUtils.acceptJson(req))
                res.redirect('/applications/' + appId);
            else
                res.json(reqUtils.getJson(apiBody));
        });
});

// Patching an application

router.post('/:appId/patch', function (req, res, next) {
    debug("post('/:appId/patch')");
    var appId = req.params.appId;
    var appName = req.body.appname;
    var redirectUri = req.body.redirecturi;

    if (!appName) {
        var err = new Error('Application name cannot be empty.');
        err.status = 400;
        return next(err);
    }

    const appData = {
        id: appId,
        name: appName,
        redirectUri: redirectUri
    };

    reqUtils.patch(req, '/applications/' + appId, appData, function (err, apiResponse, apiBody) {
        if (err)
            return next(err);
        if (200 != apiResponse.statusCode)
            return reqUtils.handleError(res, apiResponse, apiBody, next);
        // Yay!
        if (!reqUtils.acceptJson(req))
            res.redirect('/applications/' + appId);
        else
            res.json(reqUtils.getJson(apiBody));
    });
});

// Subscribe to an API

router.get('/:appId/subscribe/:apiId', function (req, res, next) {
    debug("get('/:appId/subscribe/:apiId')");
    var appId = req.params.appId;
    var apiId = req.params.apiId;

    async.parallel({
        getApplication: function (callback) {
            reqUtils.getFromAsync(req, res, '/applications/' + appId, 200, callback);
        },
        getApi: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis/' + apiId, 200, callback);
        },
        getPlans: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis/' + apiId + '/plans', 200, callback);
        }
    }, function (err, results) {
        if (err)
            return next(err);

        var application = results.getApplication;
        var apiInfo = results.getApi;
        var apiPlans = results.getPlans;

        var allowSubscribe = true;
        var subscribeError = null;
        var subscribeWarning = null;
        if (apiInfo.auth === 'oauth2-implicit' &&
            !application.redirectUri) {
            allowSubscribe = false;
            subscribeError = 'You cannot subscribe to an OAuth 2.0 Implicit Grant API with an application which does not have a valid Redirect URI. Please specify a Redirect URI on the Application page';
        }

        if ((apiInfo.auth === 'oauth2' ||
            apiInfo.auth === 'key-auth') &&
            application.redirectUri) {
            subscribeWarning = 'You are about to subscribe to an API which is intended only for machine to machine communication with an application with a registered Redirect URI. Please note that API Keys and/or Client Credentials (such as the Client Secret) must NEVER be deployed to a public client, such as a JavaScript SPA or Mobile Application.';
        }

        if (!reqUtils.acceptJson(req)) {
            res.render('subscribe',
                {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    title: 'Subscribe to ' + apiInfo.name,
                    apiInfo: apiInfo,
                    apiPlans: apiPlans,
                    application: application,
                    allowSubscribe: allowSubscribe,
                    subscribeError: subscribeError,
                    subscribeWarning: subscribeWarning
                });
        } else {
            res.json({
                title: 'Subscribe to ' + apiInfo.name,
                apiInfo: apiInfo,
                apiPlans: apiPlans,
                application: application
            });
        }
    });
});

router.post('/:appId/subscribe/:apiId', function (req, res, next) {
    debug("post('/:appId/subscribe/:apiId')");
    var appId = req.params.appId;
    var apiId = req.params.apiId;
    var apiPlan = req.body.plan;

    if (!apiPlan) {
        var err = new Error('Bad request. Plan was not specified.');
        err.status = 400;
        return next(err);
    }

    reqUtils.post(req, '/applications/' + appId + '/subscriptions',
        {
            application: appId,
            api: apiId,
            plan: apiPlan
        }, function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (201 != apiResponse.statusCode)
                return reqUtils.handleError(res, apiResponse, apiBody, next);
            if (!reqUtils.acceptJson(req))
                res.redirect('/apis/' + apiId);
            else
                res.status(201).json(reqUtils.getJson(apiBody));
        });
});

router.post('/:appId/unsubscribe/:apiId', function (req, res, next) {
    debug("post('/:appId/unsubscribe/:apiId')");
    var appId = req.params.appId;
    var apiId = req.params.apiId;

    reqUtils.delete(req, '/applications/' + appId + '/subscriptions/' + apiId,
        function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (204 != apiResponse.statusCode)
                return reqUtils.handleError(res, apiResponse, apiBody, next);
            // Yay!
            if (!reqUtils.acceptJson(req))
                res.redirect('/apis/' + apiId);
            else
                res.status(204).json({});
        });
});

module.exports = router;
