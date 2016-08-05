'use strict';

var express = require('express');
var router = express.Router();
var debug = require('debug')('portal:apis');
var reqUtils = require('./requestUtils');
var marked = require('marked');
var async = require('async');
var cors = require('cors');

router.get('/', function (req, res, next) {
    debug("get('/')");
    // Let's hit the API, and then render it.

    async.parallel({
        getApis: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis', 200, callback);
        },
        getDesc: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis/desc', 200, callback);
        }
    },
        function (err, results) {
            if (err)
                return next(err);
            var apiList = results.getApis.apis;
            // Markdownify short descriptions.
            for (var i = 0; i < apiList.length; ++i) {
                if (apiList[i].desc)
                    apiList[i].desc = marked(apiList[i].desc);
            }
            var desc = results.getDesc;

            if (!reqUtils.acceptJson(req)) {
                res.render('apis',
                    {
                        authUser: req.user,
                        glob: req.app.portalGlobals,
                        route: '/apis',
                        title: 'APIs',
                        desc: marked(desc),
                        apilist: apiList
                    });
            } else {
                res.json(apiList);
            }
        });
});

router.get('/:api', function (req, res, next) {
    debug("get('/:api')");

    // This is going to be more interesting, as we also want
    // to retrieve the applications of the user. But it'll work
    // out in the end. I found 'async' to do lists of REST calls
    // more or less in parallel. That looks nifty:
    //
    // https://github.com/caolan/async

    // We need to fetch the following things:

    // /apis/:api
    // /apis/:api/desc
    // /users/:userId
    // For all the user's applications:
    // /applications/:appId/subscriptions/:apiId

    var apiId = req.params.api;
    var loggedInUserId = reqUtils.getLoggedInUserId(req);

    async.parallel({
        getApi: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis/' + apiId, 200, callback);
        },
        getApiDesc: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis/' + apiId + '/desc', 200, callback);
        },
        getApiConfig: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis/' + apiId + '/config', 200, callback);
        },
        getUser: function (callback) {
            if (loggedInUserId)
                reqUtils.getFromAsync(req, res, '/users/' + loggedInUserId, 200, callback);
            else {
                var nullUser = {
                    applications: []
                };
                callback(null, nullUser);
            }
        },
        getPlans: function (callback) {
            reqUtils.getFromAsync(req, res, '/apis/' + apiId + '/plans', 200, callback);
        }
    }, function (err, results) {
        if (err)
            return next(err);
        var apiInfo = results.getApi;
        if (apiInfo.desc)
            apiInfo.desc = marked(apiInfo.desc);
        var apiDesc = results.getApiDesc;
        if (!apiDesc)
            apiDesc = '';
        var userInfo = results.getUser;
        var apiConfig = results.getApiConfig;
        // TODO: This makes me a little unhappy, as this is Kong specific.
        // The "right" thing to do here would be to have the API, and more specific
        // even the Kong Adapter (or something) translate this into this Request URI.
        var apiRequestUri = apiConfig.api.request_path;
        var nw = req.app.portalGlobals.network;
        var apiUri = nw.schema + '://' + nw.apiHost + apiRequestUri;

        var plans = results.getPlans;
        var plansMap = {};
        for (let i = 0; i < plans.length; ++i)
            plansMap[plans[i].id] = plans[i];

        var appIds = [];
        if (userInfo.applications) {
            for (let i = 0; i < userInfo.applications.length; ++i)
                appIds.push(userInfo.applications[i].id);
        }

        async.map(appIds,
            function (appId, callback) {
                reqUtils.get(req, '/applications/' + appId + '/subscriptions/' + apiId, function (err, apiResponse, apiBody) {
                    if (err)
                        return callback(err);
                    if (200 == apiResponse.statusCode)
                        return callback(null, reqUtils.getJson(apiBody));
                    // We got a 404, most probably; let's return null for this
                    callback(null, null);
                });
            }, function (err, subsResults) {
                if (err)
                    return next(err);

                async.map(appIds, function (appId, callback) {
                    reqUtils.getFromAsync(req, res, '/applications/' + appId, 200, callback);
                }, function (err, appsResults) {
                    if (err)
                        return next(err);

                    var apps = [];
                    for (var i = 0; i < userInfo.applications.length; ++i) {
                        var thisApp = userInfo.applications[i];
                        thisApp.name = appsResults[i].name;
                        if (appsResults[i]._links.addSubscription)
                            thisApp.maySubscribe = true;
                        thisApp.hasSubscription = false;
                        if (subsResults[i]) {
                            thisApp.hasSubscription = true;
                            thisApp.plan = plansMap[subsResults[i].plan];
                            thisApp.apiKey = subsResults[i].apikey;
                            thisApp.clientId = subsResults[i].clientId;
                            thisApp.clientSecret = subsResults[i].clientSecret;
                            thisApp.mayUnsubscribe = false;
                            thisApp.maySubscribe = false;
                            thisApp.subscriptionApproved = subsResults[i].approved;
                            if (subsResults[i]._links.deleteSubscription)
                                thisApp.mayUnsubscribe = true;
                            thisApp.swaggerLink = req.app.portalGlobals.network.schema + '://' +
                                req.app.portalGlobals.network.portalHost +
                                '/apis/' + apiId + '/swagger?forUser=' + loggedInUserId;
                        }
                        apps.push(thisApp);
                        debug(thisApp);
                    }

                    // See also views/models/api.json for how this looks
                    if (!reqUtils.acceptJson(req)) {
                        res.render('api',
                            {
                                authUser: req.user,
                                glob: req.app.portalGlobals,
                                route: '/apis/' + apiId,
                                title: apiInfo.name,
                                apiInfo: apiInfo,
                                apiDesc: marked(apiDesc),
                                applications: apps,
                                apiPlans: plans,
                                apiUri: apiUri
                            });
                    } else {
                        res.json({
                            title: apiInfo.name,
                            apiInfo: apiInfo,
                            apiPlans: plans,
                            applications: apps,
                            apiUri: apiUri
                        });
                    }
                });
            }
        );

    });
}); // /apis/:apiId

