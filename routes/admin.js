'use strict';

var express = require('express');
var router = express.Router();
var async = require('async');
var debug = require('debug')('portal:admin');
var util = require('util');
var reqUtils = require('./requestUtils');

router.get('/approvals', function (req, res, next) {
    debug('get("/approvals")');
    reqUtils.getFromAsync(req, res, '/approvals', 200, function (err, apiResponse) {
        if (err)
            return next(err);
        if (!reqUtils.acceptJson(req)) {

            res.render('admin_approvals',
                {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    title: 'Pending Subscription Approvals',
                    approvals: apiResponse
                });
        } else {
            res.json({
                title: 'Pending Subscription Approvals',
                approvals: apiResponse
            });
        }
    });
});

router.post('/approvals/approve', function (req, res, next) {
    debug("post('/approvals/approve')");
    var appId = req.body.app;
    var apiId = req.body.api;
    if (!appId || !apiId) {
        var err = new Error('Bad request. Both App and API need to be specificed.');
        err.status = 400;
        return next(err);
    }

    // Hit the API
    reqUtils.patch(req, '/applications/' + appId + '/subscriptions/' + apiId, { approved: true },
        function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (200 != apiResponse.statusCode)
                return reqUtils.handleError(res, apiResponse, apiBody, next);
            // Woohoo
            if (!reqUtils.acceptJson(req))
                res.redirect('/admin/approvals');
            else
                res.json(reqUtils.getJson(apiBody));
        });
});

router.post('/approvals/decline', function (req, res, next) {
    debug("post('/approvals/decline')");
    var appId = req.body.app;
    var apiId = req.body.api;
    if (!appId || !apiId) {
        var err = new Error('Bad request. Both App and API need to be specificed.');
        err.status = 400;
        return next(err);
    }

    // Then delete the subscription. Should we notify the user? Nah.
    reqUtils.delete(req, '/applications/' + appId + '/subscriptions/' + apiId,
        function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (204 != apiResponse.statusCode)
                return reqUtils.handleError(res, apiResponse, apiBody, next);
            // Booyakasha
            if (!reqUtils.acceptJson(req))
                res.redirect('/admin/approvals');
            else
                res.status(204).json({});
        });
});

function byName(a, b) {
    return a.name < b.name ? -1 : 1;
}

router.get('/users', function (req, res, next) {
    debug("get('/users')");
    reqUtils.getFromAsync(req, res, '/users', 200, function (err, apiResponse) {
        if (err)
            return next(err);

        // Sort by name
        apiResponse.sort(byName);

        if (!reqUtils.acceptJson(req)) {
            res.render('admin_users',
                {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    title: 'All Users',
                    users: apiResponse
                });
        } else {
            res.json({
                title: 'All Users',
                users: apiResponse
            });
        }
    });
});

router.get('/applications', function (req, res, next) {
    debug("get('/applications')");
    // This is not super good; this is expensive. Lots of calls.
    reqUtils.getFromAsync(req, res, '/applications', 200, function (err, appsResponse) {
        if (err)
            return next(err);
        var appIds = [];
        for (var i = 0; i < appsResponse.length; ++i)
            appIds.push(appsResponse[i].id);

        // This is the expensive part:
        async.map(appIds, function (appId, callback) {
            reqUtils.getFromAsync(req, res, '/applications/' + appId, 200, callback);
        }, function (err, appsInfos) {
            if (err)
                return next(err);
            for (var i = 0; i < appsInfos.length; ++i) {
                var thisApp = appsInfos[i];
                var mainOwner = null;
                for (var j = 0; j < thisApp.owners.length; ++i) {
                    if ("owner" == thisApp.owners[j].role) {
                        mainOwner = thisApp.owners[j];
                        break;
                    }
                }
                if (mainOwner)
                    thisApp.mainOwner = mainOwner;
            }

            // Sort by Application name
            appsInfos.sort(byName);

            if (!reqUtils.acceptJson(req)) {
                res.render('admin_applications',
                    {
                        authUser: req.user,
                        glob: req.app.portalGlobals,
                        title: 'All Applications',
                        applications: appsInfos
                    });
            } else {
                res.json({
                    title: 'All Applications',
                    applications: appsInfos
                });
            }
        });
    });
});

