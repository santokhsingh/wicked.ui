'use strict';

var express = require('express');
var { debug, info, warn, error } = require('portal-env').Logger('portal:ping');
var router = express.Router();
var utils = require('./utils');

var _startupSeconds = utils.getUtc();
router.get('/', function (req, res, next) {
    debug("get('/')");
    if (!req.app.initialized) {
        return res.status(503).json({
            name: 'portal',
            message: 'Initializing',
            uptime: 0,
            healthy: false,
            version: utils.getVersion(),
            gitLastCommit: utils.getGitLastCommit(),
            gitBranch: utils.getGitBranch(),
            buildDate: utils.getBuildDate()
        });
    }

    // We're initialized, we can access the globals
    var portalUrl = req.app.portalGlobals.network.schema + '://' + req.app.portalGlobals.network.portalHost;
    res.json({
        name: 'portal',
        message: 'Up and running',
        uptime: (utils.getUtc() - _startupSeconds),
        healthy: true,
        pingUrl: portalUrl + '/ping',
        version: utils.getVersion(),
        gitLastCommit: utils.getGitLastCommit(),
        gitBranch: utils.getGitBranch(),
        buildDate: utils.getBuildDate()
    });
});

module.exports = router;