// Dynamically allow CORS for this end point. Otherwise: No.
var corsOptions = null;
var corsOptionsDelegate = function (req, callback) {
    debug('corsOptionDelegate()');
    debug('Origin: ' + req.header('Origin'));
    if (!corsOptions) {
        corsOptions = {
            origin: req.app.portalGlobals.network.schema + '://' + req.app.portalGlobals.network.apiHost,
            credentials: true
        };
    }
    debug(reqUtils.getText(corsOptions));
    callback(null, corsOptions);
};

router.get('/:api/swagger', cors(corsOptionsDelegate), function (req, res, next) {
    debug("get('/:api/swagger')");
    var apiId = req.params.api;

    var apiCallback = function (err, response, body) {
        if (err)
            return next(err);
        if (200 != response.statusCode)
            return reqUtils.handleError(res, response, body, next);

        try {
            var swaggerJson = reqUtils.getJson(body);
            // Pipe it
            return res.json(swaggerJson);
        } catch (err) {
            // Hmm...
            return next(err);
        }
    };

    // Let's call the API, it has all the data we need.    
    var swaggerUri = '/apis/' + apiId + '/swagger';

    // Do we have a forUser query parameter?
    var forUser = req.query.forUser;
    if (!/^[a-z0-9]+$/.test(forUser)) {
        debug("get('/:api/swagger') - invalid forUser used: " + forUser);
        forUser = null;
    }
    if (forUser) {
        reqUtils.getAsUser(req, swaggerUri, forUser, apiCallback);
    } else {
        reqUtils.get(req, swaggerUri, apiCallback);
    }
}); // /apis/:apiId/swagger

module.exports = router;