router.get('/subscribe', function (req, res, next) {
    debug("get('/subscribe')");
    async.parallel({
        getApplications: function (callback) {
            reqUtils.getFromAsync(req, res, '/applications', 200, callback);
        },
        getApis: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis', 200, callback);
        }
    }, function (err, results) {
        if (err)
            return next(err);

        var apps = results.getApplications;
        var apis = results.getApis;

        res.render('admin_subscribe', {
            authUser: req.user,
            glob: req.app.portalGlobals,
            title: 'Admin Subscription Page',
            apps: apps,
            apis: apis.apis
        });
    });
});

router.get('/listeners', function (req, res, next) {
    debug("get('/listeners')");
    reqUtils.getFromAsync(req, res, '/webhooks/listeners', 200, function (err, appsResponse) {
        if (err)
            return next(err);
        if (!reqUtils.acceptJson(req)) {
            res.render('admin_listeners', {
                authUser: req.user,
                glob: req.app.portalGlobals,
                title: 'Webhook Listeners',
                listeners: appsResponse
            });
        } else {
            res.json({
                title: 'Webhook Listeners',
                listeners: appsResponse
            });
        }
    });
});

router.get('/listeners/:listenerId', function (req, res, next) {
    debug("get('/listeners/:listenerId')");
    var listenerId = req.params.listenerId;
    var regex = /^[a-zA-Z0-9\-_]+$/;
    if (!regex.test(listenerId))
        return req.status(400).jsonp({ message: 'Bad Request.' });
    reqUtils.getFromAsync(req, res, '/webhooks/events/' + listenerId, 200, function (err, appsResponse) {
        if (err)
            return next(err);
        if (!reqUtils.acceptJson(req)) {
            res.render('admin_events', {
                authUser: req.user,
                glob: req.app.portalGlobals,
                title: 'Pending Events - ' + listenerId,
                events: appsResponse
            });
        } else {
            res.json({
                title: 'Pending Events - ' + listenerId,
                events: appsResponse
            });
        }
    });
});

router.get('/verifications', function (req, res, next) {
    debug("get('/verifications'");
    reqUtils.getFromAsync(req, res, '/verifications', 200, function (err, verifResponse) {
        if (err)
            return next(err);
        if (!reqUtils.acceptJson(req)) {
            res.render('admin_verifications', {
                authUser: req.user,
                glob: req.app.portalGlobals,
                title: 'Pending Verifications',
                verifications: verifResponse
            });
        } else {
            res.json({
                title: 'Pending Verifications',
                verifications: verifResponse
            });
        }
    });
});

function padLeft(n) {
    if (n < 10)
        return "0" + n;
    return "" + n;
}

function fixUptimes(healths) {
    debug('fixUptimes()');
    for (var i = 0; i < healths.length; ++i) {
        var uptimeSeconds = Number(healths[i].uptime);
        if (uptimeSeconds >= 0) {
            var days = Math.floor(uptimeSeconds / 86400);
            var remain = uptimeSeconds - (days * 86400);
            var hours = Math.floor(remain / 3600);
            remain = remain - (hours * 3600);
            var minutes = Math.floor(remain / 60);
            var seconds = remain - (minutes * 60);
            if (days > 0)
                healths[i].uptimeText = util.format('%d days, %d:%s:%s', days, hours, padLeft(minutes), padLeft(seconds));
            else
                healths[i].uptimeText = util.format('%d:%s:%s', hours, padLeft(minutes), padLeft(seconds));
        } else {
            healths[i].uptimeText = '---';
        }
    }
}

router.get('/health', function (req, res, next) {
    debug("get('/health')");
    reqUtils.getFromAsync(req, res, '/systemhealth', 200, function (err, healthResponse) {
        if (err)
            return next(err);
        fixUptimes(healthResponse);
        if (!reqUtils.acceptJson(req)) {
            res.render('admin_systemhealth', {
                authUser: req.user,
                glob: req.app.portalGlobals,
                title: 'System Health',
                health: healthResponse
            });
        } else {
            res.json({
                title: 'System Health',
                health: healthResponse
            });
        }
    });
});

module.exports = router;