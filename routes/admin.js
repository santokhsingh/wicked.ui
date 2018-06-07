'use strict';

var express = require('express');
var router = express.Router();
var async = require('async');
var debug = require('debug')('portal:admin');
var tmp = require('tmp');
var fs = require('fs');
var util = require('util');
var utils = require('./utils');

router.get('/approvals', function (req, res, next) {
    debug('get("/approvals")');
    utils.getFromAsync(req, res, '/approvals', 200, function (err, apiResponse) {
        if (err)
            return next(err);
        if (!utils.acceptJson(req)) {

            res.render('admin_approvals',
                {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    title: 'Pending Subscription Approvals',
                    approvals: JSON.stringify(apiResponse)
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
    utils.patch(req, '/applications/' + appId + '/subscriptions/' + apiId, { approved: true },
        function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (200 != apiResponse.statusCode)
                return utils.handleError(res, apiResponse, apiBody, next);
            // Woohoo
            if (!utils.acceptJson(req))
                res.redirect('/admin/approvals');
            else
                res.json(utils.getJson(apiBody));
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
    utils.delete(req, '/applications/' + appId + '/subscriptions/' + apiId,
        function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            if (204 != apiResponse.statusCode)
                return utils.handleError(res, apiResponse, apiBody, next);
            // Booyakasha
            if (!utils.acceptJson(req))
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
    utils.getFromAsync(req, res, '/users', 200, function (err, apiResponse) {
        if (err)
            return next(err);

        // Sort by name
        apiResponse.sort(byName);

        if (!utils.acceptJson(req)) {
            res.render('admin_users',
                {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    title: 'All Users',
                    users: JSON.stringify(apiResponse)
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
    utils.getFromAsync(req, res, '/applications', 200, function (err, appsResponse) {
        if (err)
            return next(err);
        var appIds = [];
        for (var i = 0; i < appsResponse.length; ++i)
            appIds.push(appsResponse[i].id);

        // This is the expensive part:
        async.map(appIds, function (appId, callback) {
            utils.getFromAsync(req, res, '/applications/' + appId, 200, callback);
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

            if (!utils.acceptJson(req)) {
                res.render('admin_applications',
                    {
                        authUser: req.user,
                        glob: req.app.portalGlobals,
                        title: 'All Applications',
                        applications: JSON.stringify(appsInfos)
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
            utils.getFromAsync(req, res, '/applications', 200, callback);
        },
        getApis: function (callback) {
            utils.getFromAsync(req, res, '/apis', 200, callback);
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
    utils.getFromAsync(req, res, '/webhooks/listeners', 200, function (err, appsResponse) {
        if (err)
            return next(err);
        if (!utils.acceptJson(req)) {
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
    utils.getFromAsync(req, res, '/webhooks/events/' + listenerId, 200, function (err, appsResponse) {
        if (err)
            return next(err);
        if (!utils.acceptJson(req)) {
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
    utils.getFromAsync(req, res, '/verifications', 200, function (err, verifResponse) {
        if (err)
            return next(err);
        if (!utils.acceptJson(req)) {
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
    utils.getFromAsync(req, res, '/systemhealth', 200, function (err, healthResponse) {
        if (err)
            return next(err);
        fixUptimes(healthResponse);
        if (!utils.acceptJson(req)) {
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

router.get('/apis/:apiId/subscriptions_csv', function (req, res, next) {
    const apiId = req.params.apiId;
    debug("get('/apis/" + apiId + "/subscriptions_csv')");
    utils.getFromAsync(req, res, '/apis/' + apiId + '/subscriptions', 200, function (err, applicationList) {
        if (err)
            return next(err);
        tmp.file(function (err, path, fd, cleanup) {
            if (err)
                return next(err);
            async.mapLimit(applicationList, 10, function (appEntry, callback) {
                utils.getFromAsync(req, res, '/applications/' + appEntry.application, 200, callback);
            }, function (err, results) {
                if (err) {
                    cleanup();
                    return next(err);
                }
                const outStream = fs.createWriteStream(path);
                outStream.write('api_id;application_id;application_name;plan;owner_id;owner_email;owner_role\n');
                for (let i = 0; i < results.length; ++i) {
                    const thisApp = results[i];
                    for (let owner = 0; owner < thisApp.owners.length; ++owner) {
                        const thisOwner = thisApp.owners[owner];
                        const ownerLine = apiId + ';' +
                            thisApp.id + ';' +
                            thisApp.name + ';' +
                            applicationList[i].plan + ';' +
                            thisOwner.userId + ';' +
                            thisOwner.email + ';' +
                            thisOwner.role + '\n';
                        debug(ownerLine);
                        outStream.write(ownerLine);
                    }
                }
                outStream.end(function (err) {
                    if (err) {
                        cleanup();
                        return next(err);
                    }
                    res.download(path, 'subscriptions-' + apiId + '.csv', function (err) {
                        cleanup();
                        if (err) {
                            return next(err);
                        }
                    });
                });
            });
        });
    });
});

router.post('/apis/:apiId/delete_subscriptions', function (req, res, next) {
    // This thing could use CSRF
    const apiId = req.params.apiId;
    debug("post('/apis/" + apiId + "/delete_subscriptions')");
    utils.getFromAsync(req, res, '/apis/' + apiId + '/subscriptions', 200, function (err, applicationList) {
        if (err) {
            return next(err);
        }
        async.eachSeries(applicationList, function (appEntry, callback) {
            utils.delete(req, '/applications/' + appEntry.application + '/subscriptions/' + apiId, callback);
        }, function (err, results) {
            if (err)
                return next(err);
            res.redirect('/apis/' + apiId);
        });
    });
});

module.exports = router;
