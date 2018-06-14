'use strict';

const express = require('express');
const router = express.Router();
const async = require('async');
const mustache = require('mustache');
const { debug, info, warn, error } = require('portal-env').Logger('portal:admin');
const tmp = require('tmp');
const fs = require('fs');
const util = require('util');
const utils = require('./utils');

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
    const appId = req.body.app;
    const apiId = req.body.api;
    if (!appId || !apiId) {
        const err = new Error('Bad request. Both App and API need to be specificed.');
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
    const appId = req.body.app;
    const apiId = req.body.api;
    if (!appId || !apiId) {
        const err = new Error('Bad request. Both App and API need to be specificed.');
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
    utils.getFromAsync(req, res, '/registrations/pools/wicked', 200, function (err, apiResponse) {
        if (err)
            return next(err);
        // apiResponse looks like this:
        // {
        //   items: [...],
        //   count: <# records in total>
        //   count_cached: true/false
        // }
        const userList = apiResponse.items;
        debug(userList);

        // Sort by name
        userList.sort(byName);

        if (!utils.acceptJson(req)) {
            res.render('admin_users',
                {
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                    title: 'All Users',
                    users: userList
                });
        } else {
            res.json({
                title: 'All Users',
                users: userList
            });
        }
    });
});

router.get('/applications', function (req, res, next) {
    debug("get('/applications')");
    // TODO: This has to be changed to support lazy loading and pagin
    //       We will need an additional end point for Ajax calls; this
    //       call to /applications now supports ?offset=...&limit=...,
    //       and will return an "items" and "count" property.
    //       By passing the parameter &embed=1, the application data
    //       is automatically embedded in the response, so there is no
    //       need to loop over the applications and retrieve the data.
    //       This HAS to be done server side, otherwise filtering and
    //       sorting cannot be done sensibly.
    //
    // Typical request:
    // 
    //       GET /applications?embed=1&filter=...&order_by=name%20ASC&offset=0&limit=20
    utils.getFromAsync(req, res, '/applications', 200, function (err, appsResponse) {
        if (err)
            return next(err);
        // appsResponse: {
        //   items: [...],
        //   count: _n_
        //   count_cached: true/false
        // }
        const appIds = [];
        for (let i = 0; i < appsResponse.items.length; ++i)
            appIds.push(appsResponse.items[i].id);

        // This is the expensive part:
        async.map(appIds, function (appId, callback) {
            utils.getFromAsync(req, res, '/applications/' + appId, 200, callback);
        }, function (err, appsInfos) {
            if (err)
                return next(err);
            for (let i = 0; i < appsInfos.length; ++i) {
                const thisApp = appsInfos[i];
                let mainOwner = null;
                for (let j = 0; j < thisApp.owners.length; ++i) {
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
            utils.getFromAsync(req, res, '/applications', 200, callback);
        },
        getApis: function (callback) {
            utils.getFromAsync(req, res, '/apis', 200, callback);
        }
    }, function (err, results) {
        if (err)
            return next(err);

        const apps = results.getApplications;
        const apis = results.getApis;

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
    const listenerId = req.params.listenerId;
    const regex = /^[a-zA-Z0-9\-_]+$/;
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
        verifResponse.forEach(v => v.link = mustache.render(v.link, { id: v.id }));
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
    for (let i = 0; i < healths.length; ++i) {
        const uptimeSeconds = Number(healths[i].uptime);
        if (uptimeSeconds >= 0) {
            const days = Math.floor(uptimeSeconds / 86400);
            let remain = uptimeSeconds - (days * 86400);
            const hours = Math.floor(remain / 3600);
            remain = remain - (hours * 3600);
            const minutes = Math.floor(remain / 60);
            const seconds = remain - (minutes * 60);
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
            async.mapLimit(applicationList.items, 10, function (appEntry, callback) {
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
                            applicationList.items[i].plan + ';' +
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
        async.eachSeries(applicationList.items, function (appEntry, callback) {
            utils.delete(req, '/applications/' + appEntry.application + '/subscriptions/' + apiId, callback);
        }, function (err, results) {
            if (err)
                return next(err);
            res.redirect('/apis/' + apiId);
        });
    });
});

module.exports = router;