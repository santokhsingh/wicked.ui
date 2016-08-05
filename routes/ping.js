'use strict';

var express = require('express');
var debug = require('debug')('portal:ping');
var router = express.Router();
var reqUtils = require('./requestUtils');

var _startupSeconds = reqUtils.getUtc();
router.get('/', function (req, res, next) {
    debug("get('/')");
    if (!req.app.initialized) {
        return res.status(503).json({
            name: 'portal',
            message: 'Initializing',
            uptime: 0,
            healthy: false
        });
    }

    // We're initialized, we can access the globals
    var portalUrl = req.app.portalGlobals.network.schema + '://' + req.app.portalGlobals.network.portalHost;
    res.json({
        name: 'portal',
        message: 'Up and running',
        uptime: (reqUtils.getUtc() - _startupSeconds),
        healthy: true,
        pingUrl: portalUrl + '/ping'
    });
});

module.exports = router;