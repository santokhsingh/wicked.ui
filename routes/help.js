'use strict';

var express = require('express');
var { debug, info, warn, error } = require('portal-env').Logger('portal:help');
var path = require('path');
var router = express.Router();

var HELP_IDS = {
    'apis': 'API Index',
    'api': 'API Page',
    'api-access': 'API Access',
    'applications': 'Application Index',
    'application': 'Application Page',
    'application-ownership': 'Application Ownership'
};

router.get('/', function (req, res, next) {
    res.render(path.join('help', 'index'), {
        authUser: req.user,
        glob: req.app.portalGlobals,
        route: '/help',
        title: 'Portal Help',
        helpPages: HELP_IDS
    });
});

router.get('/:helpId', function (req, res, next) {
    var helpId = req.params.helpId;
    debug("get('/help/" + helpId + "')");

    if (!HELP_IDS[helpId])
        return res.status(404).jsonp({ message: 'Not found.' });
    
    res.render(path.join('help', helpId), {
        authUser: req.user,
        glob: req.app.portalGlobals,
        route: '/help/' + helpId,
        title: 'Portal Help'
    });
});

module.exports = router;